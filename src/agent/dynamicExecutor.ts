import { Page } from 'playwright';
import { TestStep, StepResult, AssertionResult, Assertion, BrowserAction } from '../types';
import { BrowserActions } from '../browser/actions';
import { Observer } from './observer';
import { DynamicPlanner, ExecutionHistory } from './dynamicPlanner';
import { LLMClient } from '../llm/llmClient';
import { config } from '../config';
import { LoginDetector } from './loginDetector';
import { SuccessCaseStorage, FailureContext } from '../rag/successCaseStorage';
import { CaseCollector } from '../rag/caseCollector';

export interface DynamicExecutionResult {
  success: boolean;
  goal: string;
  totalSteps: number;
  passedSteps: number;
  failedSteps: number;
  duration: number;
  stepResults: StepResult[];
  conclusion: 'passed' | 'failed' | 'partial';
  finalPageState?: string;
  pausedForLogin?: boolean;
  loginReason?: string;
}

export interface ExecutionState {
  goal: string;
  stepIndex: number;
  history: ExecutionHistory[];
  results: StepResult[];
  predefinedSteps?: BrowserAction[];
  usePredefinedSteps: boolean;
}

export class DynamicExecutor {
  private actions: BrowserActions;
  private observer: Observer;
  private dynamicPlanner: DynamicPlanner;
  private loginDetector: LoginDetector;
  private paused: boolean = false;
  private executionState: ExecutionState | null = null;
  private caseStorage: SuccessCaseStorage;
  private caseCollector: CaseCollector;

  constructor(
    private page: Page,
    llm: LLMClient
  ) {
    this.actions = new BrowserActions(page);
    this.observer = new Observer(page);
    this.dynamicPlanner = new DynamicPlanner(llm, { maxSteps: 20 });
    this.loginDetector = new LoginDetector(llm);
    this.caseStorage = SuccessCaseStorage.getInstance();
    this.caseCollector = new CaseCollector(this.caseStorage, llm);
    
    this.caseStorage.init().catch(err => {
      console.error('[DynamicExecutor] Failed to initialize case storage:', err);
    });
  }

  pause() {
    this.paused = true;
    console.log('[DynamicExecutor] Execution paused');
  }

  resume() {
    this.paused = false;
    console.log('[DynamicExecutor] Execution resumed');
  }

  getExecutionState(): ExecutionState | null {
    return this.executionState;
  }

  setExecutionState(state: ExecutionState) {
    this.executionState = state;
  }

  private async checkForLogin(pageState: string): Promise<{ needsLogin: boolean; reason: string }> {
    const quickResult = this.loginDetector.quickDetectLoginRequired(pageState);
    
    if (quickResult.needsLogin && quickResult.confidence > 0.7) {
      return {
        needsLogin: true,
        reason: quickResult.reason,
      };
    }

    if (quickResult.needsLogin || quickResult.confidence > 0.4) {
      console.log('[DynamicExecutor] Quick detection found login indicators, using LLM for confirmation...');
      const llmResult = await this.loginDetector.detectLoginRequired(pageState);
      
      if (llmResult.needsLogin && llmResult.confidence > 0.6) {
        return {
          needsLogin: true,
          reason: llmResult.reason,
        };
      }
    }

    return { needsLogin: false, reason: '' };
  }

  async executeDynamically(
    goal: string,
    onStepStart?: (step: TestStep, index: number) => void,
    onStepComplete?: (result: StepResult, index: number, pageState: string, action?: BrowserAction, description?: string) => void,
    onLoginRequired?: (reason: string) => void
  ): Promise<DynamicExecutionResult> {
    const startTime = Date.now();
    const results: StepResult[] = [];
    const history: ExecutionHistory[] = [];
    
    let stepIndex = 0;
    let completed = false;
    let consecutiveFailures = 0;
    const maxConsecutiveFailures = 3;

    this.dynamicPlanner.reset();

    while (!completed && stepIndex < 20) {
      if (this.paused) {
        this.executionState = {
          goal,
          stepIndex,
          history,
          results,
          usePredefinedSteps: false,
        };
        
        return {
          success: false,
          goal,
          totalSteps: results.length,
          passedSteps: results.filter(r => r.status === 'passed').length,
          failedSteps: results.filter(r => r.status === 'failed' || r.status === 'error').length,
          duration: Date.now() - startTime,
          stepResults: results,
          conclusion: 'partial',
          pausedForLogin: true,
          loginReason: 'Execution paused by user',
        };
      }

      const pageState = await this.observer.getPageSnapshotForLLM();
      
      const loginCheck = await this.checkForLogin(pageState);
      if (loginCheck.needsLogin) {
        console.log('[DynamicExecutor] Login required detected:', loginCheck.reason);
        
        this.executionState = {
          goal,
          stepIndex,
          history,
          results,
          usePredefinedSteps: false,
        };
        
        if (onLoginRequired) {
          onLoginRequired(loginCheck.reason);
        }
        
        return {
          success: false,
          goal,
          totalSteps: results.length,
          passedSteps: results.filter(r => r.status === 'passed').length,
          failedSteps: results.filter(r => r.status === 'failed' || r.status === 'error').length,
          duration: Date.now() - startTime,
          stepResults: results,
          conclusion: 'partial',
          pausedForLogin: true,
          loginReason: loginCheck.reason,
        };
      }
      
      const nextStep = await this.dynamicPlanner.getNextStep(
        goal,
        pageState,
        history
      );

      if (nextStep.completed) {
        completed = true;
        break;
      }

      if (!nextStep.action) {
        console.error('No action returned from planner');
        break;
      }

      const testStep: TestStep = {
        id: nextStep.stepId,
        description: nextStep.description || 'Dynamic step',
        action: nextStep.action,
        expectedResult: nextStep.expectedResult || '',
        assertions: [],
        timeout: 10000,
      };

      if (onStepStart) {
        onStepStart(testStep, stepIndex);
      }

      const result = await this.executeStep(testStep, nextStep.action, testStep.description);
      results.push(result);

      const historyEntry: ExecutionHistory = {
        stepIndex,
        action: nextStep.action,
        description: testStep.description,
        result: result.status,
        error: result.error,
      };
      history.push(historyEntry);

      const newPageState = await this.observer.getPageSnapshotForLLM();

      if (onStepComplete) {
        onStepComplete(result, stepIndex, newPageState, nextStep.action, testStep.description);
      }

      if (result.status === 'error') {
        consecutiveFailures++;
        console.log(`[DynamicExecutor] Step failed, consecutive failures: ${consecutiveFailures}/${maxConsecutiveFailures}`);
        
        if (consecutiveFailures >= maxConsecutiveFailures) {
          console.log('[DynamicExecutor] Max consecutive failures reached, stopping execution');
          break;
        }
        
        const shouldContinue = await this.dynamicPlanner.shouldContinue(
          goal,
          newPageState,
          historyEntry
        );
        
        if (!shouldContinue) {
          break;
        }
      } else {
        consecutiveFailures = 0;
      }

      stepIndex++;
    }

    const totalDuration = Date.now() - startTime;
    const passedSteps = results.filter(r => r.status === 'passed').length;
    const failedSteps = results.filter(r => r.status === 'failed' || r.status === 'error').length;

    let conclusion: 'passed' | 'failed' | 'partial';
    if (failedSteps === 0) {
      conclusion = 'passed';
    } else if (passedSteps === 0) {
      conclusion = 'failed';
    } else {
      conclusion = 'partial';
    }

    const finalPageState = await this.observer.getPageSnapshotForLLM();

    if (conclusion === 'partial' || conclusion === 'passed') {
      await this.collectSuccessCases(goal, history, results);
    }

    return {
      success: conclusion === 'passed',
      goal,
      totalSteps: results.length,
      passedSteps,
      failedSteps,
      duration: totalDuration,
      stepResults: results,
      conclusion,
      finalPageState,
    };
  }

  private async executeStep(step: TestStep, action?: BrowserAction, description?: string): Promise<StepResult> {
    const startTime = Date.now();

    try {
      await this.performAction(step.action);

      const isNavigationOrClick = this.isNavigationOrClickAction(step.action);
      
      if (isNavigationOrClick) {
        console.log(`[DynamicExecutor] Detected navigation/click action, waiting for page to stabilize...`);
        await this.waitForPageStability();
        await this.waitForAdditionalPageLoad();
      } else {
        await this.waitForPageStability();
      }

      const screenshot = config.screenshot.onSuccess
        ? await this.observer.takeScreenshot(step.id)
        : undefined;

      const observations = await this.observer.getPageSnapshotForLLM();

      return {
        stepId: step.id,
        status: 'passed',
        duration: Date.now() - startTime,
        screenshot,
        observations,
        action,
        description,
      };
    } catch (error: any) {
      const screenshot = config.screenshot.onFailure
        ? await this.observer.takeScreenshot(`${step.id}-error`)
        : undefined;

      return {
        stepId: step.id,
        status: 'error',
        duration: Date.now() - startTime,
        error: error.message || String(error),
        screenshot,
        action,
        description,
      };
    }
  }

  private isNavigationOrClickAction(action: BrowserAction): boolean {
    return action.type === 'navigate' || action.type === 'click';
  }

  private async waitForAdditionalPageLoad(): Promise<void> {
    try {
      await this.page.waitForLoadState('load', { timeout: 10000 });
      console.log(`[DynamicExecutor] Page load completed`);
    } catch {
      console.log(`[DynamicExecutor] Page load timeout, continuing...`);
    }

    try {
      await this.page.waitForLoadState('networkidle', { timeout: 10000 });
      console.log(`[DynamicExecutor] Network idle achieved`);
    } catch {
      console.log(`[DynamicExecutor] Network idle timeout, continuing...`);
    }

    await this.page.waitForTimeout(1000);

    try {
      await this.page.waitForLoadState('networkidle', { timeout: 5000 });
      console.log(`[DynamicExecutor] Additional network idle check passed`);
    } catch {
      console.log(`[DynamicExecutor] Additional network idle timeout, continuing...`);
    }
  }

  private async performAction(action: TestStep['action']): Promise<void> {
    await this.actions.perform(action);
  }

  private async waitForPageStability(): Promise<void> {
    try {
      await this.page.waitForLoadState('domcontentloaded', { timeout: 8000 });
    } catch {
      // Ignore timeout
    }

    try {
      await this.page.waitForLoadState('networkidle', { timeout: 5000 });
    } catch {
      // Ignore timeout
    }
  }

  async executeWithPredefinedSteps(
    goal: string,
    predefinedSteps: BrowserAction[],
    onStepStart?: (step: TestStep, index: number) => void,
    onStepComplete?: (result: StepResult, index: number, pageState: string, action?: BrowserAction, description?: string) => void,
    onLoginRequired?: (reason: string) => void
  ): Promise<DynamicExecutionResult> {
    const startTime = Date.now();
    const results: StepResult[] = [];
    const history: ExecutionHistory[] = [];
    
    let stepIndex = 0;
    let completed = false;
    let usePredefinedSteps = true;
    let consecutiveFailures = 0;
    const maxConsecutiveFailures = 3;

    this.dynamicPlanner.reset();

    while (!completed && stepIndex < 20) {
      if (this.paused) {
        this.executionState = {
          goal,
          stepIndex,
          history,
          results,
          predefinedSteps,
          usePredefinedSteps,
        };
        
        return {
          success: false,
          goal,
          totalSteps: results.length,
          passedSteps: results.filter(r => r.status === 'passed').length,
          failedSteps: results.filter(r => r.status === 'failed' || r.status === 'error').length,
          duration: Date.now() - startTime,
          stepResults: results,
          conclusion: 'partial',
          pausedForLogin: true,
          loginReason: 'Execution paused by user',
        };
      }

      const pageState = await this.observer.getPageSnapshotForLLM();
      
      const loginCheck = await this.checkForLogin(pageState);
      if (loginCheck.needsLogin) {
        console.log('[DynamicExecutor] Login required detected:', loginCheck.reason);
        
        this.executionState = {
          goal,
          stepIndex,
          history,
          results,
          predefinedSteps,
          usePredefinedSteps,
        };
        
        if (onLoginRequired) {
          onLoginRequired(loginCheck.reason);
        }
        
        return {
          success: false,
          goal,
          totalSteps: results.length,
          passedSteps: results.filter(r => r.status === 'passed').length,
          failedSteps: results.filter(r => r.status === 'failed' || r.status === 'error').length,
          duration: Date.now() - startTime,
          stepResults: results,
          conclusion: 'partial',
          pausedForLogin: true,
          loginReason: loginCheck.reason,
        };
      }
      
      let nextStep: { action?: BrowserAction; description?: string; stepId: string; expectedResult?: string; completed?: boolean };

      if (usePredefinedSteps && stepIndex < predefinedSteps.length) {
        const action = predefinedSteps[stepIndex];
        nextStep = {
          action,
          description: `Predefined step ${stepIndex + 1}`,
          stepId: `predefined-step-${stepIndex}`,
        };
      } else {
        usePredefinedSteps = false;
        nextStep = await this.dynamicPlanner.getNextStep(
          goal,
          pageState,
          history
        );

        if (nextStep.completed) {
          completed = true;
          break;
        }

        if (!nextStep.action) {
          console.error('No action returned from planner');
          break;
        }
      }

      const testStep: TestStep = {
        id: nextStep.stepId,
        description: nextStep.description || 'Dynamic step',
        action: nextStep.action!,
        expectedResult: nextStep.expectedResult || '',
        assertions: [],
        timeout: 10000,
      };

      if (onStepStart) {
        onStepStart(testStep, stepIndex);
      }

      const result = await this.executeStep(testStep, nextStep.action, testStep.description);
      results.push(result);

      const historyEntry: ExecutionHistory = {
        stepIndex,
        action: nextStep.action!,
        description: testStep.description,
        result: result.status,
        error: result.error,
      };
      history.push(historyEntry);

      const newPageState = await this.observer.getPageSnapshotForLLM();

      if (onStepComplete) {
        onStepComplete(result, stepIndex, newPageState, nextStep.action, testStep.description);
      }

      if (result.status === 'error' && usePredefinedSteps) {
        consecutiveFailures++;
        console.log(`[DynamicExecutor] Predefined step failed, consecutive failures: ${consecutiveFailures}/${maxConsecutiveFailures}`);
        
        if (consecutiveFailures >= maxConsecutiveFailures) {
          console.log('[DynamicExecutor] Max consecutive failures reached, stopping execution');
          break;
        }
        
        console.log(`[DynamicExecutor] Predefined step failed, switching to dynamic planning...`);
        usePredefinedSteps = false;
        
        const shouldContinue = await this.dynamicPlanner.shouldContinue(
          goal,
          newPageState,
          historyEntry
        );
        
        if (!shouldContinue) {
          break;
        }
      } else if (result.status === 'error') {
        consecutiveFailures++;
        console.log(`[DynamicExecutor] Step failed, consecutive failures: ${consecutiveFailures}/${maxConsecutiveFailures}`);
        
        if (consecutiveFailures >= maxConsecutiveFailures) {
          console.log('[DynamicExecutor] Max consecutive failures reached, stopping execution');
          break;
        }
        
        const shouldContinue = await this.dynamicPlanner.shouldContinue(
          goal,
          newPageState,
          historyEntry
        );
        
        if (!shouldContinue) {
          break;
        }
      } else {
        consecutiveFailures = 0;
      }

      stepIndex++;
    }

    const totalDuration = Date.now() - startTime;
    const passedSteps = results.filter(r => r.status === 'passed').length;
    const failedSteps = results.filter(r => r.status === 'failed' || r.status === 'error').length;

    let conclusion: 'passed' | 'failed' | 'partial';
    if (failedSteps === 0) {
      conclusion = 'passed';
    } else if (passedSteps === 0) {
      conclusion = 'failed';
    } else {
      conclusion = 'partial';
    }

    const finalPageState = await this.observer.getPageSnapshotForLLM();

    if (conclusion === 'partial' || conclusion === 'passed') {
      await this.collectSuccessCases(goal, history, results);
    }

    return {
      success: conclusion === 'passed',
      goal,
      totalSteps: results.length,
      passedSteps,
      failedSteps,
      duration: totalDuration,
      stepResults: results,
      conclusion,
      finalPageState,
    };
  }

  private async collectSuccessCases(
    goal: string,
    history: ExecutionHistory[],
    results: StepResult[]
  ): Promise<void> {
    console.log('[DynamicExecutor] Collecting success cases from execution...');

    const failedEntries = history.filter(h => h.result === 'error' || h.result === 'failed');
    
    if (failedEntries.length === 0) {
      console.log('[DynamicExecutor] No failed steps found, skipping collection');
      return;
    }

    for (const failedEntry of failedEntries) {
      const failedIndex = history.indexOf(failedEntry);
      const subsequentHistory = history.slice(failedIndex + 1);
      const subsequentResults = results.slice(failedIndex + 1);

      if (subsequentHistory.length >= 2) {
        const successCount = subsequentResults.filter(r => r.status === 'passed').length;
        
        if (successCount >= 1) {
          const failedStep = this.findStepByIndex(results, failedIndex);
          
          if (!failedStep) {
            continue;
          }

          const failureContext: FailureContext = {
            goal,
            failedStep,
            failureReason: failedEntry.error || 'Unknown error',
            pageState: '',
            errorType: this.classifyError(failedEntry.error || '')
          };

          const retrySteps = subsequentHistory.map(h => ({
            id: `retry-step-${h.stepIndex}`,
            description: h.description,
            action: h.action,
            expectedResult: '',
            assertions: [],
            timeout: 10000,
          }));

          await this.caseCollector.collectSuccessCase(
            failureContext,
            retrySteps,
            subsequentResults
          );
        }
      }
    }
  }

  private findStepByIndex(results: StepResult[], index: number): TestStep | null {
    const result = results[index];
    
    if (!result) {
      return null;
    }

    return {
      id: result.stepId,
      description: result.description || 'Unknown step',
      action: result.action || { type: 'wait', ms: 0 },
      expectedResult: '',
      assertions: [],
      timeout: 10000
    };
  }

  private classifyError(error: string): string {
    if (error.includes('timeout') || error.includes('Timeout')) {
      return 'timeout';
    }
    if (error.includes('selector') || error.includes('not found') || error.includes('No element')) {
      return 'element-not-found';
    }
    if (error.includes('navigation') || error.includes('Navigation')) {
      return 'navigation';
    }
    if (error.includes('click') || error.includes('Click')) {
      return 'click-failure';
    }
    if (error.includes('fill') || error.includes('Fill')) {
      return 'fill-failure';
    }
    if (error.includes('assertion') || error.includes('Assertion')) {
      return 'assertion-failure';
    }
    if (error.includes('network') || error.includes('Network')) {
      return 'network-error';
    }
    
    return 'unknown';
  }
}

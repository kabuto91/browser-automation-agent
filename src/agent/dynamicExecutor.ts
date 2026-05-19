import { Page } from 'playwright';
import { TestStep, StepResult, AssertionResult, Assertion, BrowserAction } from '../types';
import { BrowserActions } from '../browser/actions';
import { Observer } from './observer';
import { DynamicPlanner, ExecutionHistory } from './dynamicPlanner';
import { LLMClient } from '../llm/llmClient';
import { config } from '../config';

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
}

export class DynamicExecutor {
  private actions: BrowserActions;
  private observer: Observer;
  private dynamicPlanner: DynamicPlanner;

  constructor(
    private page: Page,
    llm: LLMClient
  ) {
    this.actions = new BrowserActions(page);
    this.observer = new Observer(page);
    this.dynamicPlanner = new DynamicPlanner(llm, { maxSteps: 20 });
  }

  async executeDynamically(
    goal: string,
    onStepStart?: (step: TestStep, index: number) => void,
    onStepComplete?: (result: StepResult, index: number, pageState: string, action?: BrowserAction, description?: string) => void
  ): Promise<DynamicExecutionResult> {
    const startTime = Date.now();
    const results: StepResult[] = [];
    const history: ExecutionHistory[] = [];
    
    let stepIndex = 0;
    let completed = false;

    while (!completed && stepIndex < 20) {
      const pageState = await this.observer.getPageSnapshotForLLM();
      
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
        const shouldContinue = await this.dynamicPlanner.shouldContinue(
          goal,
          newPageState,
          historyEntry
        );
        
        if (!shouldContinue) {
          break;
        }
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
      await this.page.waitForLoadState('load', { timeout: 5000 });
      console.log(`[DynamicExecutor] Page load completed`);
    } catch {
      console.log(`[DynamicExecutor] Page load timeout, continuing...`);
    }

    try {
      await this.page.waitForLoadState('networkidle', { timeout: 5000 });
      console.log(`[DynamicExecutor] Network idle achieved`);
    } catch {
      console.log(`[DynamicExecutor] Network idle timeout, continuing...`);
    }

    await this.page.waitForTimeout(500);
  }

  private async performAction(action: TestStep['action']): Promise<void> {
    await this.actions.perform(action);
  }

  private async waitForPageStability(): Promise<void> {
    try {
      await this.page.waitForLoadState('domcontentloaded', { timeout: 5000 });
    } catch {
      // Ignore timeout
    }

    try {
      await this.page.waitForLoadState('networkidle', { timeout: 3000 });
    } catch {
      // Ignore timeout
    }
  }

  async executeWithPredefinedSteps(
    goal: string,
    predefinedSteps: BrowserAction[],
    onStepStart?: (step: TestStep, index: number) => void,
    onStepComplete?: (result: StepResult, index: number, pageState: string, action?: BrowserAction, description?: string) => void
  ): Promise<DynamicExecutionResult> {
    const startTime = Date.now();
    const results: StepResult[] = [];
    const history: ExecutionHistory[] = [];
    
    let stepIndex = 0;
    let completed = false;
    let usePredefinedSteps = true;

    while (!completed && stepIndex < 20) {
      const pageState = await this.observer.getPageSnapshotForLLM();
      
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
        const shouldContinue = await this.dynamicPlanner.shouldContinue(
          goal,
          newPageState,
          historyEntry
        );
        
        if (!shouldContinue) {
          break;
        }
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
}

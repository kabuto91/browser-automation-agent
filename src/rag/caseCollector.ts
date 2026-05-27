import { LLMClient } from '../llm/llmClient';
import { SuccessCaseStorage, SuccessCase, FailureContext } from './successCaseStorage';
import { TestStep, StepResult, BrowserAction } from '../types';

export class CaseCollector {
  constructor(
    private storage: SuccessCaseStorage,
    private llm: LLMClient
  ) {}

  async collectSuccessCase(
    originalFailure: FailureContext,
    retrySteps: TestStep[],
    retryResults: StepResult[]
  ): Promise<void> {
    console.log('[CaseCollector] Evaluating success case for collection...');

    if (!this.shouldCollect(retryResults)) {
      console.log('[CaseCollector] Case not worth collecting, skipping');
      return;
    }

    console.log('[CaseCollector] Collecting success case...');

    const successCase: SuccessCase = {
      id: this.generateCaseId(),
      failureContext: originalFailure,
      successSolution: {
        retrySteps,
        successfulActions: this.extractSuccessfulActions(retryResults),
        recoveryStrategy: await this.generateStrategyDescription(
          originalFailure,
          retrySteps,
          retryResults
        ),
        totalRetryTime: this.calculateTotalTime(retryResults)
      },
      metadata: {
        createdAt: new Date(),
        useCount: 0,
        successRate: 1.0,
        tags: await this.generateTags(originalFailure),
      }
    };

    await this.storage.saveSuccessCase(successCase);

    console.log('[CaseCollector] Success case collected:', successCase.id);
    console.log('[CaseCollector] Recovery strategy:', successCase.successSolution.recoveryStrategy);
  }

  private shouldCollect(retryResults: StepResult[]): boolean {
    const successCount = retryResults.filter(r => r.status === 'passed').length;
    const hasMultipleSteps = retryResults.length >= 2;
    const hasAtLeastOneSuccess = successCount > 0;
    
    return hasMultipleSteps && hasAtLeastOneSuccess;
  }

  private generateCaseId(): string {
    return `case-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private extractSuccessfulActions(retryResults: StepResult[]): BrowserAction[] {
    return retryResults
      .filter(r => r.status === 'passed' && r.action)
      .map(r => r.action!);
  }

  private async generateStrategyDescription(
    failure: FailureContext,
    retrySteps: TestStep[],
    retryResults: StepResult[]
  ): Promise<string> {
    const successSteps = retryResults.filter(r => r.status === 'passed');
    const failedSteps = retryResults.filter(r => r.status === 'failed');

    const prompt = `Analyze the following test failure recovery scenario and generate a concise strategy description (1-2 sentences):

Original Failure:
- Goal: ${failure.goal}
- Failed Step: ${failure.failedStep.description}
- Error: ${failure.failureReason}
- Error Type: ${failure.errorType}

Recovery Steps:
- Total Retry Steps: ${retrySteps.length}
- Successful Steps: ${successSteps.length}
- Failed Steps: ${failedSteps.length}

Successful Actions:
${successSteps.map((r, i) => `${i + 1}. ${r.description || 'Unknown step'}`).join('\n')}

Please describe the recovery strategy in 1-2 sentences, focusing on what worked.`;

    try {
      const response = await this.llm.chat(
        'You are a test strategy summarizer. Provide concise, actionable strategy descriptions.',
        prompt
      );

      return response.trim();
    } catch (error) {
      console.error('[CaseCollector] Failed to generate strategy description:', error);
      
      return `Retry with ${retrySteps.length} steps, ${successSteps.length} succeeded`;
    }
  }

  private async generateTags(failure: FailureContext): Promise<string[]> {
    const tags: string[] = [];

    tags.push(failure.errorType);

    if (failure.failureReason.includes('timeout')) {
      tags.push('timeout');
    }
    if (failure.failureReason.includes('selector')) {
      tags.push('selector');
    }
    if (failure.failureReason.includes('navigation')) {
      tags.push('navigation');
    }
    if (failure.failureReason.includes('click')) {
      tags.push('click');
    }
    if (failure.failureReason.includes('wait')) {
      tags.push('wait');
    }

    if (failure.failedStep.action.type === 'navigate') {
      tags.push('navigation-action');
    } else if (failure.failedStep.action.type === 'click') {
      tags.push('click-action');
    } else if (failure.failedStep.action.type === 'type') {
      tags.push('type-action');
    }

    const uniqueTags = [...new Set(tags)];
    
    console.log('[CaseCollector] Generated tags:', uniqueTags);
    
    return uniqueTags;
  }

  private calculateTotalTime(retryResults: StepResult[]): number {
    return retryResults.reduce((total, r) => total + (r.duration || 0), 0);
  }

  async collectFromExecutionHistory(
    goal: string,
    history: Array<{
      step: TestStep;
      result: StepResult;
      pageState: string;
    }>
  ): Promise<void> {
    console.log('[CaseCollector] Analyzing execution history for collection...');

    const failedSteps = history.filter(h => h.result.status === 'failed');
    
    if (failedSteps.length === 0) {
      console.log('[CaseCollector] No failed steps found, skipping collection');
      return;
    }

    for (const failedEntry of failedSteps) {
      const subsequentSteps = history.slice(history.indexOf(failedEntry) + 1);
      
      if (subsequentSteps.length >= 2) {
        const successCount = subsequentSteps.filter(h => h.result.status === 'passed').length;
        
        if (successCount >= 1) {
          const failureContext: FailureContext = {
            goal,
            failedStep: failedEntry.step,
            failureReason: failedEntry.result.error || 'Unknown error',
            pageState: failedEntry.pageState,
            errorType: this.classifyError(failedEntry.result.error || '')
          };

          const retrySteps = subsequentSteps.map(h => h.step);
          const retryResults = subsequentSteps.map(h => h.result);

          await this.collectSuccessCase(failureContext, retrySteps, retryResults);
        }
      }
    }
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
import { LLMClient } from '../llm/llmClient';
import { TestPlan, TestStep, StepResult, ReplanDecision } from '../types';
import { HybridRetriever } from '../rag/hybridRetriever';
import { SuccessCase, FailureContext } from '../rag/successCaseStorage';

const REPLANNER_SYSTEM_PROMPT = `You are a test replanning expert. A step in the current test plan has failed. Based on the failure information and page state, determine:
1. Whether the remaining steps need to be adjusted
2. If adjustment is needed, provide the adjusted subsequent steps (JSON format)

Important: Only output valid JSON, no other text.

Output format:
If adjustment is needed:
{ "needReplan": true, "adjustedSteps": [ ... ] }

If no adjustment is needed (can skip, retry, or abort):
{ "needReplan": false, "action": "skip" | "retry" | "abort" }

Guidelines:
- "skip": Skip the failed step and continue with remaining steps
- "retry": Retry the same step (useful for transient failures)
- "abort": Stop the entire test (critical failure that cannot be recovered)
- "adjustedSteps": Provide new steps to replace the remaining steps

When to adjust:
- The page structure has changed and selectors need updating
- Additional steps are needed to recover from the failure
- The original plan was incorrect and needs correction

When NOT to adjust:
- The failure is transient (network timeout, slow loading)
- The failure is critical and cannot be recovered (wrong URL, missing critical element)
- The remaining steps are still valid`;

const REPLANNER_SYSTEM_PROMPT_WITH_RAG = `You are a test replanning expert with access to historical success cases.

When a step fails, you can reference similar past failures and their successful solutions.

Historical Success Cases (if available):
{successCases}

Current Failure:
{currentFailure}

Based on the historical cases and current failure, determine:
1. Whether to use a similar solution from historical cases
2. If adjustment is needed, provide adjusted steps
3. If no adjustment needed, specify action (skip/retry/abort)

Output format (JSON only):
{
  "needReplan": boolean,
  "action": "skip" | "retry" | "abort" | "useHistoricalCase",
  "historicalCaseId": string (if using historical case),
  "adjustedSteps": [...] (if providing new steps),
  "reason": string
}`;

export class Replanner {
  constructor(
    private llm: LLMClient,
    private retriever?: HybridRetriever
  ) {}

  async evaluate(
    plan: TestPlan,
    failedStep: StepResult,
    executedResults: StepResult[],
    pageState: string
  ): Promise<ReplanDecision> {
    console.log('[Replanner] Evaluating failure for replanning...');

    if (this.retriever) {
      console.log('[Replanner] Using RAG-enhanced replanning...');
      return await this.evaluateWithRAG(plan, failedStep, executedResults, pageState);
    }

    console.log('[Replanner] Using standard replanning...');
    return await this.evaluateStandard(plan, failedStep, executedResults, pageState);
  }

  private async evaluateWithRAG(
    plan: TestPlan,
    failedStep: StepResult,
    executedResults: StepResult[],
    pageState: string
  ): Promise<ReplanDecision> {
    const failureContext: FailureContext = {
      goal: plan.goal,
      failedStep: this.findFailedStep(plan, failedStep),
      failureReason: failedStep.error || 'Unknown error',
      pageState,
      errorType: this.classifyError(failedStep.error || '')
    };

    console.log('[Replanner] Failure context:', {
      errorType: failureContext.errorType,
      failureReason: failureContext.failureReason.slice(0, 100)
    });

    const similarCases = await this.retriever!.retrieveSimilarCases(failureContext);

    console.log('[Replanner] Retrieved', similarCases.length, 'similar cases');

    const prompt = this.buildPromptWithCases(
      plan,
      failedStep,
      executedResults,
      pageState,
      similarCases
    );

    try {
      const response = await this.llm.chat(REPLANNER_SYSTEM_PROMPT_WITH_RAG, prompt);
      const decision = this.parseResponseWithRAG(response, similarCases);

      if (decision.historicalCaseId) {
        console.log('[Replanner] Using historical case:', decision.historicalCaseId);
      }

      return decision;
    } catch (error) {
      console.error('[Replanner] RAG-enhanced replanning failed:', error);
      return await this.evaluateStandard(plan, failedStep, executedResults, pageState);
    }
  }

  private async evaluateStandard(
    plan: TestPlan,
    failedStep: StepResult,
    executedResults: StepResult[],
    pageState: string
  ): Promise<ReplanDecision> {
    const prompt = this.buildPrompt(
      plan, 
      failedStep, 
      executedResults, 
      pageState
    );

    try {
      const response = await this.llm.chat(REPLANNER_SYSTEM_PROMPT, prompt);
      const decision = this.parseResponse(response);
      return decision;
    } catch (error) {
      console.error('Replanner failed:', error);
      return { needReplan: false, action: 'skip' };
    }
  }

  private buildPrompt(
    plan: TestPlan,
    failedStep: StepResult,
    executedResults: StepResult[],
    pageState: string
  ): string {
    const executedStepsInfo = executedResults.map((r, i) => ({
      stepIndex: i + 1,
      stepId: r.stepId,
      status: r.status,
      error: r.error,
    }));

    const failedStepInfo = {
      stepId: failedStep.stepId,
      status: failedStep.status,
      error: failedStep.error,
      assertionResults: failedStep.assertionResults,
    };

    const remainingSteps = plan.steps
      .filter(s => !executedResults.find(r => r.stepId === s.id))
      .map((s, i) => ({
        index: i + 1,
        description: s.description,
        action: s.action,
      }));

    return `
Current test goal: ${plan.goal}

Executed steps and results:
${JSON.stringify(executedStepsInfo, null, 2)}

Failed step details:
${JSON.stringify(failedStepInfo, null, 2)}

Remaining steps:
${JSON.stringify(remainingSteps, null, 2)}

Current page state:
${pageState}

Please analyze the situation and provide your decision.
`;
  }

  private buildPromptWithCases(
    plan: TestPlan,
    failedStep: StepResult,
    executedResults: StepResult[],
    pageState: string,
    similarCases: SuccessCase[]
  ): string {
    const casesSection = similarCases.length > 0
      ? this.formatSuccessCases(similarCases)
      : 'No similar historical cases found.';

    const executedStepsInfo = executedResults.map((r, i) => ({
      stepIndex: i + 1,
      stepId: r.stepId,
      status: r.status,
      error: r.error,
    }));

    const failedStepInfo = {
      stepId: failedStep.stepId,
      status: failedStep.status,
      error: failedStep.error,
      assertionResults: failedStep.assertionResults,
    };

    const remainingSteps = plan.steps
      .filter(s => !executedResults.find(r => r.stepId === s.id))
      .map((s, i) => ({
        index: i + 1,
        description: s.description,
        action: s.action,
      }));

    return `
Historical Success Cases:
${casesSection}

Current Test Plan:
Goal: ${plan.goal}

Executed steps and results:
${JSON.stringify(executedStepsInfo, null, 2)}

Failed step details:
${JSON.stringify(failedStepInfo, null, 2)}

Remaining steps:
${JSON.stringify(remainingSteps, null, 2)}

Current page state:
${pageState.slice(0, 500)}

Please analyze and provide replanning decision.
`;
  }

  private formatSuccessCases(cases: SuccessCase[]): string {
    return cases.map((successCase, index) => `
Case ${index + 1} (ID: ${successCase.id}):
- Failure: ${successCase.failureContext.failureReason}
- Solution: ${successCase.successSolution.recoveryStrategy}
- Steps: ${successCase.successSolution.retrySteps.map(s => s.description).join(', ')}
- Success Rate: ${successCase.metadata.successRate * 100}%
- Used: ${successCase.metadata.useCount} times
`).join('\n');
  }

  private parseResponse(response: string): ReplanDecision {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      
      if (parsed.needReplan && parsed.adjustedSteps) {
        const adjustedSteps: TestStep[] = parsed.adjustedSteps.map(
          (s: any, i: number) => ({
            id: `replan-step-${Date.now()}-${i + 1}`,
            description: s.description,
            action: s.action,
            expectedResult: s.expectedResult || '',
            assertions: s.assertions || [],
            timeout: s.timeout || 10000,
          })
        );
        
        return { needReplan: true, adjustedSteps };
      }
      
      return { 
        needReplan: false, 
        action: parsed.action || 'skip' 
      };
    } catch (error) {
      console.error('Failed to parse replanner response:', response);
      return { needReplan: false, action: 'skip' };
    }
  }

  private parseResponseWithRAG(
    response: string,
    similarCases: SuccessCase[]
  ): ReplanDecision {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      
      if (parsed.action === 'useHistoricalCase' && parsed.historicalCaseId) {
        const historicalCase = similarCases.find(
          c => c.id === parsed.historicalCaseId
        );

        if (historicalCase) {
          console.log('[Replanner] Using historical case solution:', 
            historicalCase.successSolution.recoveryStrategy);

          const adjustedSteps: TestStep[] = historicalCase.successSolution.retrySteps.map(
            (s, i) => ({
              id: `historical-step-${Date.now()}-${i + 1}`,
              description: s.description,
              action: s.action,
              expectedResult: s.expectedResult || '',
              assertions: s.assertions || [],
              timeout: s.timeout || 10000,
            })
          );

          return {
            needReplan: true,
            adjustedSteps,
            historicalCaseId: parsed.historicalCaseId,
            reason: parsed.reason || 'Using historical success case'
          };
        }
      }

      if (parsed.needReplan && parsed.adjustedSteps) {
        const adjustedSteps: TestStep[] = parsed.adjustedSteps.map(
          (s: any, i: number) => ({
            id: `replan-step-${Date.now()}-${i + 1}`,
            description: s.description,
            action: s.action,
            expectedResult: s.expectedResult || '',
            assertions: s.assertions || [],
            timeout: s.timeout || 10000,
          })
        );
        
        return { 
          needReplan: true, 
          adjustedSteps,
          reason: parsed.reason 
        };
      }
      
      return { 
        needReplan: false, 
        action: parsed.action || 'skip',
        reason: parsed.reason
      };
    } catch (error) {
      console.error('Failed to parse RAG-enhanced replanner response:', response);
      return { needReplan: false, action: 'skip' };
    }
  }

  private findFailedStep(plan: TestPlan, failedStepResult: StepResult): TestStep {
    const step = plan.steps.find(s => s.id === failedStepResult.stepId);
    
    if (!step) {
      return {
        id: failedStepResult.stepId,
        description: 'Unknown step',
        action: { type: 'wait', ms: 0 },
        expectedResult: '',
        assertions: [],
        timeout: 10000
      };
    }

    return step;
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

  async suggestAlternativeSelector(
    originalSelector: string,
    elementDescription: string,
    pageState: string
  ): Promise<string | null> {
    const prompt = `
Original selector that failed: ${originalSelector}
Element description: ${elementDescription}
Current page state: ${pageState}

Please suggest an alternative CSS selector for this element. 
Output only the selector string, nothing else.
If no good alternative exists, output "null".
`;

    try {
      const response = await this.llm.chat(
        'You are a CSS selector expert. Output only the selector or "null".',
        prompt
      );
      
      const trimmed = response.trim();
      if (trimmed === 'null' || trimmed === '') {
        return null;
      }
      
      return trimmed;
    } catch (error) {
      console.error('Failed to suggest alternative selector:', error);
      return null;
    }
  }
}

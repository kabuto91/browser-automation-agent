import { LLMClient } from '../llm/llmClient';
import { TestPlan, TestStep, StepResult, ReplanDecision } from '../types';

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

export class Replanner {
  constructor(private llm: LLMClient) {}

  async evaluate(
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

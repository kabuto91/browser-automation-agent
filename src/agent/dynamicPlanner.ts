import { LLMClient } from '../llm/llmClient';
import { TestStep, BrowserAction } from '../types';

const DYNAMIC_PLANNER_PROMPT = `You are an intelligent browser automation agent. Based on the current page state and the test goal, determine the next action to take.

You will receive:
1. The test goal
2. The current page state (URL, title, interactive elements)
3. Actions already taken

Your task is to determine the SINGLE NEXT action that moves towards completing the goal.

Output format (JSON only, no other text):
{
  "reasoning": "Brief explanation of why this action is chosen",
  "completed": false,
  "action": { "type": "...", ... },
  "description": "Human-readable description of this step",
  "expectedResult": "What should happen after this action"
}

If the goal is already achieved, output:
{
  "reasoning": "Explanation of why the goal is complete",
  "completed": true
}

Available action types:
- navigate: { "type": "navigate", "url": "..." }
- click: { "type": "click", "selector": "CSS selector" }
- type: { "type": "type", "selector": "CSS selector", "text": "input content" }
- wait: { "type": "wait", "selector": "CSS selector" } or { "type": "wait", "ms": milliseconds }
- screenshot: { "type": "screenshot", "name": "screenshot name" }
- hover: { "type": "hover", "selector": "CSS selector" }
- press: { "type": "press", "key": "Enter|Escape|Tab|..." }
- scroll: { "type": "scroll", "selector": "CSS selector" }
- select: { "type": "select", "selector": "CSS selector", "value": "option value" }

Selector guidelines:
- Use the exact selector provided in the page state
- Prefer data-testid, id, or aria-label selectors when available
- For buttons/links, you can use text content: button:has-text("Submit")
- For inputs, use name, placeholder, or id attributes
- For search results, use the link selector from the page state (e.g., a[href*="..."] or the provided link selector)

Special scenarios:
1. Search operations:
   - After typing in search input, press Enter key to submit: { "type": "press", "key": "Enter" }
   - Wait for search results to load: { "type": "wait", "ms": 2000 }
   - Click on search result links using the selector from page state

2. Dynamic content:
   - If elements are not immediately visible, use wait action first
   - After navigation/click actions, the page may need time to stabilize

3. Error recovery:
   - If a selector fails, try alternative selectors from the page state
   - Use scroll to bring elements into view if needed

Important:
- Only output valid JSON
- Choose ONE action at a time
- Consider the current page state carefully
- If an element you need is not visible, you may need to scroll or wait first
- After clicking links or navigating, always consider that the page state will change`;

export interface DynamicStep {
  reasoning: string;
  completed: boolean;
  action?: BrowserAction;
  description?: string;
  expectedResult?: string;
}

export interface ExecutionHistory {
  stepIndex: number;
  action: BrowserAction;
  description: string;
  result: 'passed' | 'failed' | 'skipped' | 'error';
  error?: string;
}

export class DynamicPlanner {
  private stepCount: number = 0;
  private maxSteps: number;

  constructor(
    private llm: LLMClient,
    options?: { maxSteps?: number }
  ) {
    this.maxSteps = options?.maxSteps || 20;
  }

  async getNextStep(
    goal: string,
    pageState: string,
    history: ExecutionHistory[]
  ): Promise<DynamicStep & { stepId: string }> {
    if (this.stepCount >= this.maxSteps) {
      return {
        reasoning: 'Maximum steps reached',
        completed: true,
        stepId: `step-${this.stepCount}`,
      };
    }

    const historySummary = history.length > 0
      ? history.map(h => 
          `${h.stepIndex + 1}. ${h.description} -> ${h.result}${h.error ? ` (${h.error})` : ''}`
        ).join('\n')
      : 'None';

    const prompt = `Test Goal: ${goal}

Current Page State:
${pageState}

Actions Already Taken:
${historySummary}

Determine the next action to take.`;

    const response = await this.llm.chat(DYNAMIC_PLANNER_PROMPT, prompt);
    
    const parsed = this.parseResponse(response);
    
    this.stepCount++;
    
    return {
      ...parsed,
      stepId: `dynamic-step-${this.stepCount}`,
    };
  }

  async shouldContinue(
    goal: string,
    pageState: string,
    lastResult: ExecutionHistory
  ): Promise<boolean> {
    if (lastResult.result === 'error') {
      const prompt = `Test Goal: ${goal}

Current Page State:
${pageState}

Last action failed: ${lastResult.description}
Error: ${lastResult.error}

Should we continue trying to achieve the goal? Answer only "yes" or "no".`;

      const response = await this.llm.chat(
        'You are a test recovery expert. Answer only "yes" or "no".',
        prompt
      );
      
      return response.toLowerCase().includes('yes');
    }
    
    return true;
  }

  private parseResponse(response: string): DynamicStep {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      
      return {
        reasoning: parsed.reasoning || '',
        completed: parsed.completed || false,
        action: parsed.action,
        description: parsed.description,
        expectedResult: parsed.expectedResult,
      };
    } catch (error) {
      console.error('Failed to parse dynamic planner response:', response);
      return {
        reasoning: 'Failed to parse response',
        completed: true,
      };
    }
  }

  reset(): void {
    this.stepCount = 0;
  }

  getStepCount(): number {
    return this.stepCount;
  }
}

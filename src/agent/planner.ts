import { LLMClient } from '../llm/llmClient';
import { TestPlan, TestStep } from '../types';

const PLANNER_SYSTEM_PROMPT = `You are a browser automation testing expert. The user will describe a test scenario, and you need to break it down into fine-grained test steps.
Each step must be a clear browser operation and include expected results.

Please strictly output the following JSON format (do not include any other text):
{
  "goal": "Brief description of the test goal",
  "steps": [
    {
      "description": "Step description",
      "action": { "type": "navigate|click|type|wait|screenshot|...", ... },
      "expectedResult": "Expected result",
      "assertions": [
        { "type": "visible|text|url|...", ... }
      ]
    }
  ]
}

Available action types:
- navigate: { "type": "navigate", "url": "..." }
- click: { "type": "click", "selector": "CSS selector" }
- type: { "type": "type", "selector": "CSS selector", "text": "input content" }
- wait: { "type": "wait", "selector": "CSS selector" } or { "type": "wait", "ms": milliseconds }
- screenshot: { "type": "screenshot", "name": "screenshot name" }
- hover: { "type": "hover", "selector": "CSS selector" }
- press: { "type": "press", "key": "Enter|Escape|..." }
- scroll: { "type": "scroll", "selector": "CSS selector" }
- select: { "type": "select", "selector": "CSS selector", "value": "option value" }
- evaluate: { "type": "evaluate", "script": "JavaScript code" }

Assertion types:
- visible: { "type": "visible", "selector": "..." }
- hidden: { "type": "hidden", "selector": "..." }
- text: { "type": "text", "selector": "...", "expected": "..." }
- url: { "type": "url", "expected": "..." }
- title: { "type": "title", "expected": "..." }
- count: { "type": "count", "selector": "...", "expected": number }
- value: { "type": "value", "selector": "...", "expected": "..." }

Important guidelines:
1. Use CSS selectors that are robust (prefer data-testid, id, or unique attributes)
2. Add appropriate wait steps before interactions if needed
3. Include assertions to verify each step's expected outcome
4. Keep steps atomic - one action per step
5. Add screenshot steps at key points for debugging`;

export class Planner {
  constructor(private llm: LLMClient) {}

  async createPlan(userGoal: string): Promise<TestPlan> {
    const response = await this.llm.chat(PLANNER_SYSTEM_PROMPT, userGoal);
    
    const parsed = this.parseResponse(response);
    
    const steps: TestStep[] = parsed.steps.map((s: any, i: number) => ({
      id: `step-${i + 1}`,
      description: s.description,
      action: s.action,
      expectedResult: s.expectedResult,
      assertions: s.assertions || [],
      timeout: s.timeout || 10000,
    }));

    return {
      id: `plan-${Date.now()}`,
      goal: parsed.goal,
      steps,
      createdAt: Date.now(),
    };
  }

  async refinePlan(
    currentPlan: TestPlan, 
    context: string
  ): Promise<TestPlan> {
    const refinePrompt = `Current test plan:
Goal: ${currentPlan.goal}
Steps: ${JSON.stringify(currentPlan.steps, null, 2)}

Context for refinement: ${context}

Please refine the test plan based on the context. Output the same JSON format.`;

    const response = await this.llm.chat(PLANNER_SYSTEM_PROMPT, refinePrompt);
    const parsed = this.parseResponse(response);
    
    const steps: TestStep[] = parsed.steps.map((s: any, i: number) => ({
      id: `step-${i + 1}`,
      description: s.description,
      action: s.action,
      expectedResult: s.expectedResult,
      assertions: s.assertions || [],
      timeout: s.timeout || 10000,
    }));

    return {
      id: `plan-${Date.now()}`,
      goal: parsed.goal,
      steps,
      createdAt: Date.now(),
    };
  }

  private parseResponse(response: string): { goal: string; steps: any[] } {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      console.error('Failed to parse LLM response:', response);
      throw new Error(`Failed to parse LLM response: ${error}`);
    }
  }
}

export interface TestStep {
  id: string;
  description: string;
  action: BrowserAction;
  expectedResult: string;
  assertions?: Assertion[];
  timeout?: number;
}

export type BrowserAction =
  | { type: 'navigate'; url: string }
  | { type: 'click'; selector: string }
  | { type: 'type'; selector: string; text: string }
  | { type: 'select'; selector: string; value: string }
  | { type: 'hover'; selector: string }
  | { type: 'scroll'; selector?: string; x?: number; y?: number }
  | { type: 'wait'; selector?: string; ms?: number }
  | { type: 'screenshot'; name: string }
  | { type: 'press'; key: string; selector?: string }
  | { type: 'evaluate'; script: string };

export type Assertion =
  | { type: 'visible'; selector: string }
  | { type: 'hidden'; selector: string }
  | { type: 'text'; selector: string; expected: string }
  | { type: 'url'; expected: string }
  | { type: 'title'; expected: string }
  | { type: 'count'; selector: string; expected: number }
  | { type: 'value'; selector: string; expected: string };

export interface TestPlan {
  id: string;
  goal: string;
  steps: TestStep[];
  createdAt: number;
}

export interface StepResult {
  stepId: string;
  status: 'passed' | 'failed' | 'skipped' | 'error';
  duration: number;
  screenshot?: string;
  error?: string;
  assertionResults?: AssertionResult[];
  observations?: string;
  action?: BrowserAction;
  description?: string;
}

export interface AssertionResult {
  assertion: Assertion;
  passed: boolean;
  actual?: string;
}

export interface TestReport {
  planId: string;
  goal: string;
  totalSteps: number;
  passedSteps: number;
  failedSteps: number;
  duration: number;
  stepResults: StepResult[];
  conclusion: 'passed' | 'failed' | 'partial';
}

export interface PageState {
  url: string;
  title: string;
  interactiveElements: InteractiveElement[];
}

export interface InteractiveElement {
  tag: string;
  text: string;
  id: string;
  className: string;
  visible: boolean;
}

export interface ReplanDecision {
  needReplan: boolean;
  adjustedSteps?: TestStep[];
  action?: 'skip' | 'retry' | 'abort';
}

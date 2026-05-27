import { Page } from 'playwright';
import { TestStep, StepResult, AssertionResult, Assertion } from '../types';
import { BrowserActions } from '../browser/actions';
import { Observer } from './observer';
import { config } from '../config';

export class Executor {
  private actions: BrowserActions;
  private observer: Observer;

  constructor(private page: Page) {
    this.actions = new BrowserActions(page);
    this.observer = new Observer(page);
  }

  async executeStep(step: TestStep): Promise<StepResult> {
    const startTime = Date.now();

    try {
      await this.performAction(step.action);

      await this.waitForPageStability(step.action);

      const assertionResults = await this.runAssertions(step.assertions || []);
      const allPassed = assertionResults.every(r => r.passed);

      const screenshot = await this.captureScreenshot(step, allPassed);

      const observations = await this.observer.getPageStateString();

      return {
        stepId: step.id,
        status: allPassed ? 'passed' : 'failed',
        duration: Date.now() - startTime,
        screenshot,
        assertionResults,
        observations,
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
      };
    }
  }

  private async performAction(action: TestStep['action']): Promise<void> {
    await this.actions.perform(action);
  }

  private async waitForPageStability(action?: TestStep['action']): Promise<void> {
    const isNavigationOrClick = action && (
      action.type === 'navigate' || action.type === 'click'
    );

    if (isNavigationOrClick) {
      try {
        await this.page.waitForLoadState('load', { timeout: 10000 });
      } catch {
        // Ignore timeout
      }

      try {
        await this.page.waitForLoadState('networkidle', { timeout: 8000 });
      } catch {
        // Ignore timeout
      }

      await this.page.waitForTimeout(1000);

      try {
        await this.page.waitForLoadState('networkidle', { timeout: 5000 });
      } catch {
        // Ignore timeout
      }
    } else {
      try {
        await this.page.waitForLoadState('domcontentloaded', { timeout: 3000 });
      } catch {
        // Ignore timeout
      }

      try {
        await this.page.waitForLoadState('networkidle', { timeout: 2000 });
      } catch {
        // Ignore timeout
      }
    }
  }

  private async runAssertions(
    assertions: Assertion[]
  ): Promise<AssertionResult[]> {
    if (assertions.length === 0) {
      return [];
    }

    const assertionPromises = assertions.map(assertion =>
      this.runSingleAssertion(assertion)
    );

    const results = await Promise.all(assertionPromises);

    return results;
  }

  private async runSingleAssertion(
    assertion: Assertion
  ): Promise<AssertionResult> {
    try {
      switch (assertion.type) {
        case 'visible': {
          const passed = await this.actions.isVisible(assertion.selector);
          return { assertion, passed };
        }
        
        case 'hidden': {
          const passed = await this.actions.isHidden(assertion.selector);
          return { assertion, passed };
        }
        
        case 'text': {
          const actual = await this.actions.getText(assertion.selector);
          const passed = actual.includes(assertion.expected);
          return { assertion, passed, actual };
        }
        
        case 'url': {
          const actual = await this.actions.getUrl();
          const passed = actual.includes(assertion.expected);
          return { assertion, passed, actual };
        }
        
        case 'title': {
          const actual = await this.actions.getTitle();
          const passed = actual.includes(assertion.expected);
          return { assertion, passed, actual };
        }
        
        case 'count': {
          const actual = await this.actions.getCount(assertion.selector);
          const passed = actual === assertion.expected;
          return { assertion, passed, actual: String(actual) };
        }
        
        case 'value': {
          const actual = await this.actions.getValue(assertion.selector);
          const passed = actual === assertion.expected;
          return { assertion, passed, actual };
        }
        
        default:
          return { 
            assertion, 
            passed: false, 
            actual: 'Unknown assertion type' 
          };
      }
    } catch (error: any) {
      return { 
        assertion, 
        passed: false, 
        actual: `Error: ${error.message}` 
      };
    }
  }

  private async captureScreenshot(
    step: TestStep, 
    passed: boolean
  ): Promise<string | undefined> {
    if (passed && config.screenshot.onSuccess) {
      return await this.observer.takeScreenshot(step.id);
    }
    
    if (!passed && config.screenshot.onFailure) {
      return await this.observer.takeScreenshot(`${step.id}-failed`);
    }
    
    return undefined;
  }

  async executeSteps(
    steps: TestStep[],
    onStepComplete?: (result: StepResult, index: number) => void
  ): Promise<StepResult[]> {
    const results: StepResult[] = [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const result = await this.executeStep(step);
      results.push(result);

      if (onStepComplete) {
        onStepComplete(result, i);
      }

      if (result.status === 'error') {
        console.warn(`Step ${step.id} failed with error: ${result.error}`);
      }
    }

    return results;
  }
}

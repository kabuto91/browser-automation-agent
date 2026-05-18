import { Planner } from './agent/planner';
import { Executor } from './agent/executor';
import { Observer } from './agent/observer';
import { Replanner } from './agent/replanner';
import { BrowserManager } from './browser/browserManager';
import { LLMClient } from './llm/llmClient';
import { Reporter } from './report/reporter';
import { TestStep, StepResult, TestPlan } from './types';
import { config, ensureDirectories } from './config';

export interface AgentOptions {
  headless?: boolean;
  onStepStart?: (step: TestStep, index: number) => void;
  onStepComplete?: (result: StepResult, index: number) => void;
  onPlanCreated?: (plan: TestPlan) => void;
  onReplan?: (reason: string, newSteps: TestStep[]) => void;
}

export class BrowserAutomationAgent {
  private llm: LLMClient;
  private planner: Planner;
  private replanner: Replanner;
  private reporter: Reporter;
  private browserManager: BrowserManager;

  constructor() {
    this.llm = new LLMClient();
    this.planner = new Planner(this.llm);
    this.replanner = new Replanner(this.llm);
    this.reporter = new Reporter();
    this.browserManager = new BrowserManager();
  }

  async run(
    testGoal: string,
    options: AgentOptions = {}
  ): Promise<{
    success: boolean;
    report: ReturnType<Reporter['generateReport']>;
    reportPath: string;
  }> {
    ensureDirectories();

    console.log('\n========================================');
    console.log('  Browser Automation Agent');
    console.log('========================================\n');

    console.log('📋 Test Goal:');
    console.log(`   ${testGoal}\n`);

    console.log('🔍 Phase 1: Planning...');
    const plan = await this.planner.createPlan(testGoal);
    console.log(`✅ Plan created with ${plan.steps.length} steps\n`);

    if (options.onPlanCreated) {
      options.onPlanCreated(plan);
    }

    plan.steps.forEach((step, i) => {
      console.log(`   ${i + 1}. ${step.description}`);
    });
    console.log('');

    console.log('🚀 Phase 2: Launching browser...');
    const page = await this.browserManager.launch(options.headless);
    const executor = new Executor(page);
    const observer = new Observer(page);
    console.log('✅ Browser launched\n');

    console.log('⚡ Phase 3: Executing...\n');

    const results: StepResult[] = [];
    const startTime = Date.now();
    let remainingSteps = [...plan.steps];
    let stepIndex = 0;
    let replanCount = 0;
    const maxReplans = 3;

    while (remainingSteps.length > 0) {
      const step = remainingSteps.shift()!;
      
      if (options.onStepStart) {
        options.onStepStart(step, stepIndex);
      }

      console.log(`   ▶ Step ${stepIndex + 1}: ${step.description}`);

      const result = await executor.executeStep(step);
      results.push(result);

      if (options.onStepComplete) {
        options.onStepComplete(result, stepIndex);
      }

      if (result.status === 'passed') {
        console.log(`     ✅ Passed (${result.duration}ms)\n`);
      } else {
        console.log(`     ❌ ${result.status}: ${result.error || 'Assertion failed'}\n`);

        if (replanCount < maxReplans) {
          console.log('   🔄 Evaluating need for replanning...');
          
          const pageState = await observer.getPageStateString();
          const decision = await this.replanner.evaluate(
            plan,
            result,
            results,
            pageState
          );

          if (decision.needReplan && decision.adjustedSteps) {
            replanCount++;
            console.log(`   📝 Replanning (${replanCount}/${maxReplans}): Adding ${decision.adjustedSteps.length} steps\n`);
            
            if (options.onReplan) {
              options.onReplan(result.error || 'Step failed', decision.adjustedSteps);
            }

            remainingSteps = [...decision.adjustedSteps, ...remainingSteps];
          } else if (decision.action === 'retry') {
            console.log('   🔁 Retrying step...\n');
            remainingSteps.unshift(step);
          } else if (decision.action === 'abort') {
            console.log('   ⏹ Aborting test execution\n');
            break;
          } else {
            console.log('   ⏭ Skipping step and continuing...\n');
          }
        }
      }

      stepIndex++;
    }

    const totalDuration = Date.now() - startTime;

    console.log('📊 Phase 4: Generating report...');
    const report = this.reporter.generateReport(
      plan.id,
      plan.goal,
      results,
      totalDuration
    );
    const reportPath = await this.reporter.saveReport(report);
    console.log(`✅ Report saved: ${reportPath}\n`);

    console.log('========================================');
    console.log('  Test Summary');
    console.log('========================================');
    console.log(`  Goal: ${report.goal}`);
    console.log(`  Steps: ${report.passedSteps}/${report.totalSteps} passed`);
    console.log(`  Duration: ${totalDuration}ms`);
    console.log(`  Result: ${report.conclusion.toUpperCase()}`);
    console.log('========================================\n');

    console.log('🧹 Cleaning up...');
    await this.browserManager.close();
    console.log('✅ Done!\n');

    return {
      success: report.conclusion === 'passed',
      report,
      reportPath,
    };
  }

  async runFromPlan(
    plan: TestPlan,
    options: AgentOptions = {}
  ): Promise<{
    success: boolean;
    report: ReturnType<Reporter['generateReport']>;
    reportPath: string;
  }> {
    ensureDirectories();

    console.log('\n========================================');
    console.log('  Browser Automation Agent');
    console.log('  (Running from existing plan)');
    console.log('========================================\n');

    console.log('🚀 Launching browser...');
    const page = await this.browserManager.launch(options.headless);
    const executor = new Executor(page);
    const observer = new Observer(page);
    console.log('✅ Browser launched\n');

    console.log('⚡ Executing plan...\n');

    const results: StepResult[] = [];
    const startTime = Date.now();
    let remainingSteps = [...plan.steps];
    let stepIndex = 0;

    while (remainingSteps.length > 0) {
      const step = remainingSteps.shift()!;
      
      if (options.onStepStart) {
        options.onStepStart(step, stepIndex);
      }

      console.log(`   ▶ Step ${stepIndex + 1}: ${step.description}`);

      const result = await executor.executeStep(step);
      results.push(result);

      if (options.onStepComplete) {
        options.onStepComplete(result, stepIndex);
      }

      if (result.status === 'passed') {
        console.log(`     ✅ Passed (${result.duration}ms)\n`);
      } else {
        console.log(`     ❌ ${result.status}: ${result.error || 'Assertion failed'}\n`);
      }

      stepIndex++;
    }

    const totalDuration = Date.now() - startTime;

    const report = this.reporter.generateReport(
      plan.id,
      plan.goal,
      results,
      totalDuration
    );
    const reportPath = await this.reporter.saveReport(report);

    console.log('🧹 Cleaning up...');
    await this.browserManager.close();
    console.log('✅ Done!\n');

    return {
      success: report.conclusion === 'passed',
      report,
      reportPath,
    };
  }
}

export async function runTest(testGoal: string, options?: AgentOptions) {
  const agent = new BrowserAutomationAgent();
  return await agent.run(testGoal, options);
}

export {
  Planner,
  Executor,
  Observer,
  Replanner,
  BrowserManager,
  LLMClient,
  Reporter,
  config,
};

import { NextRequest, NextResponse } from 'next/server';
import { BrowserManager } from '@/browser/browserManager';
import { Executor } from '@/agent/executor';
import { Observer } from '@/agent/observer';
import { Replanner } from '@/agent/replanner';
import { LLMClient } from '@/llm/llmClient';
import { Reporter } from '@/report/reporter';
import { TestStep, TestPlan } from '@/types';

export const maxDuration = 300;

interface ExecutionState {
  status: 'running' | 'completed' | 'error';
  currentStep: number;
  totalSteps: number;
  stepResults: any[];
  logs: string[];
}

const executionStates = new Map<string, ExecutionState>();

export async function POST(request: NextRequest) {
  try {
    const { plan: planData, headless = true, cdpEndpoint } = await request.json();

    if (!planData || !planData.steps) {
      return NextResponse.json(
        { error: 'Test plan is required' },
        { status: 400 }
      );
    }

    const executionId = `exec-${Date.now()}`;
    
    executionStates.set(executionId, {
      status: 'running',
      currentStep: 0,
      totalSteps: planData.steps.length,
      stepResults: [],
      logs: ['Starting test execution...'],
    });

    const plan: TestPlan = {
      id: planData.id,
      goal: planData.goal,
      steps: planData.steps.map((s: any, i: number) => ({
        id: s.id || `step-${i + 1}`,
        description: s.description,
        action: s.action,
        expectedResult: s.expectedResult,
        assertions: s.assertions || [],
        timeout: s.timeout || 10000,
      })),
      createdAt: Date.now(),
    };

    const browserManager = new BrowserManager();
    const llm = new LLMClient();
    const reporter = new Reporter();
    const replanner = new Replanner(llm);

    let page;
    try {
      if (cdpEndpoint) {
        console.log(`[Execute] Connecting to existing browser at ${cdpEndpoint}`);
        page = await browserManager.connectToExistingBrowser(cdpEndpoint);
      } else {
        page = await browserManager.launch(headless);
      }
    } catch (browserError: any) {
      return NextResponse.json(
        { error: `Browser connection failed: ${browserError.message}` },
        { status: 500 }
      );
    }

    const executor = new Executor(page);
    const observer = new Observer(page);

    const results: any[] = [];
    const startTime = Date.now();
    let remainingSteps = [...plan.steps];
    let stepIndex = 0;

    const updateState = (log: string) => {
      const state = executionStates.get(executionId);
      if (state) {
        state.logs.push(log);
      }
    };

    try {
      while (remainingSteps.length > 0) {
        const step = remainingSteps.shift()!;
        
        updateState(`Executing step ${stepIndex + 1}: ${step.description}`);

        const result = await executor.executeStep(step);
        results.push(result);

        const state = executionStates.get(executionId);
        if (state) {
          state.currentStep = stepIndex + 1;
          state.stepResults = [...results];
        }

        if (result.status !== 'passed') {
          updateState(`Step ${stepIndex + 1} ${result.status}: ${result.error || 'Assertion failed'}`);

          const pageState = await observer.getPageStateString();
          const decision = await replanner.evaluate(
            plan,
            result,
            results,
            pageState
          );

          if (decision.needReplan && decision.adjustedSteps) {
            updateState(`Replanning: Adding ${decision.adjustedSteps.length} steps`);
            remainingSteps = [...decision.adjustedSteps, ...remainingSteps];
          } else if (decision.action === 'retry') {
            updateState('Retrying step...');
            remainingSteps.unshift(step);
          } else if (decision.action === 'abort') {
            updateState('Aborting test execution');
            break;
          }
        } else {
          updateState(`Step ${stepIndex + 1} passed (${result.duration}ms)`);
        }

        stepIndex++;
      }

      const totalDuration = Date.now() - startTime;
      const report = reporter.generateReport(
        plan.id,
        plan.goal,
        results,
        totalDuration
      );

      const finalState = executionStates.get(executionId);
      if (finalState) {
        finalState.status = 'completed';
        finalState.logs.push(`Test completed: ${report.conclusion}`);
      }

      await browserManager.close();

      return NextResponse.json({
        success: true,
        executionId,
        report: {
          planId: report.planId,
          goal: report.goal,
          totalSteps: report.totalSteps,
          passedSteps: report.passedSteps,
          failedSteps: report.failedSteps,
          duration: report.duration,
          conclusion: report.conclusion,
          stepResults: report.stepResults.map(r => ({
            stepId: r.stepId,
            status: r.status,
            duration: r.duration,
            error: r.error,
            screenshot: r.screenshot,
          })),
        },
      });

    } catch (execError: any) {
      updateState(`Execution error: ${execError.message}`);
      
      const state = executionStates.get(executionId);
      if (state) {
        state.status = 'error';
      }

      await browserManager.close();

      return NextResponse.json({
        success: false,
        executionId,
        error: execError.message,
        partialResults: results,
      });
    }

  } catch (error: any) {
    console.error('Execution error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to execute test' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const executionId = searchParams.get('id');

  if (!executionId) {
    return NextResponse.json({ error: 'Execution ID is required' }, { status: 400 });
  }

  const state = executionStates.get(executionId);
  
  if (!state) {
    return NextResponse.json({ error: 'Execution not found' }, { status: 404 });
  }

  return NextResponse.json(state);
}

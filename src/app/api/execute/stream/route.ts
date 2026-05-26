import { NextRequest } from 'next/server';
import { BrowserManager } from '@/browser/browserManager';
import { Executor } from '@/agent/executor';
import { Observer } from '@/agent/observer';
import { Replanner } from '@/agent/replanner';
import { getLLMClient } from '@/llm/llmClient';
import { Reporter } from '@/report/reporter';
import { TestStep, TestPlan } from '@/types';

export const maxDuration = 300;

interface ProgressEvent {
  type: 'start' | 'step_start' | 'step_complete' | 'step_error' | 'complete' | 'error';
  message?: string;
  stepIndex?: number;
  totalSteps?: number;
  stepDescription?: string;
  progress?: number;
  status?: 'passed' | 'failed' | 'error' | 'skipped';
  duration?: number;
  screenshot?: string;
  error?: string;
  report?: any;
  timestamp: number;
}

export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: ProgressEvent) => {
        const message = `data: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      try {
        const { plan: planData, headless = true, cdpEndpoint } = await request.json();

        if (!planData || !planData.steps) {
          sendEvent({
            type: 'error',
            error: 'Test plan is required',
            timestamp: Date.now()
          });
          controller.close();
          return;
        }

        sendEvent({
          type: 'start',
          message: '开始执行测试...',
          totalSteps: planData.steps.length,
          timestamp: Date.now()
        });

        const plan: TestPlan = {
          id: planData.id,
          goal: planData.goal,
          steps: planData.steps.map((s: any, i: number) => ({
            id: s.id || `step-${i + 1}`,
            description: s.description,
            action: s.action,
            expectedResult: s.expectedResult || '',
            assertions: s.assertions || [],
            timeout: s.timeout || 10000,
          })),
        };

        const browserManager = new BrowserManager();
        let page;

        try {
          if (cdpEndpoint) {
            sendEvent({
              type: 'start',
              message: `连接到已有浏览器: ${cdpEndpoint}`,
              timestamp: Date.now()
            });
            page = await browserManager.connectToExistingBrowser(cdpEndpoint);
          } else {
            sendEvent({
              type: 'start',
              message: headless ? '启动无头浏览器...' : '启动浏览器...',
              timestamp: Date.now()
            });
            page = await browserManager.launch(headless);
          }
        } catch (browserError: any) {
          sendEvent({
            type: 'error',
            error: `浏览器启动失败: ${browserError.message}`,
            timestamp: Date.now()
          });
          controller.close();
          return;
        }

        const observer = new Observer(page);
        const executor = new Executor(page, observer);
        const replanner = new Replanner(getLLMClient());
        const reporter = new Reporter();

        const results: any[] = [];
        const startTime = Date.now();
        let remainingSteps = [...plan.steps];
        let stepIndex = 0;

        while (remainingSteps.length > 0) {
          const currentStep = remainingSteps[0];

          sendEvent({
            type: 'step_start',
            stepIndex: stepIndex,
            totalSteps: plan.steps.length,
            stepDescription: currentStep.description,
            progress: (stepIndex / plan.steps.length) * 100,
            timestamp: Date.now()
          });

          try {
            const result = await executor.executeStep(currentStep);
            results.push(result);

            sendEvent({
              type: 'step_complete',
              stepIndex: stepIndex,
              status: result.status,
              duration: result.duration,
              screenshot: result.screenshot,
              timestamp: Date.now()
            });

            if (result.status !== 'passed') {
              const pageState = await observer.getPageSnapshot();
              const replanResult = await replanner.replan(
                plan,
                currentStep,
                result,
                pageState
              );

              if (replanResult.needsReplan && replanResult.newSteps.length > 0) {
                remainingSteps = [...replanResult.newSteps, ...remainingSteps.slice(1)];
                sendEvent({
                  type: 'start',
                  message: `重新规划步骤: 添加 ${replanResult.newSteps.length} 个新步骤`,
                  totalSteps: remainingSteps.length,
                  timestamp: Date.now()
                });
              } else {
                remainingSteps = remainingSteps.slice(1);
              }
            } else {
              remainingSteps = remainingSteps.slice(1);
            }

            stepIndex++;
          } catch (stepError: any) {
            sendEvent({
              type: 'step_error',
              stepIndex: stepIndex,
              error: stepError.message,
              timestamp: Date.now()
            });

            results.push({
              stepId: currentStep.id,
              status: 'error',
              duration: 0,
              error: stepError.message,
              description: currentStep.description,
            });

            remainingSteps = remainingSteps.slice(1);
            stepIndex++;
          }
        }

        const totalDuration = Date.now() - startTime;
        const report = reporter.generateReport(plan, results, totalDuration);

        sendEvent({
          type: 'complete',
          message: '测试完成',
          report: report,
          timestamp: Date.now()
        });

        await browserManager.close();
        controller.close();

      } catch (error: any) {
        sendEvent({
          type: 'error',
          error: error.message,
          timestamp: Date.now()
        });
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  });
}
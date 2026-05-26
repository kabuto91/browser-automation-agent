import { NextRequest } from 'next/server';
import { globalBrowserManager } from '@/browser/globalBrowserManager';
import { DynamicExecutor } from '@/agent/dynamicExecutor';
import { getLLMClient } from '@/llm/llmClient';
import { BrowserAction } from '@/types';

export const maxDuration = 300;

interface ProgressEvent {
  type: 'start' | 'step_start' | 'step_complete' | 'step_error' | 'login_required' | 'complete' | 'error';
  message?: string;
  stepIndex?: number;
  totalSteps?: number;
  stepDescription?: string;
  progress?: number;
  status?: 'passed' | 'failed' | 'error' | 'skipped';
  duration?: number;
  screenshot?: string;
  error?: string;
  action?: BrowserAction;
  report?: any;
  loginReason?: string;
  sessionId?: string;
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
        const { goal, headless = true, predefinedSteps, cdpEndpoint, sessionId } = await request.json();

        if (!goal || typeof goal !== 'string') {
          sendEvent({
            type: 'error',
            error: 'Test goal is required',
            timestamp: Date.now()
          });
          controller.close();
          return;
        }

        const llm = getLLMClient();

        let page;
        let currentSessionId: string;

        try {
          if (sessionId) {
            sendEvent({
              type: 'start',
              message: `恢复会话: ${sessionId}`,
              timestamp: Date.now()
            });
            page = globalBrowserManager.getPage(sessionId);
            
            if (!page) {
              sendEvent({
                type: 'error',
                error: 'Session expired or invalid',
                timestamp: Date.now()
              });
              controller.close();
              return;
            }
            
            currentSessionId = sessionId;
            globalBrowserManager.keepAlive();
          } else if (cdpEndpoint) {
            sendEvent({
              type: 'start',
              message: `连接到已有浏览器: ${cdpEndpoint}`,
              timestamp: Date.now()
            });
            const result = await globalBrowserManager.connectToExistingBrowser(cdpEndpoint);
            page = result.page;
            currentSessionId = result.sessionId;
          } else {
            sendEvent({
              type: 'start',
              message: headless ? '启动无头浏览器...' : '启动浏览器...',
              timestamp: Date.now()
            });
            const result = await globalBrowserManager.launch(headless);
            page = result.page;
            currentSessionId = result.sessionId;
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

        const executor = new DynamicExecutor(page, llm);

        sendEvent({
          type: 'start',
          message: predefinedSteps && predefinedSteps.length > 0 
            ? `使用 ${predefinedSteps.length} 个预定义步骤开始动态测试`
            : '开始动态测试执行...',
          totalSteps: predefinedSteps?.length || 0,
          sessionId: currentSessionId,
          timestamp: Date.now()
        });

        const result = await executor.executeDynamically(
          goal,
          undefined,
          async (result: any, index: number, pageState: string, action?: BrowserAction, description?: string) => {
            sendEvent({
              type: 'step_complete',
              stepIndex: index,
              status: result.status,
              duration: result.duration,
              screenshot: result.screenshot,
              action: action,
              stepDescription: description || `执行步骤 ${index + 1}`,
              progress: (index / 20) * 100,
              timestamp: Date.now()
            });
          },
          (reason: string) => {
            sendEvent({
              type: 'login_required',
              loginReason: reason,
              sessionId: currentSessionId,
              message: '请在浏览器中手动完成登录，然后继续测试',
              timestamp: Date.now()
            });
          }
        );

        if (result.pausedForLogin) {
          sendEvent({
            type: 'login_required',
            loginReason: result.loginReason || '检测到需要登录',
            sessionId: currentSessionId,
            message: '请在浏览器中手动完成登录，然后继续测试',
            timestamp: Date.now()
          });
          
          globalBrowserManager.keepAlive();
          controller.close();
          return;
        }

        sendEvent({
          type: 'complete',
          message: '动态测试完成',
          report: {
            goal: result.goal,
            totalSteps: result.totalSteps,
            passedSteps: result.passedSteps,
            failedSteps: result.failedSteps,
            duration: result.duration,
            conclusion: result.conclusion,
            stepResults: result.stepResults,
            logs: result.logs,
            stepDetails: result.stepDetails,
            finalPageState: result.finalPageState,
          },
          timestamp: Date.now()
        });

        globalBrowserManager.scheduleCleanup(currentSessionId);
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
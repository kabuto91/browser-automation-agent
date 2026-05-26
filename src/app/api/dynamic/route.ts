import { NextRequest, NextResponse } from 'next/server';
import { globalBrowserManager } from '@/browser/globalBrowserManager';
import { DynamicExecutor } from '@/agent/dynamicExecutor';
import { getLLMClient } from '@/llm/llmClient';
import { BrowserAction } from '@/types';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const { goal, headless = true, predefinedSteps, cdpEndpoint, sessionId } = await request.json();

    if (!goal || typeof goal !== 'string') {
      return NextResponse.json(
        { error: 'Test goal is required' },
        { status: 400 }
      );
    }

    const llm = getLLMClient();

    let page;
    let currentSessionId: string;

    try {
      if (sessionId) {
        console.log(`[Dynamic] Resuming with session: ${sessionId}`);
        page = globalBrowserManager.getPage(sessionId);
        
        if (!page) {
          return NextResponse.json(
            { error: 'Session expired or invalid. Please start a new test.' },
            { status: 400 }
          );
        }
        
        currentSessionId = sessionId;
        globalBrowserManager.keepAlive();
      } else if (cdpEndpoint) {
        console.log(`[Dynamic] Connecting to existing browser at ${cdpEndpoint}`);
        const result = await globalBrowserManager.connectToExistingBrowser(cdpEndpoint);
        page = result.page;
        currentSessionId = result.sessionId;
      } else {
        console.log(`[Dynamic] Launching new browser`);
        const result = await globalBrowserManager.launch(headless);
        page = result.page;
        currentSessionId = result.sessionId;
      }
    } catch (browserError: any) {
      return NextResponse.json(
        { error: `Browser connection failed: ${browserError.message}` },
        { status: 500 }
      );
    }

    const executor = new DynamicExecutor(page, llm);

    const logs: string[] = [];
    const stepDetails: any[] = [];

    const onStepStart = (step: any, index: number) => {
      const log = `Step ${index + 1}: ${step.description}`;
      logs.push(log);
      console.log(`[Dynamic] ${log}`);
    };

    const onStepComplete = (result: any, index: number, pageState: string, action?: any, description?: string) => {
      const log = `Step ${index + 1} ${result.status}: ${result.duration}ms`;
      logs.push(log);
      console.log(`[Dynamic] ${log}`);
      
      stepDetails.push({
        stepId: result.stepId,
        status: result.status,
        duration: result.duration,
        error: result.error,
        pageState: pageState.slice(0, 500),
        action,
        description,
      });
    };

    const onLoginRequired = (reason: string) => {
      const log = `⚠️ Login required: ${reason}`;
      logs.push(log);
      console.log(`[Dynamic] ${log}`);
    };

    try {
      let result;
      
      if (predefinedSteps && Array.isArray(predefinedSteps) && predefinedSteps.length > 0) {
        console.log(`[Dynamic] Using ${predefinedSteps.length} predefined steps`);
        result = await executor.executeWithPredefinedSteps(
          goal,
          predefinedSteps as BrowserAction[],
          onStepStart,
          onStepComplete,
          onLoginRequired
        );
      } else {
        result = await executor.executeDynamically(
          goal,
          onStepStart,
          onStepComplete,
          onLoginRequired
        );
      }

      if (result.pausedForLogin) {
        console.log(`[Dynamic] Test paused for login, keeping browser open`);
        
        return NextResponse.json({
          success: result.success,
          goal: result.goal,
          totalSteps: result.totalSteps,
          passedSteps: result.passedSteps,
          failedSteps: result.failedSteps,
          duration: result.duration,
          conclusion: result.conclusion,
          stepResults: result.stepResults.map(r => ({
            stepId: r.stepId,
            status: r.status,
            duration: r.duration,
            error: r.error,
            screenshot: r.screenshot,
            action: r.action,
            description: r.description,
          })),
          logs,
          stepDetails,
          finalPageState: result.finalPageState?.slice(0, 1000),
          pausedForLogin: result.pausedForLogin,
          loginReason: result.loginReason,
          sessionId: currentSessionId,
        });
      }

      await globalBrowserManager.close();

      return NextResponse.json({
        success: result.success,
        goal: result.goal,
        totalSteps: result.totalSteps,
        passedSteps: result.passedSteps,
        failedSteps: result.failedSteps,
        duration: result.duration,
        conclusion: result.conclusion,
        stepResults: result.stepResults.map(r => ({
          stepId: r.stepId,
          status: r.status,
          duration: r.duration,
          error: r.error,
          screenshot: r.screenshot,
          action: r.action,
          description: r.description,
        })),
        logs,
        stepDetails,
        finalPageState: result.finalPageState?.slice(0, 1000),
      });

    } catch (execError: any) {
      console.error('Dynamic execution error:', execError);
      await globalBrowserManager.close();

      return NextResponse.json({
        success: false,
        error: execError.message,
        logs,
        stepDetails,
      }, { status: 500 });
    }

  } catch (error: any) {
    console.error('Request error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to execute dynamic test' },
      { status: 500 }
    );
  }
}

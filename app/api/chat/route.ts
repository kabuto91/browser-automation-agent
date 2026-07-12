import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { ScriptCollector } from "../../utils/scriptCollector";
import { executeScript } from "../../utils/scriptExecutor";
import { validateScript } from "../../utils/scriptValidator";
import type { ToolCall } from "../../utils/stepLibraryDB";
import { getBrowserPool, getRawTools, connectExternalBrowser, disconnectExternalBrowser } from "../../mcp/mcpClient";
import { createTestAgentGraph, resumeTest } from "../../agents/testAgentGraph";
import { HumanMessage } from "@langchain/core/messages";
import { addFixExperience } from "../../utils/fixExperienceDB";
import { addExperienceToVectorStore } from "../../rag/vectorStore";

// =============================================
// 优化点2: 测试结果缓存
// =============================================
const testResultCache = new Map<string, string>();
const MAX_CACHE_SIZE = 10;

// =============================================
// 优化点3: 精简系统提示词
// =============================================
const SYSTEM_PROMPT = `你是一个专业的 Web 自动化测试 Agent。
任务：根据用户的测试需求，使用浏览器工具完成测试。
规则：
1. 使用 browser_snapshot 获取页面状态
2. 根据页面快照中的 ref 属性定位元素
3. 测试完成后，给出详细的测试结果报告
4. 操作失败时分析原因并重试`;

// =============================================
// 优化点5: 异步流式处理 - 使用 SSE
// =============================================
export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const { input, action, taskId } = data;

    // 处理恢复测试请求
    if (action === 'resume') {
      if (!taskId) {
        return NextResponse.json(
          { success: false, error: "缺少 taskId" },
          { status: 400 }
        );
      }

      const resumed = resumeTest(taskId);

      return NextResponse.json({
        success: resumed,
        message: resumed ? "测试已恢复" : "未找到暂停的测试任务"
      });
    }

    // 处理脚本验证请求
    if (action === 'validate') {
      const { script } = data;

      if (!script || !Array.isArray(script)) {
        return NextResponse.json(
          { success: false, error: "缺少脚本数据" },
          { status: 400 }
        );
      }

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const pool = getBrowserPool();
          let clientId: string | null = null;
          try {
            const entry = await pool.acquire();
            clientId = entry.clientId;

            // 发送验证开始消息
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              status: 'validating',
              message: '开始验证脚本稳定性'
            })}\n\n`));

            const result = await validateScript(
              script,
              entry.instance.client,
              3,
              (attempt, total, success) => {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                  status: 'validation_progress',
                  attempt,
                  total,
                  success
                })}\n\n`));
              }
            );

            // 发送验证完成消息
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              status: 'validation_complete',
              ...result
            })}\n\n`));

            controller.close();
          } catch (error) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              status: 'error',
              error: error instanceof Error ? error.message : '验证失败'
            })}\n\n`));
            controller.close();
          } finally {
            // 归还浏览器实例到池
            if (clientId) {
              await pool.release(clientId);
            }
          }
        },
      });

      return new NextResponse(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    // 处理脚本执行请求
    if (action === 'execute-script') {
      const { script } = data;
      const requestId = Math.random().toString(36).substring(7);
      console.log(`📥 [${requestId}] 收到 execute-script 请求`);

      if (!script || !Array.isArray(script)) {
        return NextResponse.json(
          { success: false, error: "缺少脚本数据" },
          { status: 400 }
        );
      }

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          console.log(`🔄 [${requestId}] 开始处理 execute-script 请求`);
          const pool = getBrowserPool();
          console.log(`🔄 [${requestId}] 获取浏览器池实例，当前状态:`, pool.getStatus());
          let clientId: string | null = null;
          try {
            console.log(`🔄 [${requestId}] 开始获取浏览器实例...`);
            const entry = await pool.acquire();
            clientId = entry.clientId;
            console.log(`✅ [${requestId}] 获取到浏览器实例: clientId=${clientId}, instanceId=${entry.instance.instanceId}, PID=${entry.instance.pid}, userDataDir=${entry.instance.userDataDir}`);

            const result = await executeScript(
              script,
              entry.instance.client,
              (step, total, toolName) => {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                  status: 'executing',
                  step,
                  total,
                  tool: toolName
                })}\n\n`));
              },
              entry.instance.instanceId
            );

            if (result.success) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                status: 'completed',
                result: '脚本执行成功'
              })}\n\n`));
            } else {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                status: 'error',
                error: result.error || '执行失败'
              })}\n\n`));
            }

            controller.close();
          } catch (error) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              status: 'error',
              error: error instanceof Error ? error.message : '执行失败'
            })}\n\n`));
            controller.close();
          } finally {
            // 归还浏览器实例到池
            if (clientId) {
              await pool.release(clientId);
            }
          }
        },
      });

      return new NextResponse(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    // 处理启动测试请求
    if (!input) {
      return NextResponse.json({ success: false, error: "缺少测试任务输入" }, { status: 400 });
    }

    if (testResultCache.has(input)) {
      console.log("📋 命中缓存");
      return NextResponse.json({ 
        success: true, 
        input, 
        output: testResultCache.get(input)!,
        cached: true 
      });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const pool = getBrowserPool();
        let clientId: string | null = null;

        const abortHandler = () => {
          console.log("⚠️ 请求被中断，归还浏览器实例");
          if (clientId) {
            pool.release(clientId).catch(console.error);
          }
          controller.error(new Error("Request aborted"));
        };

        req.signal.addEventListener('abort', abortHandler);

        try {
          const entry = await pool.acquire();
          clientId = entry.clientId;

          await runTestAgentWithStream(input, (data: string) => {
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          }, undefined, entry.instance.client);
          controller.close();
        } catch (error) {
          controller.error(error);
        } finally {
          req.signal.removeEventListener('abort', abortHandler);
          // 归还浏览器实例到池
          if (clientId) {
            await pool.release(clientId);
          }
        }
      },
      cancel() {
        console.log("⚠️ Stream 被取消");
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

async function runTestAgentWithStream(
  testTask: string,
  onProgress: (data: string) => void,
  collector?: ScriptCollector,
  externalClient?: any
): Promise<{ script: ToolCall[] }> {
  const taskId = randomUUID();
  const mcpClient = externalClient || (await getBrowserPool().acquire()).instance.client;
  const tools = await getRawTools();
  const scriptCollector = collector || new ScriptCollector();

  onProgress(JSON.stringify({ step: 0, status: "started", taskId }));

  try {
    const graph = await createTestAgentGraph(tools, mcpClient, taskId, onProgress, testTask);

    const stream = await graph.stream(
      {
        messages: [new HumanMessage(testTask)],
        stepCount: 0,
      },
      { streamMode: "updates" }
    );

    let lastError: string | null = null;
    let hasError = false;
    let fixSteps: ToolCall[] = [];

    for await (const update of stream) {
      const updateObj = update as any;
      if (updateObj.tools?.script) {
        for (const toolCall of updateObj.tools.script) {
          scriptCollector.addToolCall(toolCall.toolName, toolCall.arguments);
        }
      }
      // 收集错误和修复步骤信息
      if (updateObj.tools?.lastError) {
        lastError = updateObj.tools.lastError;
      }
      if (updateObj.tools?.hasError !== undefined) {
        hasError = updateObj.tools.hasError;
      }
      if (updateObj.tools?.fixSteps) {
        fixSteps = fixSteps.concat(updateObj.tools.fixSteps);
      }
    }

    const script = scriptCollector.getScript();
    const finalResult = "测试完成";

    onProgress(JSON.stringify({
      step: 0,
      status: "completed",
      result: finalResult,
      script
    }));

    // 保存修复经验
    if (hasError && fixSteps.length > 0 && lastError) {
      try {
        const experience = {
          id: randomUUID(),
          problemDescription: testTask + '\n错误：' + lastError,
          errorType: classifyError(lastError),
          fixSteps: fixSteps,
          successCount: 0,
          createdAt: Date.now(),
        };

        await addFixExperience(experience);
        await addExperienceToVectorStore(experience);
        console.log(`💾 已保存修复经验: ${experience.id}`);
      } catch (error) {
        console.error('保存修复经验失败:', error);
      }
    }

    if (testResultCache.size >= MAX_CACHE_SIZE) {
      const firstKey = testResultCache.keys().next().value;
      if (firstKey !== undefined) {
        testResultCache.delete(firstKey);
      }
    }
    testResultCache.set(testTask, finalResult);

    return { script };
  } catch (error) {
    const errorMsg = `Agent 执行失败: ${error instanceof Error ? error.message : "unknown"}`;
    onProgress(JSON.stringify({
      step: 0,
      status: "error",
      error: errorMsg
    }));
    return { script: scriptCollector.getScript() };
  }
}

function classifyError(error: string): string {
  if (error.includes('timeout')) return 'timeout';
  if (error.includes('not found') || error.includes('no such element')) return 'element_not_found';
  if (error.includes('login')) return 'login_required';
  return 'other';
}
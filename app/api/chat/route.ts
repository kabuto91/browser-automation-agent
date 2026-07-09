import { NextRequest, NextResponse } from 'next/server';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { getLLMClient, LLMClient } from "../../llm/llmClient";
import { randomUUID } from 'crypto';
import { processSnapshot } from "../../utils/snapshotProcessor";
import { ScriptCollector } from "../../utils/scriptCollector";
import { executeScript } from "../../utils/scriptExecutor";
import { validateScript } from "../../utils/scriptValidator";
import type { ToolCall } from "../../utils/stepLibraryDB";
import { getBrowserPool, getRawTools } from "../../mcp/mcpClient";
import { createTestAgent } from "../../agents/testAgent";
import { HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";

// =============================================
// 登录拦截器：关键词列表
// =============================================
const LOGIN_KEYWORDS = [
  '登录', '登陆', '密码', 'password', 'login', 'signin', 'sign in',
  '用户名', 'username', '账号', '验证码', 'captcha'
];

// =============================================
// 登录拦截器：暂停/恢复状态管理
// =============================================
const pendingResumes = new Map<string, () => void>();

function waitForResume(taskId: string): Promise<void> {
  return new Promise((resolve) => {
    pendingResumes.set(taskId, resolve);
  });
}

function resumeTest(taskId: string): boolean {
  const resolve = pendingResumes.get(taskId);
  if (resolve) {
    resolve();
    pendingResumes.delete(taskId);
    return true;
  }
  return false;
}

// =============================================
// 登录拦截器：检测登录页面
// =============================================
async function isLoginPage(pageContent: string, llmClient: LLMClient): Promise<boolean> {
  // 第一层：关键词匹配
  const hasKeyword = LOGIN_KEYWORDS.some(keyword =>
    pageContent.toLowerCase().includes(keyword.toLowerCase())
  );

  if (!hasKeyword) {
    return false;
  }

  // 第二层：LLM 确认
  try {
    const prompt = `判断以下页面快照是否为登录页面。只需回答"是"或"否"。

页面快照内容：
${pageContent.slice(0, 2000)}

回答：`;

    const response = await llmClient.chat(
      '你是一个页面识别助手，专门判断页面是否为登录界面。',
      prompt
    );

    return response?.trim().includes('是') || false;
  } catch (error) {
    console.error('LLM 登录页面检测失败:', error);
    return hasKeyword;
  }
}

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
// 优化点4: 消息历史截断
// =============================================
function trimMessages(messages: ChatCompletionMessageParam[], maxMessages: number = 10): ChatCompletionMessageParam[] {
  if (messages.length <= maxMessages) return messages;

  // 保留最近的消息，确保消息结构完整
  return messages.slice(-maxMessages);
}

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
  const llmClient = getLLMClient();
  const scriptCollector = collector || new ScriptCollector();

  // 发送任务ID给前端
  onProgress(JSON.stringify({ step: 0, status: "started", taskId }));

  try {
    // 使用 LangChain Agent 替代手动 ReAct 循环
    const agent = await createTestAgent(tools, mcpClient);

    let stepCount = 0;
    let finalResult = "";

    // 使用流式处理
    const stream = await agent.stream(
      { messages: [new HumanMessage(testTask)] },
      { streamMode: "updates" }
    );

    for await (const update of stream) {
      stepCount++;
      const updateObj = update as any;

      // 处理 Agent 节点的输出（LLM 响应）
      if (updateObj.agent?.messages) {
        for (const message of updateObj.agent.messages) {
          // 处理 AI 消息（LLM 输出）
          if (message._getType() === "ai") {
            const content = message.content;
            if (content) {
              onProgress(JSON.stringify({
                step: stepCount,
                status: "thinking",
                content: typeof content === "string" ? content : JSON.stringify(content)
              }));
            }

            // 处理工具调用
            if (message.tool_calls && message.tool_calls.length > 0) {
              for (const toolCall of message.tool_calls) {
                onProgress(JSON.stringify({
                  step: stepCount,
                  status: "executing",
                  tool: toolCall.name
                }));
              }
            }
          }
        }
      }

      // 处理工具节点的输出（工具执行结果）
      if (updateObj.tools?.messages) {
        for (const message of updateObj.tools.messages) {
          if (message._getType() === "tool") {
            const toolName = message.name || "unknown";
            const toolResult = message.content;

            // 收集工具调用到脚本
            const toolCallId = message.tool_call_id;
            if (toolCallId) {
              const aiMessages = updateObj.agent?.messages?.filter((m: any) => m._getType() === "ai") || [];
              for (const aiMessage of aiMessages) {
                if (aiMessage.tool_calls) {
                  const toolCall = aiMessage.tool_calls.find((tc: any) => tc.id === toolCallId);
                  if (toolCall) {
                    scriptCollector.addToolCall(toolName, toolCall.args);
                    break;
                  }
                }
              }
            }

            // 处理快照预处理
            let processedResult = typeof toolResult === "string" ? toolResult : JSON.stringify(toolResult);
            if (toolName === 'browser_snapshot') {
              processedResult = processSnapshot(processedResult);
            }

            onProgress(JSON.stringify({
              step: stepCount,
              status: "tool_result",
              tool: toolName,
              result: processedResult.slice(0, 500)
            }));

            // 🔥 登录拦截器：检测登录页面
            if (toolName === 'browser_snapshot') {
              const isLogin = await isLoginPage(processedResult, llmClient);

              if (isLogin) {
                console.log(`🔐 检测到登录页面，暂停测试任务: ${taskId}`);

                onProgress(JSON.stringify({
                  step: stepCount,
                  status: "login_required",
                  taskId,
                  message: "检测到登录页面，请手动登录后点击继续"
                }));

                await waitForResume(taskId);

                console.log(`✅ 测试任务已恢复: ${taskId}`);

                onProgress(JSON.stringify({
                  step: stepCount,
                  status: "resumed",
                  taskId,
                  message: "用户已登录，继续测试"
                }));
              }
            }
          }
        }
      }
    }

    // 提取最终结果
    const script = scriptCollector.getScript();
    finalResult = "测试完成";

    onProgress(JSON.stringify({
      step: stepCount,
      status: "completed",
      result: finalResult,
      script
    }));

    // 缓存结果
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
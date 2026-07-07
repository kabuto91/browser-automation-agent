import { NextRequest, NextResponse } from 'next/server';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { getLLMClient, LLMClient } from "../../llm/llmClient";
import { exec } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import { processSnapshot } from "../../utils/snapshotProcessor";
import { ScriptCollector } from "../../utils/scriptCollector";
import { executeScript } from "../../utils/scriptExecutor";
import { validateScript } from "../../utils/scriptValidator";
import type { ToolCall } from "../../utils/stepLibraryDB";

const execAsync = promisify(exec);

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

let mcpClientInstance: Client | null = null;
let mcpTransportInstance: StdioClientTransport | null = null;
let toolsCache: ChatCompletionTool[] | null = null;

async function killProcessTree(pid: number): Promise<void> {
  try {
    if (process.platform === 'win32') {
      await execAsync(`taskkill /PID ${pid} /T /F`);
    } else {
      await execAsync(`kill -9 -${pid}`);
    }
  } catch (e) {
    // 进程可能已经退出，忽略错误
  }
}

async function cleanupMCPClient(): Promise<void> {
  if (mcpClientInstance) {
    try {
      await mcpClientInstance.close();
      console.log("🔌 Playwright MCP Client 已关闭");
    } catch (e) {
      console.error("关闭 MCP Client 时出错:", e);
    }
    mcpClientInstance = null;
  }

  if (mcpTransportInstance) {
    const transport = mcpTransportInstance as StdioClientTransport & { pid?: number };
    if (transport.pid) {
      console.log(`🔪 杀掉 Playwright 进程树: PID ${transport.pid}`);
      await killProcessTree(transport.pid);
    }
    mcpTransportInstance = null;
  }

  toolsCache = null;
}

process.on('exit', () => {
  cleanupMCPClient().catch(console.error);
});

process.on('SIGINT', () => {
  cleanupMCPClient().catch(console.error);
  process.exit(0);
});

async function getMCPClient(): Promise<Client> {
  if (mcpClientInstance) {
    try {
      await mcpClientInstance.listTools();
      return mcpClientInstance;
    } catch {
      await cleanupMCPClient();
    }
  }

  const transport = new StdioClientTransport({
    command: "npx",
    args: ["@playwright/mcp@latest"],
  });

  const client = new Client(
    {
      name: "playwright-test-agent",
      version: "1.0.0",
    },
    {
      capabilities: {},
    }
  );

  await client.connect(transport);
  console.log("✅ Playwright MCP Server 连接成功");
  mcpClientInstance = client;
  mcpTransportInstance = transport;

  return client;
}

async function getTools(): Promise<ChatCompletionTool[]> {
  if (toolsCache) return toolsCache;

  const mcpClient = await getMCPClient();
  const mcpTools = await mcpClient.listTools();

  toolsCache = mcpTools.tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description || "",
      parameters: tool.inputSchema as Record<string, unknown>,
    },
  }));

  console.log(`🧰 可用工具 (${toolsCache.length}个):`, toolsCache.map((t) => (t as any).function?.name || 'unknown').join(", "));
  return toolsCache;
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
          try {
            const mcpClient = await getMCPClient();

            // 发送验证开始消息
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              status: 'validating',
              message: '开始验证脚本稳定性'
            })}\n\n`));

            const result = await validateScript(
              script,
              mcpClient,
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
            // 清理 MCP 客户端，关闭浏览器
            await cleanupMCPClient();
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

      if (!script || !Array.isArray(script)) {
        return NextResponse.json(
          { success: false, error: "缺少脚本数据" },
          { status: 400 }
        );
      }

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            const mcpClient = await getMCPClient();

            const result = await executeScript(
              script,
              mcpClient,
              (step, total, toolName) => {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                  status: 'executing',
                  step,
                  total,
                  tool: toolName
                })}\n\n`));
              }
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
            // 清理 MCP 客户端，关闭浏览器
            await cleanupMCPClient();
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
        const abortHandler = () => {
          console.log("⚠️ 请求被中断，清理 MCP Client");
          cleanupMCPClient().catch(console.error);
          controller.error(new Error("Request aborted"));
        };

        req.signal.addEventListener('abort', abortHandler);

        try {
          await runTestAgentWithStream(input, (data: string) => {
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          });
          controller.close();
        } catch (error) {
          controller.error(error);
        } finally {
          req.signal.removeEventListener('abort', abortHandler);
        }
      },
      cancel() {
        console.log("⚠️ Stream 被取消，清理 MCP Client");
        cleanupMCPClient().catch(console.error);
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
  collector?: ScriptCollector
): Promise<{ script: ToolCall[] }> {
  const taskId = randomUUID();
  const mcpClient = await getMCPClient();
  const tools = await getTools();
  const llmClient = getLLMClient();
  const scriptCollector = collector || new ScriptCollector();

  // 发送任务ID给前端
  onProgress(JSON.stringify({ step: 0, status: "started", taskId }));

  const messages: ChatCompletionMessageParam[] = [
    { role: 'user', content: testTask }
  ];

  const MAX_STEPS = 10;

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      onProgress(JSON.stringify({ step: step + 1, status: "thinking" }));

      const trimmedMessages = trimMessages(messages, 10);

      const assistantMessage = await llmClient.chatWithTool(
        SYSTEM_PROMPT,
        trimmedMessages,
        tools,
      );

      messages.push({
        role: "assistant",
        content: assistantMessage.content,
        tool_calls: assistantMessage.tool_calls,
      });

      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        const result = assistantMessage.content || "测试完成";
        const script = scriptCollector.getScript();
        
        onProgress(JSON.stringify({ 
          step: step + 1, 
          status: "completed", 
          result,
          script 
        }));

        if (testResultCache.size >= MAX_CACHE_SIZE) {
          const firstKey = testResultCache.keys().next().value;
          if (firstKey !== undefined) {
            testResultCache.delete(firstKey);
          }
        }
        testResultCache.set(testTask, result);
        return { script };
      }

      for (const toolCall of assistantMessage.tool_calls) {
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments);

        // 收集工具调用到脚本
        scriptCollector.addToolCall(toolName, toolArgs);

        onProgress(JSON.stringify({ step: step + 1, status: "executing", tool: toolName }));

        try {
          // 添加超时机制，防止工具调用卡住
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error(`工具调用超时: ${toolName}`)), 30000);
          });

          const result = await Promise.race([
            mcpClient.callTool({
              name: toolName,
              arguments: toolArgs,
            }),
            timeoutPromise,
          ]);

          const toolResultText =
            typeof result.content === "string"
              ? result.content
              : JSON.stringify(result.content);

          // 🔥 优化点1：快照预处理（保留完整格式）
          const processedResult = toolName === 'browser_snapshot'
            ? processSnapshot(toolResultText)
            : toolResultText;

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: processedResult,
          });

          onProgress(JSON.stringify({
            step: step + 1,
            status: "tool_result",
            tool: toolName,
            result: processedResult.slice(0, 500)
          }));

          // 🔥 登录拦截器：检测登录页面
          if (toolName === 'browser_snapshot') {
            const isLogin = await isLoginPage(processedResult, llmClient);

            if (isLogin) {
              console.log(`🔐 检测到登录页面，暂停测试任务: ${taskId}`);

              // 发送暂停信号给前端
              onProgress(JSON.stringify({
                step: step + 1,
                status: "login_required",
                taskId,
                message: "检测到登录页面，请手动登录后点击继续"
              }));

              // 等待用户恢复信号
              await waitForResume(taskId);

              console.log(`✅ 测试任务已恢复: ${taskId}`);

              // 用户已登录，继续执行
              onProgress(JSON.stringify({
                step: step + 1,
                status: "resumed",
                taskId,
                message: "用户已登录，继续测试"
              }));

              // 🔥 关键：注入消息告诉 LLM 用户已登录，需要重新获取页面状态
              messages.push({
                role: "user",
                content: "用户已手动完成登录。请使用 browser_snapshot 重新获取当前页面状态，然后继续执行原测试任务。"
              });
            }
          }

        } catch (error) {
          const errorMsg = `工具调用失败: ${error instanceof Error ? error.message : "unknown"}`;

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: errorMsg,
          });

          onProgress(JSON.stringify({ step: step + 1, status: "error", error: errorMsg }));
        }
      }
    }

    onProgress(JSON.stringify({ step: MAX_STEPS, status: "completed", result: "达到最大步数限制，测试结束" }));
    return { script: scriptCollector.getScript() };
  } finally {
    await cleanupMCPClient();
  }
}
import { NextRequest, NextResponse } from 'next/server';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { getLLMClient } from "../../llm/llmClient";
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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

  console.log(`🧰 可用工具 (${toolsCache.length}个):`, toolsCache.map((t) => t.function.name).join(", "));
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
  
  // 保留最近的消息
  return messages.slice(-maxMessages);
}

// =============================================
// 优化点5: 异步流式处理 - 使用 SSE
// =============================================
export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const { input } = data;

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
  onProgress: (data: string) => void
): Promise<void> {
  const mcpClient = await getMCPClient();
  const tools = await getTools();
  const llmClient = getLLMClient();

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
        onProgress(JSON.stringify({ step: step + 1, status: "completed", result }));

        if (testResultCache.size >= MAX_CACHE_SIZE) {
          const firstKey = testResultCache.keys().next().value;
          if (firstKey !== undefined) {
            testResultCache.delete(firstKey);
          }
        }
        testResultCache.set(testTask, result);
        return;
      }

      for (const toolCall of assistantMessage.tool_calls) {
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments);

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

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: toolResultText,
          });

          onProgress(JSON.stringify({ 
            step: step + 1, 
            status: "tool_result", 
            tool: toolName,
            result: toolResultText.slice(0, 500)
          }));

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
  } finally {
    await cleanupMCPClient();
  }
}
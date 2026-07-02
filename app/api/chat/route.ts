import { NextRequest, NextResponse } from 'next/server';
import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// =============================================
// 优化点1: 全局单例 - 复用 Playwright MCP Client
// =============================================
let mcpClientInstance: Client | null = null;
let toolsCache: ChatCompletionTool[] | null = null;
let openaiClient: OpenAI | null = null;

async function getMCPClient(): Promise<Client> {
  if (mcpClientInstance) {
    try {
      await mcpClientInstance.listTools();
      return mcpClientInstance;
    } catch {
      mcpClientInstance = null;
      toolsCache = null;
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

function getOpenAIClient(): OpenAI {
  if (openaiClient) return openaiClient;

  openaiClient = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_API_BASE_URL,
  });

  return openaiClient;
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
  
  const systemMsg = messages.find(m => m.role === 'system');
  const recentMessages = messages.slice(-maxMessages);
  
  if (systemMsg && recentMessages[0]?.role !== 'system') {
    return [systemMsg, ...recentMessages];
  }
  
  return recentMessages;
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

    // 检查缓存
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
        try {
          await runTestAgentWithStream(input, (data: string) => {
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          });
          controller.close();
        } catch (error) {
          controller.error(error);
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
  const openai = getOpenAIClient();

  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `${SYSTEM_PROMPT}\n当前测试任务：${testTask}`,
    },
  ];

  const MAX_STEPS = 10;

  for (let step = 0; step < MAX_STEPS; step++) {
    onProgress(JSON.stringify({ step: step + 1, status: "thinking" }));

    const trimmedMessages = trimMessages(messages, 10);

    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "qwen-turbo",
      messages: trimmedMessages,
      tools,
      tool_choice: "auto",
      temperature: 0.3,
    });

    const choice = response.choices[0];
    const assistantMessage = choice.message;

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

      await mcpClient.close();
      mcpClientInstance = null;
      toolsCache = null;
      return;
    }

    for (const toolCall of assistantMessage.tool_calls) {
      const toolName = toolCall.function.name;
      const toolArgs = JSON.parse(toolCall.function.arguments);

      onProgress(JSON.stringify({ step: step + 1, status: "executing", tool: toolName }));

      try {
        const result = await mcpClient.callTool({
          name: toolName,
          arguments: toolArgs,
        });

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
  await mcpClient.close();
  mcpClientInstance = null;
  toolsCache = null;
}
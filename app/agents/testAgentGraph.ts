// 测试 Agent 状态图 - 使用 LangGraph 实现

import { StateGraph, END, START, Annotation, MessagesAnnotation } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { BaseMessage, SystemMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { convertMCPToolsToLangChain } from "./mcpToolAdapter";
import { getLLMClient, LLMClient } from "../llm/llmClient";
import { processSnapshot } from "../utils/snapshotProcessor";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { ToolCall } from "../utils/stepLibraryDB";

const SYSTEM_PROMPT = `你是一个专业的 Web 自动化测试 Agent。
任务：根据用户的测试需求，使用浏览器工具完成测试。
规则：
1. 使用 browser_snapshot 获取页面状态
2. 根据页面快照中的 ref 属性定位元素
3. 测试完成后，给出详细的测试结果报告
4. 操作失败时分析原因并重试`;

const LOGIN_KEYWORDS = [
  '登录', '登陆', '密码', 'password', 'login', 'signin', 'sign in',
  '用户名', 'username', '账号', '验证码', 'captcha'
];

const pendingResumes = new Map<string, () => void>();

export function waitForResume(taskId: string): Promise<void> {
  return new Promise((resolve) => {
    pendingResumes.set(taskId, resolve);
  });
}

export function resumeTest(taskId: string): boolean {
  const resolve = pendingResumes.get(taskId);
  if (resolve) {
    resolve();
    pendingResumes.delete(taskId);
    return true;
  }
  return false;
}

async function isLoginPage(pageContent: string, llmClient: LLMClient): Promise<boolean> {
  const hasKeyword = LOGIN_KEYWORDS.some(keyword =>
    pageContent.toLowerCase().includes(keyword.toLowerCase())
  );

  if (!hasKeyword) {
    return false;
  }

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

const AgentState = Annotation.Root({
  ...MessagesAnnotation.spec,
  loginRequired: Annotation<boolean>,
  script: Annotation<ToolCall[]>({
    reducer: (a, b) => a.concat(b),
    default: () => [],
  }),
  stepCount: Annotation<number>,
});

export async function createTestAgentGraph(
  mcpTools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>,
  mcpClient: Client,
  taskId: string,
  onProgress: (data: string) => void
) {
  const langchainTools = convertMCPToolsToLangChain(mcpTools, mcpClient);

  const llm = new ChatOpenAI({
    model: process.env.OPENAI_API_MODEL || "qwen3.6-35b-a3b",
    apiKey: process.env.OPENAI_API_KEY,
    configuration: {
      baseURL: process.env.OPENAI_API_BASE_URL,
    },
    temperature: 0.3,
  });

  const llmWithTools = llm.bindTools(langchainTools);
  const llmClient = getLLMClient();

  const agentNode = async (state: typeof AgentState.State) => {
    const stepCount = state.stepCount + 1;
    onProgress(JSON.stringify({
      step: stepCount,
      status: "thinking",
      content: "Agent 正在思考..."
    }));

    const systemMessage = new SystemMessage(SYSTEM_PROMPT);
    const response = await llmWithTools.invoke([systemMessage, ...state.messages]);

    if (response.tool_calls && response.tool_calls.length > 0) {
      for (const toolCall of response.tool_calls) {
        onProgress(JSON.stringify({
          step: stepCount,
          status: "executing",
          tool: toolCall.name
        }));
      }
    }

    return { messages: [response], stepCount };
  };

  const toolNode = async (state: typeof AgentState.State) => {
    const lastAI = [...state.messages].reverse().find(m => m._getType() === "ai") as AIMessage | undefined;
    const toolCalls = lastAI?.tool_calls || [];

    const toolMessages: BaseMessage[] = [];
    const newScript: ToolCall[] = [];

    for (const toolCall of toolCalls) {
      try {
        const result = await mcpClient.callTool({
          name: toolCall.name,
          arguments: toolCall.args,
        });

        newScript.push({ toolName: toolCall.name, arguments: toolCall.args });

        let processedResult: string;
        if (typeof result.content === "string") {
          processedResult = result.content;
        } else if (Array.isArray(result.content)) {
          processedResult = JSON.stringify(result.content);
        } else if (result.content && typeof result.content === "object") {
          processedResult = JSON.stringify(result.content);
        } else {
          processedResult = String(result.content || "");
        }

        if (toolCall.name === 'browser_snapshot') {
          processedResult = processSnapshot(processedResult);
        }

        onProgress(JSON.stringify({
          step: state.stepCount,
          status: "tool_result",
          tool: toolCall.name,
          result: processedResult.slice(0, 500)
        }));

        toolMessages.push(new ToolMessage({
          content: processedResult,
          tool_call_id: toolCall.id!,
          name: toolCall.name,
        }));
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        toolMessages.push(new ToolMessage({
          content: `Error: ${errorMsg}`,
          tool_call_id: toolCall.id!,
          name: toolCall.name,
        }));
      }
    }

    return { messages: toolMessages, script: newScript };
  };

  const checkLoginNode = async (state: typeof AgentState.State) => {
    const lastAI = [...state.messages].reverse().find(m => m._getType() === "ai") as AIMessage | undefined;
    const toolCalls = lastAI?.tool_calls || [];
    const snapshotCall = toolCalls.find(tc => tc.name === 'browser_snapshot');

    if (!snapshotCall) {
      return { loginRequired: false };
    }

    const lastToolMessage = state.messages[state.messages.length - 1];
    const content = typeof lastToolMessage.content === "string"
      ? lastToolMessage.content
      : JSON.stringify(lastToolMessage.content);

    const isLogin = await isLoginPage(content, llmClient);

    if (isLogin) {
      console.log(`🔐 检测到登录页面，暂停测试任务: ${taskId}`);
      onProgress(JSON.stringify({
        step: state.stepCount,
        status: "login_required",
        taskId,
        message: "检测到登录页面，请手动登录后点击继续"
      }));
    }

    return { loginRequired: isLogin };
  };

  const waitLoginNode = async (state: typeof AgentState.State) => {
    await waitForResume(taskId);

    console.log(`✅ 测试任务已恢复: ${taskId}`);
    onProgress(JSON.stringify({
      step: state.stepCount,
      status: "resumed",
      taskId,
      message: "用户已登录，继续测试"
    }));

    return { loginRequired: false };
  };

  const shouldContinue = (state: typeof AgentState.State) => {
    const lastMessage = state.messages[state.messages.length - 1];
    if (lastMessage._getType() === "ai" && (lastMessage as AIMessage).tool_calls?.length) {
      return "tools";
    }
    return END;
  };

  const afterCheckLogin = (state: typeof AgentState.State) => {
    return state.loginRequired ? "wait_login" : "agent";
  };

  const workflow = new StateGraph(AgentState)
    .addNode("agent", agentNode)
    .addNode("tools", toolNode)
    .addNode("check_login", checkLoginNode)
    .addNode("wait_login", waitLoginNode)
    .addEdge(START, "agent")
    .addConditionalEdges("agent", shouldContinue, ["tools", END])
    .addEdge("tools", "check_login")
    .addConditionalEdges("check_login", afterCheckLogin, ["wait_login", "agent"])
    .addEdge("wait_login", "agent");

  return workflow.compile();
}

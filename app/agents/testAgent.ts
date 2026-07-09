// 测试 Agent - 使用 LangChain 实现的 ReAct Agent

import { createAgent } from "langchain";
import { ChatOpenAI } from "@langchain/openai";
import { convertMCPToolsToLangChain } from "./mcpToolAdapter";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

// 系统提示词
const SYSTEM_PROMPT = `你是一个专业的 Web 自动化测试 Agent。
任务：根据用户的测试需求，使用浏览器工具完成测试。
规则：
1. 使用 browser_snapshot 获取页面状态
2. 根据页面快照中的 ref 属性定位元素
3. 测试完成后，给出详细的测试结果报告
4. 操作失败时分析原因并重试`;

/**
 * 创建测试 Agent
 * @param mcpTools MCP 工具列表
 * @param mcpClient MCP 客户端实例
 * @returns LangChain Agent 实例
 */
export async function createTestAgent(
  mcpTools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>,
  mcpClient: Client
) {
  // 1. 将 MCP 工具转换为 LangChain Tool
  const langchainTools = convertMCPToolsToLangChain(mcpTools, mcpClient);

  // 2. 初始化 LLM
  const llm = new ChatOpenAI({
    model: process.env.OPENAI_API_MODEL || "qwen3.6-35b-a3b",
    apiKey: process.env.OPENAI_API_KEY,
    configuration: {
      baseURL: process.env.OPENAI_API_BASE_URL,
    },
    temperature: 0.3,
  });

  // 3. 创建 Agent（使用新的 createAgent API）
  const agent = createAgent({
    model: llm,
    tools: langchainTools,
    systemPrompt: SYSTEM_PROMPT,
  });

  return agent;
}

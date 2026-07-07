// MCP 客户端管理模块 - 封装 Playwright MCP 连接和工具管理

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// MCP 客户端实例和传输层
let mcpClientInstance: Client | null = null;
let mcpTransportInstance: StdioClientTransport | null = null;
let toolsCache: ChatCompletionTool[] | null = null;

/**
 * 杀死进程树（跨平台）
 */
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

/**
 * 清理 MCP 客户端资源
 */
export async function cleanupMCPClient(): Promise<void> {
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

/**
 * 获取 MCP 客户端实例（单例模式）
 */
export async function getMCPClient(): Promise<Client> {
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

/**
 * 获取可用的工具列表（带缓存）
 */
export async function getTools(): Promise<ChatCompletionTool[]> {
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

// 进程退出时清理资源
process.on('exit', () => {
  cleanupMCPClient().catch(console.error);
});

process.on('SIGINT', () => {
  cleanupMCPClient().catch(console.error);
  process.exit(0);
});

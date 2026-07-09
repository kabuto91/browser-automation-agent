// MCP 客户端管理模块 - 封装 Playwright MCP 连接和工具管理

import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { BrowserPool } from './browserPool';

// 浏览器池实例（懒初始化）
let browserPoolInstance: BrowserPool | null = null;
let toolsCache: ChatCompletionTool[] | null = null;
let rawToolsCache: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> | null = null;

export function getBrowserPool(): BrowserPool {
  if (!browserPoolInstance) {
    const poolSize = parseInt(process.env.BROWSER_POOL_SIZE || '3', 10);
    browserPoolInstance = new BrowserPool(poolSize);
  }
  return browserPoolInstance;
}

/**
 * 获取可用的工具列表（带缓存）
 * 从浏览器池获取一个实例来查询工具列表
 */
export async function getTools(): Promise<ChatCompletionTool[]> {
  if (toolsCache) return toolsCache;

  const pool = getBrowserPool();
  const entry = await pool.acquire();

  try {
    const mcpTools = await entry.instance.client.listTools();

    // 缓存原始工具数据（用于 LangChain）
    rawToolsCache = mcpTools.tools.map((tool) => ({
      name: tool.name,
      description: tool.description || "",
      inputSchema: tool.inputSchema as Record<string, unknown>,
    }));

    // 转换为 OpenAI 格式
    toolsCache = rawToolsCache.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));

    console.log(`🧰 可用工具 (${toolsCache.length}个):`, toolsCache.map((t) => (t as any).function?.name || 'unknown').join(", "));
    return toolsCache;
  } finally {
    await pool.release(entry.clientId);
  }
}

/**
 * 获取原始工具列表（用于 LangChain）
 * 返回 { name, description, inputSchema } 格式
 */
export async function getRawTools(): Promise<Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>> {
  if (rawToolsCache) return rawToolsCache;
  await getTools(); // 确保缓存已填充
  return rawToolsCache!;
}

// 进程退出时清理资源
process.on('exit', () => {
  getBrowserPool().destroyAll().catch(console.error);
});

process.on('SIGINT', () => {
  getBrowserPool().destroyAll().catch(console.error);
  process.exit(0);
});

// MCP 客户端管理模块 - 封装 Playwright MCP 连接和工具管理

import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { BrowserPool } from './browserPool';

// 浏览器池实例（懒初始化）
let browserPoolInstance: BrowserPool | null = null;
let toolsCache: ChatCompletionTool[] | null = null;

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
  } finally {
    await pool.release(entry.clientId);
  }
}

// 进程退出时清理资源
process.on('exit', () => {
  getBrowserPool().destroyAll().catch(console.error);
});

process.on('SIGINT', () => {
  getBrowserPool().destroyAll().catch(console.error);
  process.exit(0);
});

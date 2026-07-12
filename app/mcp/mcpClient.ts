// MCP 客户端管理模块 - 封装 Playwright MCP 连接和工具管理

import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { BrowserPool } from './browserPool';
import { createMCPClientWithCDP, destroyExternalMCPClient, MCPClientInstance } from './mcpFactory';

// 浏览器池实例（懒初始化）
let browserPoolInstance: BrowserPool | null = null;
let toolsCache: ChatCompletionTool[] | null = null;
let rawToolsCache: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> | null = null;

// 外部浏览器实例管理（CDP 连接）
const externalClients = new Map<string, MCPClientInstance>();
const cdpEndpointMap = new Map<string, string>(); // instanceId -> cdpEndpoint

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

/**
 * 连接到外部浏览器（通过 CDP）
 * 如果已连接到同一 endpoint，则复用现有连接
 */
export async function connectExternalBrowser(cdpEndpoint: string): Promise<MCPClientInstance> {
  // 检查是否已连接到同一 endpoint
  for (const [instanceId, endpoint] of cdpEndpointMap.entries()) {
    if (endpoint === cdpEndpoint) {
      const existing = externalClients.get(instanceId);
      if (existing) {
        console.log(`🔗 复用已有 CDP 连接: ${cdpEndpoint} (instanceId: ${instanceId})`);
        return existing;
      }
    }
  }

  // 创建新连接
  console.log(`🔗 创建新的 CDP 连接: ${cdpEndpoint}`);
  const instance = await createMCPClientWithCDP(cdpEndpoint);
  externalClients.set(instance.instanceId, instance);
  cdpEndpointMap.set(instance.instanceId, cdpEndpoint);
  console.log(`✅ 外部浏览器连接成功: ${instance.instanceId}`);
  return instance;
}

/**
 * 断开外部浏览器连接
 */
export async function disconnectExternalBrowser(instanceId: string): Promise<void> {
  const instance = externalClients.get(instanceId);
  if (!instance) {
    console.warn(`⚠️ 未找到外部浏览器实例: ${instanceId}`);
    return;
  }

  console.log(`🔌 断开外部浏览器连接: ${instanceId}`);
  await destroyExternalMCPClient(instance);
  externalClients.delete(instanceId);
  cdpEndpointMap.delete(instanceId);
}

/**
 * 获取所有外部浏览器实例
 */
export function getExternalClients(): Map<string, MCPClientInstance> {
  return externalClients;
}

// 进程退出时清理资源
process.on('exit', () => {
  getBrowserPool().destroyAll().catch(console.error);
});

process.on('SIGINT', () => {
  getBrowserPool().destroyAll().catch(console.error);
  process.exit(0);
});

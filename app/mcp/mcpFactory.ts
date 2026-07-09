// MCP 客户端工厂模块 - 创建独立的 MCP 客户端实例

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { exec } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

export interface MCPClientInstance {
  client: Client;
  transport: StdioClientTransport;
  pid?: number;
  instanceId: string;
  userDataDir: string;
}

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
 * 创建一个新的 MCP 客户端实例
 * 为每个实例创建独立的用户数据目录，确保浏览器实例互不干扰
 */
export async function createMCPClient(): Promise<MCPClientInstance> {
  const instanceId = randomUUID().slice(0, 8);
  const userDataDir = path.join(os.tmpdir(), `playwright-mcp-${instanceId}`);

  // 确保目录存在
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  console.log(`🔧 [${instanceId}] 开始创建 MCP 实例，用户数据目录: ${userDataDir}`);

  const transport = new StdioClientTransport({
    command: "npx",
    args: ["@playwright/mcp@latest", "--user-data-dir", userDataDir],
  });

  const client = new Client(
    {
      name: `playwright-test-agent-${instanceId}`,
      version: "1.0.0",
    },
    {
      capabilities: {},
    }
  );

  console.log(`🔧 [${instanceId}] 正在连接到 MCP Server...`);
  await client.connect(transport);
  console.log(`✅ [${instanceId}] Playwright MCP Server 连接成功`);

  const pid = (transport as StdioClientTransport & { pid?: number }).pid;
  console.log(`✅ [${instanceId}] 进程 PID: ${pid}`);

  return {
    client,
    transport,
    pid,
    instanceId,
    userDataDir,
  };
}

/**
 * 销毁一个 MCP 客户端实例
 */
export async function destroyMCPClient(instance: MCPClientInstance): Promise<void> {
  try {
    await instance.client.close();
    console.log(`🔌 [${instance.instanceId}] Playwright MCP Client 已关闭`);
  } catch (e) {
    console.error(`关闭 MCP Client [${instance.instanceId}] 时出错:`, e);
  }

  if (instance.pid) {
    console.log(`🔪 [${instance.instanceId}] 杀掉 Playwright 进程树: PID ${instance.pid}`);
    await killProcessTree(instance.pid);
  }

  // 清理用户数据目录
  try {
    if (fs.existsSync(instance.userDataDir)) {
      fs.rmSync(instance.userDataDir, { recursive: true, force: true });
      console.log(`🧹 [${instance.instanceId}] 已清理用户数据目录: ${instance.userDataDir}`);
    }
  } catch (e) {
    console.error(`清理用户数据目录 [${instance.instanceId}] 时出错:`, e);
  }
}

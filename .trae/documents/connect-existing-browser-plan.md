# 连接已有浏览器实例完成测试 - 实施方案

## 摘要

支持通过 CDP (Chrome DevTools Protocol) 连接到已运行的浏览器实例执行测试，复用其已有的登录状态、Cookie 等数据。外部浏览器实例绕过现有的浏览器池管理。

## 当前状态分析

### 现有架构
- **mcpFactory.ts**: 通过 `npx @playwright/mcp@latest --user-data-dir <dir>` 每次启动全新浏览器进程
- **browserPool.ts**: 管理浏览器池（获取/归还/销毁），最多 N 个并发实例
- **route.ts**: 所有测试执行都从池中 `acquire()` 获取浏览器实例
- **testAgentGraph.ts**: 测试 Agent 通过传入的 MCP Client 执行浏览器操作

### 问题
- 每次测试都启动全新浏览器，无法复用已有登录状态
- 无法连接到用户已经打开并操作过的浏览器
- 对于需要登录态的测试场景，每次都要重新登录

## 方案概述

利用 `@playwright/mcp` 的 `--cdp-endpoint` 参数，连接到已运行的浏览器实例的 CDP 端口，而非启动新浏览器。

## 具体变更

### 1. mcpFactory.ts — 新增 CDP 连接工厂函数

新增 `createMCPClientWithCDP(cdpEndpoint: string)` 函数：

```typescript
export async function createMCPClientWithCDP(cdpEndpoint: string): Promise<MCPClientInstance> {
  const instanceId = randomUUID().slice(0, 8);
  
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["@playwright/mcp@latest", "--cdp-endpoint", cdpEndpoint],
  });
  
  // ... 与 createMCPClient 类似的 Client 创建和连接逻辑
  
  return {
    client,
    transport,
    pid,
    instanceId,
    userDataDir: '', // 不适用
  };
}
```

新增 `destroyExternalMCPClient(instance)` 函数（与 `destroyMCPClient` 区别）：
- 只关闭 MCP Client 连接
- **不杀掉进程**（浏览器不是我们启动的）
- **不清理 user-data-dir**（不存在）

### 2. mcpClient.ts — 新增外部浏览器管理

新增以下功能：
- `connectExternalBrowser(cdpEndpoint: string)`: 创建连接到外部浏览器的 MCP Client 实例
- `disconnectExternalBrowser(instanceId: string)`: 断开连接（不关闭浏览器）
- 维护一个 `externalClients: Map<string, MCPClientInstance>` 跟踪已连接的外部实例

```typescript
const externalClients = new Map<string, MCPClientInstance>();

export async function connectExternalBrowser(cdpEndpoint: string): Promise<MCPClientInstance> {
  // 如果已有连接到同一 CDP endpoint 的实例，直接复用
  for (const [, instance] of externalClients) {
    // 简单判断：同一 endpoint 复用
  }
  
  const instance = await createMCPClientWithCDP(cdpEndpoint);
  externalClients.set(instance.instanceId, instance);
  return instance;
}

export async function disconnectExternalBrowser(instanceId: string): Promise<void> {
  const instance = externalClients.get(instanceId);
  if (instance) {
    await destroyExternalMCPClient(instance);
    externalClients.delete(instanceId);
  }
}
```

### 3. route.ts — 支持外部浏览器参数

在 POST 请求处理中，新增对 `cdpEndpoint` 参数的支持：

```typescript
const { input, action, taskId, cdpEndpoint } = data;

// 启动测试时，如果提供了 cdpEndpoint，使用外部浏览器
if (cdpEndpoint) {
  const externalClient = await connectExternalBrowser(cdpEndpoint);
  // 使用 externalClient 执行测试，不走池
  await runTestAgentWithStream(input, onProgress, undefined, externalClient);
  // 测试完成后断开连接（或保持连接供后续使用）
}
```

同样为 `validate` 和 `execute-script` action 添加 `cdpEndpoint` 支持。

### 4. 前端页面 — 添加 CDP 连接入口

在前端测试输入界面添加：
- 一个可选的 "连接已有浏览器" 开关/输入框
- 用户输入 CDP 地址（默认 `http://localhost:9222`）
- 连接状态指示

### 5. 新增 API — 浏览器连接管理（可选）

新增 `/api/browser/connect` 和 `/api/browser/disconnect` 端点：
- `POST /api/browser/connect` — 连接到外部浏览器，返回 instanceId
- `POST /api/browser/disconnect` — 断开连接
- `GET /api/browser/status` — 查看当前连接的外部浏览器列表

## 文件变更清单

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `app/mcp/mcpFactory.ts` | 修改 | 新增 `createMCPClientWithCDP()` 和 `destroyExternalMCPClient()` |
| `app/mcp/mcpClient.ts` | 修改 | 新增 `connectExternalBrowser()`、`disconnectExternalBrowser()`、externalClients Map |
| `app/api/chat/route.ts` | 修改 | 支持 `cdpEndpoint` 参数，绕过池管理 |
| 前端组件（待确认具体文件） | 修改 | 添加 CDP 连接输入框和状态显示 |

## 假设与决策

1. **CDP 端点格式**: 默认支持 `http://localhost:9222` 格式，用户需先以 `chrome --remote-debugging-port=9222` 方式启动浏览器
2. **连接生命周期**: 测试完成后默认断开连接，但浏览器进程保持运行
3. **不复用池**: 外部浏览器完全绕过 BrowserPool，避免干扰现有的池管理逻辑
4. **同 endpoint 复用**: 对同一 CDP endpoint 的重复连接请求复用已有 MCP Client

## 验证步骤

1. 手动启动 Chrome: `chrome --remote-debugging-port=9222`
2. 在浏览器中手动登录某个网站
3. 通过前端输入 CDP 地址 `http://localhost:9222` 并发起测试
4. 验证测试能复用已有的登录状态
5. 验证测试完成后浏览器进程仍然存活
6. 验证不传 cdpEndpoint 时，原有池管理逻辑不受影响

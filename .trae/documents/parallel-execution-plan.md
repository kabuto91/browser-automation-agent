# 并行执行方案 — 浏览器池 + 步骤库批量执行

## 一、Summary

将当前单例 MCP Client 架构改造为浏览器池（Browser Pool），支持多个任务同时使用独立的浏览器实例并行执行。主要场景为步骤库批量执行，用户可勾选多个步骤同时运行，每个步骤拥有独立的浏览器实例和进度追踪。

## 二、Current State Analysis

### 当前架构瓶颈

1. **MCP Client 单例** — [mcpClient.ts](file:///d:/frontProjects/agent/my-first-agent/app/mcp/mcpClient.ts) 中 `mcpClientInstance` 是全局唯一的，所有任务共享同一个浏览器实例
2. **全局清理** — `cleanupMCPClient()` 销毁唯一实例，任何任务结束都会影响其他任务
3. **登录拦截状态全局** — `pendingResumes` Map 虽然按 taskId 区分，但底层只有一个浏览器，无法真正并行
4. **前端单任务** — [StepLibraryDrawer.tsx](file:///d:/frontProjects/agent/my-first-agent/app/components/StepLibraryDrawer.tsx) 中 `executingId !== null` 时禁用所有执行按钮，一次只能执行一个步骤

### 执行流程

```
前端 → POST /api/chat (action: execute-script)
     → getMCPClient() (单例)
     → executeScript(script, mcpClient)
     → cleanupMCPClient() (销毁)
```

## 三、Proposed Changes

### 1. 新建浏览器池管理器

**文件**: `app/mcp/browserPool.ts`（新建）

核心设计：
- 维护一个固定大小的 MCP Client 池（默认 3 个，可配置）
- 懒初始化：按需创建浏览器实例，直到达到池上限
- 提供 `acquire()` 方法获取可用实例，无可用时排队等待
- 提供 `release(client)` 方法归还实例
- 每个实例有独立的 `clientId` 用于追踪

```typescript
interface PoolEntry {
  clientId: string;
  client: Client;
  transport: StdioClientTransport;
  inUse: boolean;
}

class BrowserPool {
  private pool: PoolEntry[] = [];
  private maxSize: number;
  private waitQueue: Array<(entry: PoolEntry) => void> = [];

  async acquire(): Promise<PoolEntry> { ... }
  async release(clientId: string): Promise<void> { ... }
  async destroy(): Promise<void> { ... }
}
```

### 2. 改造 API 路由

**文件**: [route.ts](file:///d:/frontProjects/agent/my-first-agent/app/api/chat/route.ts)

改动点：
- 引入 `browserPool` 替代 `getMCPClient()` / `cleanupMCPClient()`
- 每个请求通过 `browserPool.acquire()` 获取独立浏览器实例
- 执行完毕后通过 `browserPool.release()` 归还，而非销毁
- `validate`、`execute-script`、普通测试三种 action 都走池化流程
- 登录拦截的 `waitForResume` / `resumeTest` 需要与 clientId 关联

关键代码变更：
```typescript
// execute-script action
const entry = await browserPool.acquire();
try {
  const result = await executeScript(script, entry.client, onProgress);
  // ...
} finally {
  await browserPool.release(entry.clientId);
}
```

### 3. 改造 scriptExecutor 支持独立 client

**文件**: [scriptExecutor.ts](file:///d:/frontProjects/agent/my-first-agent/app/utils/scriptExecutor.ts)

改动点：
- 无需大改，`executeScript` 已经接收 `mcpClient` 参数，只需确保传入的是池中获取的独立实例即可

### 4. 步骤库批量执行 UI

**文件**: [StepLibraryDrawer.tsx](file:///d:/frontProjects/agent/my-first-agent/app/components/StepLibraryDrawer.tsx)

改动点：
- 添加多选模式（Checkbox），用户可勾选多个步骤
- 新增"批量执行"按钮
- 批量执行时，为每个步骤创建独立的 SSE 连接，各自获取进度
- 用 `Map<string, ExecutionState>` 追踪每个步骤的执行状态
- 每个步骤的卡片上显示独立的执行进度（进度条/状态图标）

新增状态：
```typescript
const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
const [batchExecuting, setBatchExecuting] = useState(false);
const [executionStates, setExecutionStates] = useState<Map<string, {
  status: 'idle' | 'running' | 'success' | 'error';
  progress?: { step: number; total: number };
  error?: string;
}>>(new Map());
```

### 5. 池大小配置

**文件**: `.env.local`

```
BROWSER_POOL_SIZE=3
```

默认值 3，可根据机器性能调整。

## 四、Assumptions & Decisions

| 决策 | 选择 | 理由 |
|------|------|------|
| 池大小 | 默认 3 | 平衡并行度和内存消耗，每个 Chromium 实例约 200-400MB |
| 获取策略 | 等待队列 | 池满时排队等待，而非拒绝请求，用户体验更好 |
| 实例复用 | 归还后复用 | 避免频繁创建/销毁浏览器的开销 |
| 错误处理 | 实例出错即销毁重建 | 浏览器状态可能损坏，不复用出错的实例 |
| 登录拦截 | 批量执行时禁用 | 批量执行场景不应有登录拦截，避免阻塞 |

## 五、Implementation Order

1. **创建 `browserPool.ts`** — 浏览器池核心逻辑
2. **改造 `route.ts`** — 接入池化 API
3. **改造 `mcpClient.ts`** — 保留单实例创建能力，供池调用
4. **改造 `StepLibraryDrawer.tsx`** — 多选 + 批量执行 UI
5. **添加 `.env.local` 配置** — 池大小可配置

## 六、Verification

1. 启动应用，打开步骤库，勾选 2-3 个步骤点击批量执行
2. 验证每个步骤有独立的浏览器窗口（可通过任务管理器观察多个 chrome 进程）
3. 验证每个步骤的进度独立显示
4. 验证超过池大小时，多余任务排队等待
5. 验证某个步骤失败不影响其他步骤执行
6. 验证所有步骤完成后，浏览器实例正确归还池中

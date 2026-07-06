# 登录拦截器实现计划

## 概述

在自动化测试流程中实现登录拦截器：当检测到登录页面时暂停测试，等待用户手动登录后恢复执行。

**检测方式**：关键词匹配 + LLM 确认（两层检测）
**通信机制**：新增 REST API 接口处理暂停/恢复信号

---

## 当前状态分析

### 现有架构
- **后端核心**：`app/api/chat/route.ts` 中的 `runTestAgentWithStream` 函数
  - 测试循环：最多 10 步，每步包含 LLM 思考 → 工具调用 → 结果处理
  - 使用 SSE 单向流式传输（后端 → 前端）
  - 无暂停/恢复机制
  
- **前端**：`app/page.tsx`
  - 读取 SSE 流并展示进度
  - 无暂停状态处理和用户交互界面

### 关键限制
1. SSE 是单向的，前端无法向后端发送信号
2. 测试循环是同步执行的，无法中途暂停
3. 没有页面状态检测逻辑

---

## 实现方案

### 阶段 1：后端登录检测逻辑

**文件**：`app/api/chat/route.ts`

#### 1.1 添加登录页面检测函数

```typescript
// 关键词列表（用于快速筛选）
const LOGIN_KEYWORDS = [
  '登录', '登陆', '密码', 'password', 'login', 'signin', 'sign in',
  '用户名', 'username', '账号', '验证码', 'captcha'
];

/**
 * 检测是否为登录页面
 * @param pageContent 页面快照内容
 * @param llmClient LLM 客户端实例
 * @returns Promise<boolean> 是否为登录页面
 */
async function isLoginPage(pageContent: string, llmClient: any): Promise<boolean> {
  // 第一层：关键词匹配
  const hasKeyword = LOGIN_KEYWORDS.some(keyword => 
    pageContent.toLowerCase().includes(keyword.toLowerCase())
  );
  
  if (!hasKeyword) {
    return false; // 无关键词，直接返回非登录页
  }
  
  // 第二层：LLM 确认
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
    // LLM 失败时降级为关键词匹配结果
    return hasKeyword;
  }
}
```

#### 1.2 修改测试循环，添加登录检测点

在 `runTestAgentWithStream` 函数中：

```typescript
// 在每次工具调用后（browser_snapshot 返回结果后）添加检测
for (const toolCall of assistantMessage.tool_calls) {
  // ... 现有工具调用逻辑 ...
  
  const result = await Promise.race([...]);
  const toolResultText = typeof result.content === "string" 
    ? result.content 
    : JSON.stringify(result.content);
  
  // 🔥 新增：如果是 browser_snapshot 工具，检测登录页面
  if (toolName === 'browser_snapshot') {
    const isLogin = await isLoginPage(toolResultText, llmClient);
    
    if (isLogin) {
      // 发送暂停信号给前端
      onProgress(JSON.stringify({ 
        step: step + 1, 
        status: "login_required",
        message: "检测到登录页面，请手动登录后点击继续"
      }));
      
      // 等待用户恢复信号
      await waitForResume(testTask);
      
      // 用户已登录，继续执行
      onProgress(JSON.stringify({ 
        step: step + 1, 
        status: "resumed",
        message: "用户已登录，继续测试"
      }));
    }
  }
  
  // ... 继续现有逻辑 ...
}
```

#### 1.3 添加暂停/恢复状态管理

```typescript
// 全局存储暂停状态（使用 Map 支持多个并发测试任务）
const pendingResumes = new Map<string, {
  resolve: () => void;
  promise: Promise<void>;
}>();

/**
 * 等待用户恢复测试
 */
function waitForResume(taskId: string): Promise<void> {
  return new Promise((resolve) => {
    pendingResumes.set(taskId, {
      resolve,
      promise: null as any,
    });
    
    const entry = pendingResumes.get(taskId)!;
    entry.promise = new Promise<void>((res) => {
      entry.resolve = res;
    });
  });
}

/**
 * 恢复测试执行
 */
function resumeTest(taskId: string): boolean {
  const entry = pendingResumes.get(taskId);
  if (entry) {
    entry.resolve();
    pendingResumes.delete(taskId);
    return true;
  }
  return false;
}
```

#### 1.4 新增恢复接口

```typescript
// 新增 API 端点：POST /api/chat/resume
export async function POST(req: NextRequest) {
  // 如果是恢复请求
  if (req.url?.includes('/resume')) {
    try {
      const data = await req.json();
      const { taskId } = data;
      
      if (!taskId) {
        return NextResponse.json(
          { success: false, error: "缺少 taskId" }, 
          { status: 400 }
        );
      }
      
      const resumed = resumeTest(taskId);
      
      return NextResponse.json({
        success: resumed,
        message: resumed ? "测试已恢复" : "未找到暂停的测试任务"
      });
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : "Unknown error" },
        { status: 500 }
      );
    }
  }
  
  // 原有的测试启动逻辑...
}
```

**注意**：需要在 `route.ts` 中区分两种 POST 请求：
- `/api/chat` → 启动新测试
- `/api/chat/resume` → 恢复暂停的测试

可以通过 URL 路径或请求体中的 `action` 字段区分。

---

### 阶段 2：前端暂停界面

**文件**：`app/page.tsx`

#### 2.1 扩展 ProgressStep 接口

```typescript
interface ProgressStep {
  step: number;
  status: string;
  tool?: string;
  result?: string;
  error?: string;
  message?: string; // 新增：用于登录提示
}
```

#### 2.2 添加暂停状态处理

```typescript
// 新增状态
const [isPaused, setIsPaused] = useState(false);
const [currentTaskId, setCurrentTaskId] = useState('');

// 在 SSE 处理逻辑中添加
if (data.status === 'login_required') {
  setIsPaused(true);
  setCurrentTaskId(data.taskId || 'default');
  setProgress(prev => [...prev, data]);
}

if (data.status === 'resumed') {
  setIsPaused(false);
  setProgress(prev => [...prev, data]);
}
```

#### 2.3 添加"继续测试"按钮

```typescript
{isPaused && (
  <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 mb-6">
    <div className="flex items-center gap-3 mb-3">
      <span className="text-2xl">🔐</span>
      <div>
        <h3 className="font-semibold text-lg">检测到登录页面</h3>
        <p className="text-gray-600">请在浏览器中完成登录，然后点击继续按钮</p>
      </div>
    </div>
    <Button
      type="primary"
      size="large"
      onClick={handleResume}
      loading={isResuming}
    >
      已完成登录，继续测试
    </Button>
  </div>
)}
```

#### 2.4 实现恢复请求函数

```typescript
const [isResuming, setIsResuming] = useState(false);

const handleResume = async () => {
  setIsResuming(true);
  
  try {
    const response = await fetch('/api/chat/resume', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ taskId: currentTaskId }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || '恢复失败');
    }
    
    // 恢复成功，继续读取 SSE 流
    setIsPaused(false);
  } catch (err) {
    setError(err instanceof Error ? err.message : '恢复失败');
  } finally {
    setIsResuming(false);
  }
};
```

#### 2.5 更新状态图标映射

```typescript
const getStatusIcon = (status: string) => {
  switch (status) {
    case 'thinking':
      return { icon: '🔍', label: '思考中' };
    case 'executing':
      return { icon: '⚙️', label: '执行中' };
    case 'tool_result':
      return { icon: '✅', label: '完成' };
    case 'login_required':
      return { icon: '🔐', label: '等待登录' };
    case 'resumed':
      return { icon: '▶️', label: '已恢复' };
    case 'completed':
      return { icon: '🏁', label: '任务完成' };
    case 'error':
      return { icon: '❌', label: '错误' };
    default:
      return { icon: '📌', label: status };
  }
};
```

---

### 阶段 3：任务 ID 管理

为了让前端能够标识当前测试任务，需要：

#### 3.1 后端生成任务 ID

在 `runTestAgentWithStream` 开始时生成唯一 ID：

```typescript
import { randomUUID } from 'crypto';

async function runTestAgentWithStream(
  testTask: string,
  onProgress: (data: string) => void
): Promise<void> {
  const taskId = randomUUID();
  
  // 发送任务 ID 给前端
  onProgress(JSON.stringify({ 
    step: 0, 
    status: "started",
    taskId 
  }));
  
  // ... 后续逻辑使用 taskId ...
}
```

#### 3.2 前端保存任务 ID

```typescript
// 在 SSE 处理中
if (data.taskId) {
  setCurrentTaskId(data.taskId);
}
```

---

## 关键文件修改清单

| 文件 | 修改内容 | 优先级 |
|------|---------|--------|
| `app/api/chat/route.ts` | 添加登录检测、暂停/恢复逻辑、新增 `/resume` 端点 | 高 |
| `app/page.tsx` | 添加暂停状态 UI、恢复按钮、任务 ID 管理 | 高 |

---

## 验证步骤

### 1. 功能测试
- [ ] 启动测试任务，访问需要登录的网站
- [ ] 验证检测到登录页面时测试暂停
- [ ] 验证前端显示"等待登录"提示
- [ ] 手动在浏览器中完成登录
- [ ] 点击"继续测试"按钮，验证测试恢复执行
- [ ] 验证登录后的操作正常进行

### 2. 边界情况测试
- [ ] 测试无需登录的场景（不应触发拦截器）
- [ ] 测试 LLM API 失败时的降级处理
- [ ] 测试多次暂停/恢复的稳定性
- [ ] 测试超时处理（用户长时间不登录）

### 3. 性能测试
- [ ] 验证关键词匹配的性能（应 < 10ms）
- [ ] 验证 LLM 确认的响应时间（应 < 3s）
- [ ] 验证暂停/恢复机制不影响正常测试流程

---

## 假设与决策

### 已确认的决策
1. **检测方式**：关键词匹配 + LLM 确认（两层检测）
2. **通信机制**：新增 REST API `/api/chat/resume`
3. **任务标识**：使用 UUID 作为任务 ID

### 假设
1. 用户会在浏览器中手动完成登录操作
2. 登录过程不会改变测试任务的上下文
3. 暂停期间 MCP 客户端保持连接状态

### 潜在风险
1. **LLM API 成本**：每次 snapshot 都会调用 LLM 确认（可通过缓存优化）
2. **并发问题**：多个测试任务同时暂停时的状态管理
3. **超时处理**：用户长时间不登录时的资源占用

---

## 实现顺序建议

1. **第一步**：实现后端登录检测函数（`isLoginPage`）
2. **第二步**：添加暂停/恢复状态管理（`waitForResume` / `resumeTest`）
3. **第三步**：修改测试循环，集成登录检测
4. **第四步**：新增 `/api/chat/resume` 端点
5. **第五步**：前端添加暂停状态 UI 和恢复按钮
6. **第六步**：集成测试和边界情况处理

---

## 后续优化方向

1. **缓存优化**：对相同页面的 LLM 检测结果进行缓存
2. **超时机制**：添加自动超时（如 5 分钟未登录则终止测试）
3. **登录提示增强**：显示当前页面截图，帮助用户快速定位
4. **多登录场景**：支持测试过程中多次登录/登出

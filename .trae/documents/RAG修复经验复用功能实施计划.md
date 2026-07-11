# RAG 修复经验复用功能实施计划

## 一、功能概述

实现一个 RAG（Retrieval-Augmented Generation）系统，在测试失败自动修复成功时保存修复过程，遇到相似问题时检索并复用历史修复经验。

### 核心流程

```
测试失败 → Agent 自动修复 → 修复成功 → 保存修复经验（问题描述 + 修复步骤）
                                            ↓
新测试任务 → 检索相似问题 → 注入修复经验到 Agent 提示词 → 参考历史经验执行
```

## 二、技术选型

### 向量存储方案
- **选择**：LangChain MemoryVectorStore
- **理由**：
  - 无需额外依赖，与现有 LangChain 集成良好
  - 适合原型验证阶段，数据量不大时够用
  - 应用重启后需重建，但可通过持久化原始数据到 IndexedDB 解决

### 修复经验复用方式
- **选择**：注入 Agent 提示词
- **理由**：
  - 灵活性高，LLM 可根据当前场景调整策略
  - 不需要完全相同的场景，相似问题即可参考
  - 实现简单，只需修改系统提示词

## 三、当前架构分析

### 现有组件

1. **步骤库**（`stepLibraryDB.ts`）
   - 使用 IndexedDB 存储测试脚本
   - 记录执行统计（成功次数、最后执行时间）
   - 支持批量执行和验证

2. **测试 Agent**（`testAgentGraph.ts`）
   - 基于 LangGraph 实现
   - 系统提示词包含"操作失败时分析原因并重试"
   - 支持登录检测和暂停

3. **API 层**（`api/chat/route.ts`）
   - 处理测试任务、脚本执行、脚本验证
   - 使用 SSE 流式返回结果

### 数据流

```
用户输入 → API → Agent → MCP 工具 → 浏览器
                ↓
          记录 ToolCall 序列 → 步骤库
```

## 四、实施步骤

### 阶段 1：数据模型和存储层

#### 1.1 定义修复经验数据模型

**文件**：`app/utils/fixExperienceDB.ts`

```typescript
export interface FixExperience {
  id: string;
  problemDescription: string;      // 问题描述（原始任务 + 错误信息）
  errorType: string;               // 错误类型（如：元素未找到、超时、登录拦截等）
  fixSteps: ToolCall[];            // 修复步骤
  successCount: number;            // 复用成功次数
  createdAt: number;
  lastUsedAt?: number;
  embedding?: number[];            // 问题描述的向量表示
}
```

**存储方案**：
- 原始数据存入 IndexedDB（持久化）
- 向量数据在应用启动时从 IndexedDB 加载到 MemoryVectorStore

#### 1.2 实现 IndexedDB 存储层

**文件**：`app/utils/fixExperienceDB.ts`

**功能**：
- `addFixExperience(experience)` - 保存修复经验
- `getAllFixExperiences()` - 获取所有修复经验
- `updateFixExperienceStats(id, success)` - 更新复用统计
- 类似现有的 `stepLibraryDB.ts` 实现

### 阶段 2：向量检索服务

#### 2.1 创建嵌入和检索服务

**文件**：`app/rag/embeddingService.ts`

**功能**：
- 使用 LangChain 的 `OpenAIEmbeddings` 生成向量
- 复用现有的 `OPENAI_API_BASE_URL` 配置
- 提供 `generateEmbedding(text)` 方法

**文件**：`app/rag/vectorStore.ts`

**功能**：
- 初始化 MemoryVectorStore
- 应用启动时从 IndexedDB 加载数据并重建向量索引
- 提供 `addExperience(experience)` 方法
- 提供 `searchSimilarExperiences(problemDescription, topK)` 方法
- 返回相似度最高的修复经验列表

#### 2.2 向量存储初始化

**文件**：`app/rag/vectorStore.ts`

```typescript
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { OpenAIEmbeddings } from "@langchain/openai";

let vectorStore: MemoryVectorStore | null = null;

export async function initVectorStore() {
  const embeddings = new OpenAIEmbeddings({
    apiKey: process.env.OPENAI_API_KEY,
    configuration: {
      baseURL: process.env.OPENAI_API_BASE_URL,
    },
  });
  
  vectorStore = new MemoryVectorStore(embeddings);
  
  // 从 IndexedDB 加载历史数据
  const experiences = await getAllFixExperiences();
  for (const exp of experiences) {
    await vectorStore.addDocuments([
      new Document({
        pageContent: exp.problemDescription,
        metadata: {
          id: exp.id,
          errorType: exp.errorType,
          fixSteps: JSON.stringify(exp.fixSteps),
        },
      })
    ]);
  }
}

export async function searchSimilarExperiences(problem: string, topK = 3) {
  if (!vectorStore) await initVectorStore();
  
  const results = await vectorStore!.similaritySearch(problem, topK);
  return results.map(doc => ({
    id: doc.metadata.id,
    problemDescription: doc.pageContent,
    errorType: doc.metadata.errorType,
    fixSteps: JSON.parse(doc.metadata.fixSteps),
  }));
}
```

### 阶段 3：修复经验捕获

#### 3.1 检测测试失败和修复成功

**文件**：`app/agents/testAgentGraph.ts`

**修改点**：
- 在 `toolNode` 中检测工具调用失败
- 记录失败信息（错误类型、错误消息）
- 在后续重试中记录修复步骤
- 当重试成功时，触发保存修复经验

**实现逻辑**：
```typescript
// 在 AgentState 中添加
export const AgentState = Annotation.Root({
  ...MessagesAnnotation.spec,
  loginRequired: Annotation<boolean>,
  script: Annotation<ToolCall[]>({
    reducer: (a, b) => a.concat(b),
    default: () => [],
  }),
  stepCount: Annotation<number>,
  // 新增字段
  lastError: Annotation<string | null>,
  fixSteps: Annotation<ToolCall[]>({
    reducer: (a, b) => a.concat(b),
    default: () => [],
  }),
  hasError: Annotation<boolean>,
});
```

**在 toolNode 中**：
```typescript
// 检测失败
if (result.content.includes('Error:')) {
  return {
    lastError: errorMsg,
    hasError: true,
    fixSteps: [], // 清空之前的修复步骤
  };
}

// 如果之前有错误，现在成功了，记录修复步骤
if (state.hasError && !result.content.includes('Error:')) {
  return {
    fixSteps: newScript,
    hasError: false,
  };
}
```

#### 3.2 保存修复经验

**文件**：`app/api/chat/route.ts`

**修改点**：
- 在 `runTestAgentWithStream` 结束时检查是否有修复经验
- 如果有，调用保存 API

**保存逻辑**：
```typescript
// 在测试完成后
if (graphState.hasError && graphState.fixSteps.length > 0) {
  await saveFixExperience({
    problemDescription: testTask + '\n错误：' + graphState.lastError,
    errorType: classifyError(graphState.lastError),
    fixSteps: graphState.fixSteps,
  });
}
```

**错误分类函数**：
```typescript
function classifyError(error: string): string {
  if (error.includes('timeout')) return 'timeout';
  if (error.includes('not found') || error.includes('no such element')) return 'element_not_found';
  if (error.includes('login')) return 'login_required';
  return 'other';
}
```

### 阶段 4：修复经验注入

#### 4.1 修改测试 Agent 系统提示词

**文件**：`app/agents/testAgentGraph.ts`

**修改点**：
- 在创建 Agent 前检索相似修复经验
- 将修复经验注入到系统提示词中

**实现逻辑**：
```typescript
export async function createTestAgentGraph(
  mcpTools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>,
  mcpClient: Client,
  taskId: string,
  onProgress: (data: string) => void,
  testTask: string  // 新增参数：测试任务描述
) {
  // 检索相似修复经验
  const similarExperiences = await searchSimilarExperiences(testTask, 3);
  
  // 构建修复经验上下文
  let experienceContext = '';
  if (similarExperiences.length > 0) {
    experienceContext = '\n\n## 历史修复经验\n';
    experienceContext += '以下是一些类似问题的修复经验，供你参考：\n\n';
    
    for (const exp of similarExperiences) {
      experienceContext += `### 问题：${exp.problemDescription}\n`;
      experienceContext += `错误类型：${exp.errorType}\n`;
      experienceContext += `修复步骤：\n`;
      exp.fixSteps.forEach((step, idx) => {
        experienceContext += `${idx + 1}. ${step.toolName}: ${step.description || ''}\n`;
      });
      experienceContext += '\n';
    }
  }
  
  const systemMessage = new SystemMessage(SYSTEM_PROMPT + experienceContext);
  
  // ... 其余代码
}
```

#### 4.2 更新 API 调用

**文件**：`app/api/chat/route.ts`

**修改点**：
- 在调用 `createTestAgentGraph` 时传入 `testTask` 参数

```typescript
const graph = await createTestAgentGraph(
  tools, 
  mcpClient, 
  taskId, 
  onProgress,
  testTask  // 新增参数
);
```

### 阶段 5：前端展示（可选）

#### 5.1 添加修复经验库入口

**文件**：`app/page.tsx`

**修改点**：
- 添加"修复经验库"按钮
- 创建 `FixExperienceDrawer` 组件

#### 5.2 创建修复经验库组件

**文件**：`app/components/FixExperienceDrawer.tsx`

**功能**：
- 展示所有修复经验列表
- 显示问题描述、错误类型、修复步骤
- 显示复用次数和最后使用时间
- 支持删除和查看详情

**参考**：`StepLibraryDrawer.tsx` 的实现

### 阶段 6：API 端点

#### 6.1 添加修复经验管理 API

**文件**：`app/api/fix-experiences/route.ts`

**端点**：
- `GET /api/fix-experiences` - 获取所有修复经验
- `DELETE /api/fix-experiences/:id` - 删除修复经验
- `POST /api/fix-experiences` - 手动添加修复经验（用于测试）

## 五、文件清单

### 新增文件
1. `app/utils/fixExperienceDB.ts` - 修复经验 IndexedDB 存储层
2. `app/rag/embeddingService.ts` - 嵌入生成服务
3. `app/rag/vectorStore.ts` - 向量存储和检索服务
4. `app/api/fix-experiences/route.ts` - 修复经验管理 API
5. `app/components/FixExperienceDrawer.tsx` - 修复经验库前端组件（可选）

### 修改文件
1. `app/agents/testAgentGraph.ts` - 添加错误检测、修复经验捕获和注入
2. `app/api/chat/route.ts` - 添加修复经验保存逻辑，传递 testTask 参数
3. `app/page.tsx` - 添加修复经验库入口（可选）

## 六、依赖更新

### package.json 新增依赖
```json
{
  "dependencies": {
    "langchain": "^1.5.2",  // 已存在，包含 MemoryVectorStore
    "@langchain/openai": "^1.5.3"  // 已存在，包含 OpenAIEmbeddings
  }
}
```

**无需新增依赖**，现有 LangChain 生态已包含所需功能。

## 七、验证步骤

### 7.1 功能验证

1. **修复经验捕获**
   - 执行一个会失败的测试任务（如访问不存在的元素）
   - 验证 Agent 自动重试并成功
   - 检查 IndexedDB 中是否保存了修复经验

2. **修复经验检索**
   - 执行一个与之前相似的测试任务
   - 验证系统提示词中包含了历史修复经验
   - 检查 Agent 是否参考了历史经验

3. **向量检索准确性**
   - 保存多个不同类型的修复经验
   - 测试检索结果是否按相似度排序
   - 验证 topK 参数是否生效

### 7.2 性能验证

- 向量检索响应时间 < 500ms
- 应用启动时向量索引重建时间 < 5s（100 条数据）
- 内存占用增加 < 50MB

### 7.3 边界情况

- 没有相似修复经验时，系统提示词不包含额外上下文
- 修复经验过多时，只注入最相似的 top 3
- 应用重启后，向量索引能正确重建

## 八、实施顺序

1. **阶段 1**：数据模型和存储层（1-2 小时）
2. **阶段 2**：向量检索服务（2-3 小时）
3. **阶段 3**：修复经验捕获（2-3 小时）
4. **阶段 4**：修复经验注入（1-2 小时）
5. **阶段 5**：前端展示（可选，2-3 小时）
6. **阶段 6**：API 端点（1-2 小时）
7. **测试和优化**（2-3 小时）

**总预计时间**：11-18 小时

## 九、风险和挑战

### 9.1 技术风险
- **向量检索准确性**：依赖嵌入模型质量，可能需要调整 topK 参数
- **错误检测准确性**：需要准确识别工具调用失败和修复成功
- **内存占用**：MemoryVectorStore 在内存中，大量数据时可能占用较多内存

### 9.2 缓解措施
- 使用相似度阈值，只注入高相似度的修复经验
- 限制修复经验数量，定期清理低使用率的记录
- 提供手动删除和编辑修复经验的功能

## 十、后续优化方向

1. **持久化向量索引**：将向量数据持久化到磁盘，避免重启后重建
2. **增量更新**：支持增量添加修复经验，而不是每次重建索引
3. **多模态检索**：支持基于页面快照的相似度检索
4. **修复经验评分**：根据复用成功率对修复经验进行评分和排序
5. **自动泛化**：使用 LLM 将具体的修复步骤泛化为可复用的策略

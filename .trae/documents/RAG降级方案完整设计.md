# RAG 降级方案完整设计

## 摘要

当前已实现关键词匹配作为手动降级方案，但缺少自动降级机制。本文档设计完整的降级策略，确保在没有 embedding 模型的情况下 RAG 功能仍可用。

## 当前状态分析

### 已实现功能

1. **关键词匹配降级**（手动切换）
   - 文件：`app/rag/keywordSearch.ts`
   - 通过 `RAG_STRATEGY=keyword` 环境变量启用
   - 基于关键词提取和评分的检索算法

2. **向量检索**（默认方案）
   - 文件：`app/rag/vectorStore.ts`
   - 使用 LangChain MemoryVectorStore
   - 依赖 OpenAIEmbeddings 生成向量

3. **策略切换逻辑**
   - 文件：`app/rag/vectorStore.ts` 第 76-82 行
   - 根据 `RAG_STRATEGY` 环境变量选择策略

### 存在的问题

1. **缺少自动降级**
   - 当 `RAG_STRATEGY=embedding`（默认）但 embedding 模型不可用时，`initVectorStore()` 会失败
   - 失败后 `vectorStore` 为 null，返回空结果
   - 没有自动回退到关键词匹配

2. **缺少配置**
   - `.env.local` 中没有 `RAG_STRATEGY` 配置项
   - 用户不知道可以切换策略

3. **错误处理不完善**
   - `embeddingService.ts` 创建实例时不验证可用性
   - 实际失败发生在 `addDocuments()` 或 `similaritySearchWithScore()` 调用时
   - 缺少明确的错误提示和降级日志

## 降级方案设计

### 策略层级

```
优先级 1: RAG_STRATEGY=keyword    → 直接使用关键词匹配
优先级 2: RAG_STRATEGY=embedding  → 尝试向量检索，失败则自动降级
优先级 3: RAG_STRATEGY=none       → 不使用 RAG，返回空结果
```

### 自动降级机制

当 `RAG_STRATEGY=embedding` 时：

1. **初始化阶段降级**
   - 尝试创建 `MemoryVectorStore` 和 `OpenAIEmbeddings`
   - 如果失败（API key 无效、模型不可用等），自动切换到关键词匹配
   - 输出警告日志：`⚠️ Embedding 模型不可用，自动降级到关键词匹配`

2. **检索阶段降级**
   - 如果 `vectorStore` 为 null，使用关键词匹配
   - 如果 `similaritySearchWithScore()` 抛出异常，捕获并降级

3. **降级标志**
   - 添加全局标志 `isUsingKeywordFallback`
   - 首次降级后输出日志，后续请求直接使用关键词匹配
   - 避免每次都尝试 embedding 导致重复失败

### 配置项设计

在 `.env.local` 中添加：

```bash
# RAG 检索策略配置
# 可选值：
# - embedding（默认）：使用向量检索，需要 embedding 模型支持
# - keyword：使用关键词匹配，无需外部 API，适合快速测试
# - none：禁用 RAG 功能
RAG_STRATEGY=embedding

# 自动降级开关（仅当 RAG_STRATEGY=embedding 时生效）
# true（默认）：embedding 失败时自动降级到 keyword
# false：embedding 失败时直接返回空结果
RAG_AUTO_FALLBACK=true
```

## 实现计划

### 阶段 1：完善自动降级机制

**文件：`app/rag/vectorStore.ts`**

1. 添加全局降级标志
```typescript
let hasEmbeddingFailed = false;
let hasLoggedFallback = false;
```

2. 修改 `initVectorStore()` 添加错误处理
```typescript
export async function initVectorStore(): Promise<void> {
  if (isInitialized) {
    return;
  }

  const autoFallback = process.env.RAG_AUTO_FALLBACK !== 'false';

  try {
    const embeddings = getEmbeddings();
    vectorStore = new MemoryVectorStore(embeddings);

    // 测试 embedding 是否可用（添加一个空文档）
    const testDoc = new Document({
      pageContent: 'test',
      metadata: { test: true },
    });
    await vectorStore.addDocuments([testDoc]);

    // 加载历史修复经验
    const experiences = await getAllFixExperiences();
    if (experiences.length > 0) {
      const documents = experiences.map(exp => 
        new Document({
          pageContent: exp.problemDescription,
          metadata: {
            id: exp.id,
            errorType: exp.errorType,
            fixSteps: JSON.stringify(exp.fixSteps),
            successCount: exp.successCount,
          },
        })
      );
      await vectorStore.addDocuments(documents);
      console.log(`✅ 向量存储初始化完成，加载了 ${experiences.length} 条修复经验`);
    } else {
      console.log('ℹ️ 向量存储初始化完成，暂无修复经验数据');
    }

    isInitialized = true;
  } catch (error) {
    console.error('❌ 向量存储初始化失败:', error);
    
    if (autoFallback) {
      hasEmbeddingFailed = true;
      if (!hasLoggedFallback) {
        console.warn('⚠️ Embedding 模型不可用，自动降级到关键词匹配');
        hasLoggedFallback = true;
      }
    } else {
      vectorStore = null;
      isInitialized = true; // 标记为已初始化，避免重复尝试
    }
  }
}
```

3. 修改 `searchSimilarExperiences()` 添加降级逻辑
```typescript
export async function searchSimilarExperiences(
  problemDescription: string,
  topK: number = 3
): Promise<SimilarExperience[]> {
  const strategy = process.env.RAG_STRATEGY || 'embedding';

  // 策略 1：禁用 RAG
  if (strategy === 'none') {
    return [];
  }

  // 策略 2：强制使用关键词匹配
  if (strategy === 'keyword') {
    if (!hasLoggedFallback) {
      console.log('🔍 使用关键词匹配策略检索修复经验');
      hasLoggedFallback = true;
    }
    return searchByKeyword(problemDescription, topK);
  }

  // 策略 3：尝试向量检索，失败则降级
  if (hasEmbeddingFailed) {
    // 已经知道 embedding 不可用，直接使用关键词匹配
    return searchByKeyword(problemDescription, topK);
  }

  if (!vectorStore) {
    await initVectorStore();
  }

  // 初始化失败且启用了自动降级
  if (!vectorStore && process.env.RAG_AUTO_FALLBACK !== 'false') {
    return searchByKeyword(problemDescription, topK);
  }

  if (!vectorStore) {
    return [];
  }

  try {
    const results = await vectorStore.similaritySearchWithScore(problemDescription, topK);
    return results.map(([doc, score]) => ({
      id: doc.metadata.id,
      problemDescription: doc.pageContent,
      errorType: doc.metadata.errorType,
      fixSteps: JSON.parse(doc.metadata.fixSteps),
      successCount: doc.metadata.successCount,
      score: 1 - score,
    }));
  } catch (error) {
    console.error('向量检索失败，降级到关键词匹配:', error);
    hasEmbeddingFailed = true;
    return searchByKeyword(problemDescription, topK);
  }
}
```

### 阶段 2：添加配置项

**文件：`.env.local`**

添加以下配置：

```bash
# RAG 检索策略配置
# 可选值：
# - embedding（默认）：使用向量检索，需要 embedding 模型支持
# - keyword：使用关键词匹配，无需外部 API，适合快速测试
# - none：禁用 RAG 功能
RAG_STRATEGY=embedding

# 自动降级开关（仅当 RAG_STRATEGY=embedding 时生效）
# true（默认）：embedding 失败时自动降级到 keyword
# false：embedding 失败时直接返回空结果
RAG_AUTO_FALLBACK=true
```

### 阶段 3：添加状态查询 API（可选）

**文件：`app/api/rag-status/route.ts`**

提供 RAG 状态查询接口，方便调试：

```typescript
import { NextResponse } from 'next/server';

export async function GET() {
  const strategy = process.env.RAG_STRATEGY || 'embedding';
  const autoFallback = process.env.RAG_AUTO_FALLBACK !== 'false';

  return NextResponse.json({
    success: true,
    data: {
      strategy,
      autoFallback,
      embeddingAvailable: !hasEmbeddingFailed,
    },
  });
}
```

## 降级场景测试矩阵

| 场景 | RAG_STRATEGY | RAG_AUTO_FALLBACK | Embedding 可用性 | 预期行为 |
|------|--------------|-------------------|------------------|----------|
| 1 | embedding | true | ✅ 可用 | 使用向量检索 |
| 2 | embedding | true | ❌ 不可用 | 自动降级到关键词匹配 |
| 3 | embedding | false | ✅ 可用 | 使用向量检索 |
| 4 | embedding | false | ❌ 不可用 | 返回空结果 |
| 5 | keyword | - | - | 使用关键词匹配 |
| 6 | none | - | - | 返回空结果 |

## 变更文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `app/rag/vectorStore.ts` | 修改 | 添加自动降级机制和错误处理 |
| `.env.local` | 修改 | 添加 `RAG_STRATEGY` 和 `RAG_AUTO_FALLBACK` 配置 |
| `app/api/rag-status/route.ts` | 新增（可选） | RAG 状态查询接口 |

## 验证步骤

1. **测试自动降级**
   - 设置 `RAG_STRATEGY=embedding` 和 `RAG_AUTO_FALLBACK=true`
   - 配置无效的 embedding API key
   - 执行测试任务，检查日志是否输出 "自动降级到关键词匹配"
   - 确认返回了关键词匹配的结果

2. **测试手动切换**
   - 设置 `RAG_STRATEGY=keyword`
   - 执行测试任务，检查日志是否输出 "使用关键词匹配策略"
   - 确认不尝试调用 embedding API

3. **测试禁用 RAG**
   - 设置 `RAG_STRATEGY=none`
   - 执行测试任务，确认不检索修复经验

4. **测试正常流程**
   - 设置 `RAG_STRATEGY=embedding` 和有效的 API key
   - 执行测试任务，确认使用向量检索

## 假设与决策

1. **自动降级为默认行为**：`RAG_AUTO_FALLBACK=true` 为默认值，确保系统在 embedding 不可用时仍能提供基本的 RAG 功能

2. **降级标志持久化**：`hasEmbeddingFailed` 标志在应用生命周期内持久化，避免每次请求都尝试失败的 embedding

3. **日志级别**：降级时使用 `warn` 级别，确保用户能注意到但不影响正常使用

4. **不修改调用方**：`testAgentGraph.ts` 无需修改，降级对调用方透明

5. **关键词匹配精度可接受**：对于修复经验数量较少（< 100 条）的场景，关键词匹配的精度可以接受

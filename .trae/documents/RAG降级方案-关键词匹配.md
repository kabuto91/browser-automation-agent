# RAG 降级方案 - 关键词匹配

## 摘要

为 RAG 修复经验检索功能添加关键词匹配降级方案。通过环境变量 `RAG_STRATEGY` 手动选择检索策略：`embedding`（默认，使用向量检索）或 `keyword`（关键词匹配，无需 embedding 模型）。

## 当前状态分析

### 现有实现

- **`app/rag/embeddingService.ts`**：使用 `OpenAIEmbeddings`（`text-embedding-3-small` 模型）生成向量
- **`app/rag/vectorStore.ts`**：使用 `MemoryVectorStore` 进行相似度检索，唯一入口是 `searchSimilarExperiences(problemDescription, topK)`
- **`app/utils/fixExperienceDB.ts`**：`FixExperience` 数据模型，包含 `errorType`、`problemDescription`、`fixSteps`、`successCount` 字段
- **调用方**：`app/agents/testAgentGraph.ts` 第 119 行调用 `searchSimilarExperiences(testTask, 3)`

### 问题

当前唯一的检索路径依赖 embedding 模型。如果 API 不支持 embedding 模型（如某些兼容 OpenAI 接口的国内服务），RAG 功能完全不可用。

## 设计方案

### 策略选择

通过环境变量 `RAG_STRATEGY` 控制：

| 值 | 行为 |
|---|---|
| `embedding`（默认） | 使用现有的 MemoryVectorStore 向量检索 |
| `keyword` | 使用关键词匹配，不依赖任何外部 API |

### 关键词匹配算法

1. 从 `problemDescription` 中提取关键词（按空格、标点分词，过滤停用词和短词）
2. 对每条修复经验计算匹配分数：
   - `errorType` 完全匹配：+3 分
   - `problemDescription` 中关键词命中：每个 +1 分
   - `successCount` 加权：`successCount * 0.5` 分（复用次数多的优先）
3. 按分数降序排序，返回 top K

### 文件变更

#### 1. 新增 `app/rag/keywordSearch.ts`

关键词匹配检索实现。

```typescript
import { getAllFixExperiences, FixExperience } from '../utils/fixExperienceDB';
import { SimilarExperience } from './vectorStore';

const STOP_WORDS = new Set([
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一',
  '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着',
  '没有', '看', '好', '自己', '这', '他', '她', '它', '们', '那', '些',
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'shall', 'it', 'its', 'this', 'that',
  'and', 'or', 'but', 'if', 'then', 'else', 'when', 'at', 'by', 'for',
  'with', 'about', 'against', 'between', 'through', 'during', 'before',
  'after', 'above', 'below', 'from', 'up', 'down', 'in', 'out', 'on',
  'off', 'over', 'under', 'again', 'further', 'once', 'here', 'there',
  'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some',
  'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than',
  'too', 'very', 'just', 'because', 'as', 'until', 'while', 'of', 'at',
]);

function extractKeywords(text: string): string[] {
  // 按非字母数字字符分词，转小写，过滤停用词和长度<=1的词
  const tokens = text
    .toLowerCase()
    .split(/[^a-zA-Z0-9\u4e00-\u9fff]+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t));

  // 去重
  return [...new Set(tokens)];
}

function scoreExperience(
  exp: FixExperience,
  queryKeywords: string[]
): number {
  let score = 0;

  // errorType 匹配（使用 queryKeywords 中是否包含 errorType 关键词）
  for (const keyword of queryKeywords) {
    if (exp.errorType.toLowerCase().includes(keyword) || keyword.includes(exp.errorType)) {
      score += 3;
      break;
    }
  }

  // problemDescription 关键词命中
  const descLower = exp.problemDescription.toLowerCase();
  for (const keyword of queryKeywords) {
    if (descLower.includes(keyword)) {
      score += 1;
    }
  }

  // successCount 加权
  score += exp.successCount * 0.5;

  return score;
}

export async function searchByKeyword(
  problemDescription: string,
  topK: number = 3
): Promise<SimilarExperience[]> {
  const experiences = await getAllFixExperiences();
  if (experiences.length === 0) return [];

  const queryKeywords = extractKeywords(problemDescription);
  if (queryKeywords.length === 0) {
    // 无法提取关键词时，按 successCount 降序返回最新的
    return experiences
      .sort((a, b) => b.successCount - a.successCount)
      .slice(0, topK)
      .map(exp => ({
        id: exp.id,
        problemDescription: exp.problemDescription,
        errorType: exp.errorType,
        fixSteps: exp.fixSteps,
        successCount: exp.successCount,
        score: 0,
      }));
  }

  const scored = experiences.map(exp => ({
    experience: exp,
    score: scoreExperience(exp, queryKeywords),
  }));

  // 过滤掉0分的，按分数降序排序
  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(s => ({
      id: s.experience.id,
      problemDescription: s.experience.problemDescription,
      errorType: s.experience.errorType,
      fixSteps: s.experience.fixSteps,
      successCount: s.experience.successCount,
      score: s.score,
    }));
}
```

#### 2. 修改 `app/rag/vectorStore.ts`

在 `searchSimilarExperiences` 中根据 `RAG_STRATEGY` 环境变量选择策略。

```typescript
// 新增导入
import { searchByKeyword } from './keywordSearch';

// 修改 searchSimilarExperiences
export async function searchSimilarExperiences(
  problemDescription: string,
  topK: number = 3
): Promise<SimilarExperience[]> {
  const strategy = process.env.RAG_STRATEGY || 'embedding';

  if (strategy === 'keyword') {
    console.log('🔍 使用关键词匹配策略检索修复经验');
    return searchByKeyword(problemDescription, topK);
  }

  // 默认：embedding 策略（现有逻辑）
  if (!vectorStore) {
    await initVectorStore();
  }
  if (!vectorStore) {
    return [];
  }

  const results = await vectorStore.similaritySearchWithScore(problemDescription, topK);
  return results.map(([doc, score]) => ({
    id: doc.metadata.id,
    problemDescription: doc.pageContent,
    errorType: doc.metadata.errorType,
    fixSteps: JSON.parse(doc.metadata.fixSteps),
    successCount: doc.metadata.successCount,
    score: 1 - score,
  }));
}
```

#### 3. `.env.local` 添加配置（可选）

```
# RAG 检索策略：embedding（默认）| keyword
RAG_STRATEGY=embedding
```

### 变更文件清单

| 文件 | 操作 | 说明 |
|---|---|---|
| `app/rag/keywordSearch.ts` | 新增 | 关键词匹配检索实现 |
| `app/rag/vectorStore.ts` | 修改 | `searchSimilarExperiences` 增加策略分支 |

### 不变更的文件

- `app/agents/testAgentGraph.ts`：调用方无需修改，接口不变
- `app/utils/fixExperienceDB.ts`：数据层无需修改
- `app/api/chat/route.ts`：保存逻辑无需修改

## 假设与决策

1. **只支持手动切换**：不做自动检测失败后降级，用户通过环境变量明确控制
2. **关键词匹配精度有限**：对于修复经验数量较少（< 100 条）的场景可接受，数据量大时应使用 embedding
3. **中文分词简化处理**：使用正则分词而非专业分词库（如 jieba），避免额外依赖。对于当前修复经验的短文本场景够用
4. **`SimilarExperience` 接口不变**：关键词匹配返回的 `score` 是匹配分数（非 0-1 相似度），但调用方只关心排序，不关心具体分数值

## 验证步骤

1. 设置 `RAG_STRATEGY=keyword`，保存修复经验后执行相似测试，确认关键词匹配能返回相关结果
2. 设置 `RAG_STRATEGY=embedding`（或删除该变量），确认行为与之前一致
3. 在 `keyword` 模式下检查控制台日志，确认输出 "使用关键词匹配策略检索修复经验"
4. 测试边界情况：修复经验库为空时、problemDescription 无法提取关键词时，确认不报错

// 向量存储服务 - 使用 LangChain MemoryVectorStore

import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { Document } from '@langchain/core/documents';
import { getEmbeddings } from './embeddingService';
import { getAllFixExperiences, FixExperience } from '../utils/fixExperienceDB';
import { searchByKeyword } from './keywordSearch';

let vectorStore: MemoryVectorStore | null = null;
let isInitialized = false;
let hasEmbeddingFailed = false;
let hasLoggedFallback = false;

export async function initVectorStore(): Promise<void> {
  if (isInitialized) {
    return;
  }

  const autoFallback = process.env.RAG_AUTO_FALLBACK !== 'false';

  try {
    const embeddings = getEmbeddings();
    vectorStore = new MemoryVectorStore(embeddings);

    // 测试 embedding 是否可用
    const testDoc = new Document({
      pageContent: 'test',
      metadata: { test: true },
    });
    await vectorStore.addDocuments([testDoc]);

    // 从 IndexedDB 加载历史修复经验
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
      isInitialized = true;
    }
  }
}

export async function addExperienceToVectorStore(experience: FixExperience): Promise<void> {
  if (!vectorStore) {
    await initVectorStore();
  }

  const document = new Document({
    pageContent: experience.problemDescription,
    metadata: {
      id: experience.id,
      errorType: experience.errorType,
      fixSteps: JSON.stringify(experience.fixSteps),
      successCount: experience.successCount,
    },
  });

  await vectorStore!.addDocuments([document]);
}

export interface SimilarExperience {
  id: string;
  problemDescription: string;
  errorType: string;
  fixSteps: any[];
  successCount: number;
  score: number;
}

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
      score: 1 - score, // 转换为相似度分数（0-1）
    }));
  } catch (error) {
    console.error('向量检索失败，降级到关键词匹配:', error);
    hasEmbeddingFailed = true;
    if (!hasLoggedFallback) {
      console.warn('⚠️ Embedding 模型不可用，自动降级到关键词匹配');
      hasLoggedFallback = true;
    }
    return searchByKeyword(problemDescription, topK);
  }
}

export async function resetVectorStore(): Promise<void> {
  vectorStore = null;
  isInitialized = false;
  hasEmbeddingFailed = false;
  hasLoggedFallback = false;
}

export function isEmbeddingAvailable(): boolean {
  return !hasEmbeddingFailed;
}

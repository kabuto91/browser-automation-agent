// 向量存储服务 - 使用 LangChain MemoryVectorStore

import { MemoryVectorStore } from 'langchain/vectorstores/memory';
import { Document } from '@langchain/core/documents';
import { getEmbeddings } from './embeddingService';
import { getAllFixExperiences, FixExperience } from '../utils/fixExperienceDB';
import { searchByKeyword } from './keywordSearch';

let vectorStore: MemoryVectorStore | null = null;
let isInitialized = false;

export async function initVectorStore(): Promise<void> {
  if (isInitialized) {
    return;
  }

  const embeddings = getEmbeddings();
  vectorStore = new MemoryVectorStore(embeddings);

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

  // 降级方案：使用关键词匹配
  if (strategy === 'keyword') {
    console.log('🔍 使用关键词匹配策略检索修复经验');
    return searchByKeyword(problemDescription, topK);
  }

  // 默认方案：使用向量检索
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
    score: 1 - score, // 转换为相似度分数（0-1）
  }));
}

export async function resetVectorStore(): Promise<void> {
  vectorStore = null;
  isInitialized = false;
}

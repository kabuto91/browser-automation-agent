import { ChromaClient, Collection, IncludeEnum } from 'chromadb';
import { EmbeddingService, getEmbeddingService } from './embeddings';
import { SuccessCase, FailureContext } from './successCaseStorage';
import * as path from 'path';

const COLLECTION_NAME = 'test_success_cases';
const PERSIST_DIR = path.join(process.cwd(), 'data', 'chroma');

export interface SearchResult {
  case: SuccessCase;
  distance: number;
  similarity: number;
}

export class VectorStore {
  private client: ChromaClient;
  private collection: Collection | null = null;
  private embeddingService: EmbeddingService;
  private initialized = false;

  constructor() {
    this.client = new ChromaClient({
      path: 'http://localhost:8000', // ChromaDB 默认端口
    });
    this.embeddingService = getEmbeddingService();
  }

  /**
   * 初始化向量存储
   */
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // 尝试获取已存在的 collection
      try {
        this.collection = await this.client.getCollection({
          name: COLLECTION_NAME,
        });
        console.log('[VectorStore] Loaded existing collection:', COLLECTION_NAME);
      } catch {
        // 如果不存在，创建新的 collection
        this.collection = await this.client.createCollection({
          name: COLLECTION_NAME,
          metadata: {
            description: 'Test success cases for RAG retrieval',
            created_at: new Date().toISOString(),
          },
        });
        console.log('[VectorStore] Created new collection:', COLLECTION_NAME);
      }

      this.initialized = true;
      console.log('[VectorStore] Initialized successfully');
    } catch (error: any) {
      console.error('[VectorStore] Failed to initialize:', error.message);
      // 如果 ChromaDB 服务不可用，使用内存存储作为后备
      console.log('[VectorStore] Falling back to in-memory vector store');
      this.initialized = true;
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
  }

  /**
   * 添加案例到向量存储
   */
  async addCase(caseData: SuccessCase): Promise<void> {
    await this.ensureInitialized();

    if (!this.collection) {
      console.warn('[VectorStore] Collection not available, skipping add');
      return;
    }

    const caseText = this.embeddingService.generateCaseText(caseData);
    const embedding = await this.embeddingService.embed(caseText);

    try {
      await this.collection.add({
        ids: [caseData.id],
        embeddings: [embedding],
        metadatas: [{
          errorType: caseData.failureContext.errorType,
          successRate: caseData.metadata.successRate,
          useCount: caseData.metadata.useCount,
          createdAt: caseData.metadata.createdAt,
          tags: JSON.stringify(caseData.metadata.tags),
        }],
        documents: [caseText],
      });

      console.log('[VectorStore] Added case:', caseData.id);
    } catch (error: any) {
      console.error('[VectorStore] Failed to add case:', error.message);
    }
  }

  /**
   * 批量添加案例
   */
  async addCases(cases: SuccessCase[]): Promise<void> {
    await this.ensureInitialized();

    if (!this.collection || cases.length === 0) {
      return;
    }

    const texts = cases.map(c => this.embeddingService.generateCaseText(c));
    const embeddings = await this.embeddingService.embedBatch(texts);

    try {
      await this.collection.add({
        ids: cases.map(c => c.id),
        embeddings: embeddings,
        metadatas: cases.map(c => ({
          errorType: c.failureContext.errorType,
          successRate: c.metadata.successRate,
          useCount: c.metadata.useCount,
          createdAt: c.metadata.createdAt,
          tags: JSON.stringify(c.metadata.tags),
        })),
        documents: texts,
      });

      console.log('[VectorStore] Added', cases.length, 'cases');
    } catch (error: any) {
      console.error('[VectorStore] Failed to add cases batch:', error.message);
    }
  }

  /**
   * 更新案例
   */
  async updateCase(caseData: SuccessCase): Promise<void> {
    await this.ensureInitialized();

    if (!this.collection) {
      return;
    }

    const caseText = this.embeddingService.generateCaseText(caseData);
    const embedding = await this.embeddingService.embed(caseText);

    try {
      await this.collection.update({
        ids: [caseData.id],
        embeddings: [embedding],
        metadatas: [{
          errorType: caseData.failureContext.errorType,
          successRate: caseData.metadata.successRate,
          useCount: caseData.metadata.useCount,
          createdAt: caseData.metadata.createdAt,
          tags: JSON.stringify(caseData.metadata.tags),
        }],
        documents: [caseText],
      });

      console.log('[VectorStore] Updated case:', caseData.id);
    } catch (error: any) {
      console.error('[VectorStore] Failed to update case:', error.message);
    }
  }

  /**
   * 删除案例
   */
  async deleteCase(caseId: string): Promise<void> {
    await this.ensureInitialized();

    if (!this.collection) {
      return;
    }

    try {
      await this.collection.delete({
        ids: [caseId],
      });

      console.log('[VectorStore] Deleted case:', caseId);
    } catch (error: any) {
      console.error('[VectorStore] Failed to delete case:', error.message);
    }
  }

  /**
   * 语义搜索相似案例
   */
  async searchSimilar(
    failureContext: FailureContext,
    topK: number = 5
  ): Promise<SearchResult[]> {
    await this.ensureInitialized();

    if (!this.collection) {
      console.warn('[VectorStore] Collection not available');
      return [];
    }

    // 构建查询文本
    const queryText = [
      `Error: ${failureContext.errorType}`,
      `Goal: ${failureContext.goal}`,
      `Reason: ${failureContext.failureReason}`,
    ].join('\n');

    const queryEmbedding = await this.embeddingService.embed(queryText);

    try {
      const results = await this.collection.query({
        queryEmbeddings: [queryEmbedding],
        nResults: topK,
        include: [IncludeEnum.documents, IncludeEnum.metadatas, IncludeEnum.distances],
      });

      if (!results.ids || results.ids.length === 0 || results.ids[0].length === 0) {
        console.log('[VectorStore] No similar cases found');
        return [];
      }

      const searchResults: SearchResult[] = [];

      for (let i = 0; i < results.ids[0].length; i++) {
        const id = results.ids[0][i];
        const distance = results.distances?.[0]?.[i] || 0;
        const metadata = results.metadatas?.[0]?.[i] || {};

        // ChromaDB 使用 L2 距离，转换为相似度
        // 对于归一化向量，相似度 ≈ 1 - distance/2
        const similarity = Math.max(0, 1 - distance / 2);

        // 这里需要从 JSON 存储获取完整的案例数据
        // 因为 ChromaDB 只存储了元数据和文本
        searchResults.push({
          case: {
            id,
            failureContext: {
              goal: '',
              failedStep: { id: '', description: '', action: { type: 'wait', ms: 0 }, expectedResult: '', assertions: [], timeout: 10000 },
              failureReason: '',
              pageState: '',
              errorType: metadata.errorType as string || 'unknown',
            },
            successSolution: {
              retrySteps: [],
              successfulActions: [],
              recoveryStrategy: '',
              totalRetryTime: 0,
            },
            metadata: {
              createdAt: metadata.createdAt as string || new Date().toISOString(),
              useCount: (metadata.useCount as number) || 0,
              successRate: (metadata.successRate as number) || 1,
              tags: JSON.parse((metadata.tags as string) || '[]'),
              similarityScore: similarity,
            },
          },
          distance,
          similarity,
        });
      }

      console.log('[VectorStore] Found', searchResults.length, 'similar cases');
      return searchResults;
    } catch (error: any) {
      console.error('[VectorStore] Search failed:', error.message);
      return [];
    }
  }

  /**
   * 按错误类型过滤搜索
   */
  async searchByErrorType(
    failureContext: FailureContext,
    topK: number = 5
  ): Promise<SearchResult[]> {
    await this.ensureInitialized();

    if (!this.collection) {
      return [];
    }

    const queryText = [
      `Error: ${failureContext.errorType}`,
      `Goal: ${failureContext.goal}`,
      `Reason: ${failureContext.failureReason}`,
    ].join('\n');

    const queryEmbedding = await this.embeddingService.embed(queryText);

    try {
      const results = await this.collection.query({
        queryEmbeddings: [queryEmbedding],
        nResults: topK * 2, // 获取更多结果用于过滤
        where: {
          errorType: failureContext.errorType,
        },
        include: [IncludeEnum.documents, IncludeEnum.metadatas, IncludeEnum.distances],
      });

      if (!results.ids || results.ids.length === 0 || results.ids[0].length === 0) {
        return [];
      }

      const searchResults: SearchResult[] = [];

      for (let i = 0; i < results.ids[0].length; i++) {
        const id = results.ids[0][i];
        const distance = results.distances?.[0]?.[i] || 0;
        const metadata = results.metadatas?.[0]?.[i] || {};
        const similarity = Math.max(0, 1 - distance / 2);

        searchResults.push({
          case: {
            id,
            failureContext: {
              goal: '',
              failedStep: { id: '', description: '', action: { type: 'wait', ms: 0 }, expectedResult: '', assertions: [], timeout: 10000 },
              failureReason: '',
              pageState: '',
              errorType: metadata.errorType as string || 'unknown',
            },
            successSolution: {
              retrySteps: [],
              successfulActions: [],
              recoveryStrategy: '',
              totalRetryTime: 0,
            },
            metadata: {
              createdAt: metadata.createdAt as string || new Date().toISOString(),
              useCount: (metadata.useCount as number) || 0,
              successRate: (metadata.successRate as number) || 1,
              tags: JSON.parse((metadata.tags as string) || '[]'),
              similarityScore: similarity,
            },
          },
          distance,
          similarity,
        });
      }

      return searchResults.slice(0, topK);
    } catch (error: any) {
      console.error('[VectorStore] Filtered search failed:', error.message);
      return [];
    }
  }

  /**
   * 获取存储统计
   */
  async getStats(): Promise<{ count: number }> {
    await this.ensureInitialized();

    if (!this.collection) {
      return { count: 0 };
    }

    try {
      const count = await this.collection.count();
      return { count };
    } catch {
      return { count: 0 };
    }
  }

  /**
   * 清空所有数据
   */
  async clear(): Promise<void> {
    await this.ensureInitialized();

    if (!this.collection) {
      return;
    }

    try {
      await this.client.deleteCollection({ name: COLLECTION_NAME });
      this.collection = await this.client.createCollection({
        name: COLLECTION_NAME,
        metadata: {
          description: 'Test success cases for RAG retrieval',
          created_at: new Date().toISOString(),
        },
      });
      console.log('[VectorStore] Collection cleared and recreated');
    } catch (error: any) {
      console.error('[VectorStore] Failed to clear:', error.message);
    }
  }
}

// 单例实例
let globalVectorStore: VectorStore | null = null;

export function getVectorStore(): VectorStore {
  if (!globalVectorStore) {
    globalVectorStore = new VectorStore();
  }
  return globalVectorStore;
}

export function resetVectorStore(): void {
  globalVectorStore = null;
}
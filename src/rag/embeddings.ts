import OpenAI from 'openai';
import { config } from '../config';

export interface EmbeddingResult {
  embedding: number[];
  text: string;
  tokens: number;
}

export class EmbeddingService {
  private client: OpenAI;
  private model: string;
  private cache: Map<string, EmbeddingResult> = new Map();
  private cacheEnabled: boolean = true;
  private maxCacheSize: number = 500;

  constructor() {
    let baseURL = config.llm.baseUrl;
    let apiKey = config.llm.apiKey;
    const provider = config.llm.provider;

    if (provider === 'qwen') {
      baseURL = baseURL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
      apiKey = apiKey || process.env.DASHSCOPE_API_KEY || '';
    } else if (provider === 'openai') {
      baseURL = baseURL || 'https://api.openai.com/v1';
      apiKey = apiKey || process.env.OPENAI_API_KEY || '';
    } else {
      baseURL = baseURL || 'https://api.openai.com/v1';
      apiKey = apiKey || process.env.OPENAI_API_KEY || '';
    }

    this.client = new OpenAI({
      apiKey,
      baseURL,
    });

    // 使用适合嵌入的模型
    this.model = 'text-embedding-3-small';
    
    console.log('[EmbeddingService] Initialized with model:', this.model);
  }

  /**
   * 为单个文本生成嵌入向量
   */
  async embed(text: string): Promise<number[]> {
    const cached = this.cache.get(text);
    if (cached && this.cacheEnabled) {
      console.log('[EmbeddingService] Using cached embedding');
      return cached.embedding;
    }

    try {
      const response = await this.client.embeddings.create({
        model: this.model,
        input: text,
      });

      const embedding = response.data[0].embedding;
      const tokens = response.usage.total_tokens;

      if (this.cacheEnabled) {
        this.addToCache(text, { embedding, text, tokens });
      }

      console.log('[EmbeddingService] Generated embedding, tokens:', tokens);
      return embedding;
    } catch (error: any) {
      console.error('[EmbeddingService] Failed to generate embedding:', error.message);
      throw error;
    }
  }

  /**
   * 批量生成嵌入向量
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];
    const uncachedTexts: string[] = [];
    const uncachedIndices: number[] = [];

    // 先从缓存获取
    for (let i = 0; i < texts.length; i++) {
      const cached = this.cache.get(texts[i]);
      if (cached && this.cacheEnabled) {
        results[i] = cached.embedding;
      } else {
        uncachedTexts.push(texts[i]);
        uncachedIndices.push(i);
      }
    }

    if (uncachedTexts.length > 0) {
      console.log('[EmbeddingService] Batch embedding', uncachedTexts.length, 'texts');
      
      try {
        const response = await this.client.embeddings.create({
          model: this.model,
          input: uncachedTexts,
        });

        for (let i = 0; i < response.data.length; i++) {
          const dataIndex = response.data[i].index;
          const embedding = response.data[i].embedding;
          const originalIndex = uncachedIndices[dataIndex];
          
          results[originalIndex] = embedding;

          if (this.cacheEnabled) {
            this.addToCache(uncachedTexts[dataIndex], {
              embedding,
              text: uncachedTexts[dataIndex],
              tokens: response.usage.total_tokens,
            });
          }
        }
      } catch (error: any) {
        console.error('[EmbeddingService] Batch embedding failed:', error.message);
        throw error;
      }
    }

    console.log('[EmbeddingService] Batch embedding complete, total:', results.length);
    return results;
  }

  /**
   * 计算两个向量的余弦相似度
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * 为 SuccessCase 生成可搜索的文本表示
   */
  generateCaseText(caseData: {
    failureContext: {
      goal: string;
      failureReason: string;
      errorType: string;
    };
    successSolution: {
      recoveryStrategy: string;
    };
  }): string {
    const parts = [
      `Error: ${caseData.failureContext.errorType}`,
      `Goal: ${caseData.failureContext.goal}`,
      `Reason: ${caseData.failureContext.failureReason}`,
      `Solution: ${caseData.successSolution.recoveryStrategy}`,
    ];

    return parts.join('\n');
  }

  private addToCache(text: string, result: EmbeddingResult): void {
    if (this.cache.size >= this.maxCacheSize) {
      // 删除最旧的条目
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(text, result);
  }

  clearCache(): void {
    this.cache.clear();
    console.log('[EmbeddingService] Cache cleared');
  }

  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
    };
  }
}

// 单例实例
let globalEmbeddingService: EmbeddingService | null = null;

export function getEmbeddingService(): EmbeddingService {
  if (!globalEmbeddingService) {
    globalEmbeddingService = new EmbeddingService();
  }
  return globalEmbeddingService;
}

export function resetEmbeddingService(): void {
  if (globalEmbeddingService) {
    globalEmbeddingService.clearCache();
    globalEmbeddingService = null;
  }
}
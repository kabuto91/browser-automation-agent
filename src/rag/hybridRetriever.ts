import { LLMClient } from '../llm/llmClient';
import { SuccessCaseStorage, SuccessCase, FailureContext } from './successCaseStorage';
import { VectorStore, getVectorStore, SearchResult } from './vectorStore';
import { EmbeddingService, getEmbeddingService } from './embeddings';

const SEMANTIC_FILTER_SYSTEM_PROMPT = `You are a similarity evaluator for test failure cases.

Given a current failure and several historical cases, determine which cases are most similar and useful for solving the current failure.

Consider:
1. Similarity of error types and root causes
2. Similarity of page states and contexts
3. Applicability of historical solutions to current failure
4. Success rate and reliability of historical cases

Output format (JSON only):
{
  "similarCases": [
    {
      "caseId": "string",
      "similarityScore": 0.0-1.0,
      "reason": "string"
    }
  ],
  "recommendation": "string"
}

Only include cases with similarityScore >= 0.6.`;

export interface RetrievalConfig {
  useVectorSearch: boolean;
  useKeywordSearch: boolean;
  useLLMFilter: boolean;
  vectorWeight: number;
  keywordWeight: number;
  topK: number;
  minSimilarity: number;
}

const DEFAULT_CONFIG: RetrievalConfig = {
  useVectorSearch: true,
  useKeywordSearch: true,
  useLLMFilter: false, // 默认关闭 LLM 过滤，使用向量检索替代
  vectorWeight: 0.6,
  keywordWeight: 0.4,
  topK: 5,
  minSimilarity: 0.5,
};

export class HybridRetriever {
  private vectorStore: VectorStore;
  private embeddingService: EmbeddingService;
  private config: RetrievalConfig;

  constructor(
    private storage: SuccessCaseStorage,
    private llm: LLMClient,
    config?: Partial<RetrievalConfig>
  ) {
    this.vectorStore = getVectorStore();
    this.embeddingService = getEmbeddingService();
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    console.log('[HybridRetriever] Initialized with config:', this.config);
  }

  async retrieveSimilarCases(
    currentFailure: FailureContext
  ): Promise<SuccessCase[]> {
    console.log('[HybridRetriever] Retrieving similar cases for error type:', 
      currentFailure.errorType);

    // 并行执行向量检索和关键词检索
    const [vectorResults, keywordCandidates] = await Promise.all([
      this.config.useVectorSearch 
        ? this.vectorSearch(currentFailure) 
        : Promise.resolve([]),
      this.config.useKeywordSearch 
        ? this.keywordSearch(currentFailure) 
        : Promise.resolve([]),
    ]);

    console.log('[HybridRetriever] Vector search found', vectorResults.length, 'results');
    console.log('[HybridRetriever] Keyword search found', keywordCandidates.length, 'candidates');

    // 合并结果
    const mergedCases = this.mergeResults(vectorResults, keywordCandidates);

    if (mergedCases.length === 0) {
      console.log('[HybridRetriever] No cases found');
      return [];
    }

    // 如果启用 LLM 过滤，进行二次过滤
    let filteredCases = mergedCases;
    if (this.config.useLLMFilter && mergedCases.length > 0) {
      filteredCases = await this.llmSemanticFilter(currentFailure, mergedCases);
      console.log('[HybridRetriever] LLM filtered to', filteredCases.length, 'cases');
    }

    // 多因子排序
    const rankedCases = this.multiFactorRanking(filteredCases, currentFailure);

    const topCases = rankedCases.slice(0, this.config.topK);

    console.log('[HybridRetriever] Returning top', topCases.length, 'cases');

    // 从 JSON 存储获取完整案例数据
    const fullCases = await this.enrichCases(topCases);

    return fullCases;
  }

  /**
   * 向量语义检索
   */
  private async vectorSearch(failure: FailureContext): Promise<SearchResult[]> {
    try {
      // 尝试按错误类型过滤搜索
      const results = await this.vectorStore.searchByErrorType(
        failure,
        this.config.topK * 2
      );

      // 过滤低相似度结果
      const filtered = results.filter(r => r.similarity >= this.config.minSimilarity);

      console.log('[HybridRetriever] Vector search similarity scores:', 
        filtered.map(r => ({ id: r.case.id, similarity: r.similarity.toFixed(2) })));

      return filtered;
    } catch (error: any) {
      console.error('[HybridRetriever] Vector search failed:', error.message);
      return [];
    }
  }

  /**
   * 关键词检索
   */
  private async keywordSearch(failure: FailureContext): Promise<SuccessCase[]> {
    const keywords = this.extractKeywords(failure);
    
    console.log('[HybridRetriever] Extracted keywords:', keywords);

    const candidates = await this.storage.searchByKeywords(keywords);

    const typeFiltered = candidates.filter(successCase => 
      successCase.failureContext.errorType === failure.errorType
    );

    console.log('[HybridRetriever] Keyword search found', typeFiltered.length, 
      'candidates matching error type');

    return typeFiltered;
  }

  /**
   * 合并向量检索和关键词检索结果
   */
  private mergeResults(
    vectorResults: SearchResult[],
    keywordCases: SuccessCase[]
  ): SuccessCase[] {
    const mergedMap = new Map<string, SuccessCase>();

    // 添加向量检索结果
    for (const result of vectorResults) {
      mergedMap.set(result.case.id, {
        ...result.case,
        metadata: {
          ...result.case.metadata,
          similarityScore: result.similarity,
          source: 'vector',
        },
      });
    }

    // 添加关键词检索结果（如果不存在）
    for (const caseData of keywordCases) {
      if (!mergedMap.has(caseData.id)) {
        mergedMap.set(caseData.id, {
          ...caseData,
          metadata: {
            ...caseData.metadata,
            similarityScore: 0.5, // 关键词匹配默认相似度
            source: 'keyword',
          },
        });
      } else {
        // 如果已存在，更新相似度（加权平均）
        const existing = mergedMap.get(caseData.id)!;
        const vectorScore = existing.metadata.similarityScore || 0;
        const keywordScore = 0.5;
        const combinedScore = 
          vectorScore * this.config.vectorWeight + 
          keywordScore * this.config.keywordWeight;
        
        existing.metadata.similarityScore = combinedScore;
        existing.metadata.source = 'hybrid';
      }
    }

    return Array.from(mergedMap.values());
  }

  /**
   * 从 JSON 存储获取完整案例数据
   */
  private async enrichCases(cases: SuccessCase[]): Promise<SuccessCase[]> {
    const allCases = await this.storage.getAllCases();
    
    const enrichedCases = cases.map(partialCase => {
      const fullCase = allCases.find(c => c.id === partialCase.id);
      
      if (fullCase) {
        return {
          ...fullCase,
          metadata: {
            ...fullCase.metadata,
            similarityScore: partialCase.metadata.similarityScore,
            source: partialCase.metadata.source,
          },
        };
      }
      
      return partialCase;
    });

    return enrichedCases;
  }

  private extractKeywords(failure: FailureContext): string[] {
    const keywords: string[] = [];

    keywords.push(failure.errorType);

    const errorWords = failure.failureReason.toLowerCase().split(/\s+/);
    const significantWords = errorWords.filter(word => 
      word.length > 3 && 
      !['the', 'and', 'for', 'with', 'that', 'this', 'from', 'was', 'were', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in', 'on', 'at', 'by', 'an', 'as', 'but', 'or', 'nor', 'so', 'yet', 'both', 'either', 'neither', 'not', 'only', 'own', 'same', 'than', 'too', 'very', 'just', 'also'].includes(word)
    );
    
    keywords.push(...significantWords.slice(0, 5));

    if (failure.failedStep.action.type) {
      keywords.push(failure.failedStep.action.type);
    }

    const action = failure.failedStep.action;
    if ('selector' in action && action.selector) {
      const selectorParts = action.selector.split(/[#\.\[\]=]/);
      keywords.push(...selectorParts.filter(part => part.length > 2).slice(0, 3));
    }

    const uniqueKeywords = [...new Set(keywords)];
    
    return uniqueKeywords.slice(0, 10);
  }

  /**
   * LLM 语义过滤（可选）
   */
  private async llmSemanticFilter(
    failure: FailureContext,
    candidates: SuccessCase[]
  ): Promise<SuccessCase[]> {
    if (candidates.length === 0) {
      return [];
    }

    const prompt = this.buildSimilarityPrompt(failure, candidates);

    try {
      const response = await this.llm.chat(
        SEMANTIC_FILTER_SYSTEM_PROMPT,
        prompt
      );

      const parsed = this.parseSimilarityResponse(response, candidates);

      const filtered = parsed.filter(successCase => 
        successCase.metadata.similarityScore && successCase.metadata.similarityScore >= 0.6
      );

      console.log('[HybridRetriever] LLM semantic filter result:', 
        filtered.length, 'cases with similarity >= 0.6');

      return filtered;
    } catch (error) {
      console.error('[HybridRetriever] LLM semantic filter failed:', error);
      
      return candidates.slice(0, 5);
    }
  }

  private buildSimilarityPrompt(
    failure: FailureContext,
    candidates: SuccessCase[]
  ): string {
    const candidatesDescription = candidates.map((successCase, index) => `
Case ${index + 1} (ID: ${successCase.id}):
- Error Type: ${successCase.failureContext.errorType}
- Failure Reason: ${successCase.failureContext.failureReason}
- Failed Step: ${successCase.failureContext.failedStep.description}
- Solution: ${successCase.successSolution.recoveryStrategy}
- Success Rate: ${successCase.metadata.successRate * 100}%
- Used: ${successCase.metadata.useCount} times
`).join('\n');

    return `
Current Failure:
- Goal: ${failure.goal}
- Error Type: ${failure.errorType}
- Failure Reason: ${failure.failureReason}
- Failed Step: ${failure.failedStep.description}
- Page State: ${failure.pageState.slice(0, 200)}

Historical Cases:
${candidatesDescription}

Please evaluate the similarity of each historical case to the current failure and provide similarity scores.
`;
  }

  private parseSimilarityResponse(
    response: string,
    candidates: SuccessCase[]
  ): SuccessCase[] {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('[HybridRetriever] No JSON found in response');
        return candidates;
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      if (!parsed.similarCases || !Array.isArray(parsed.similarCases)) {
        console.error('[HybridRetriever] Invalid response format');
        return candidates;
      }

      const result = candidates.map(successCase => {
        const similarityInfo = parsed.similarCases.find(
          (sc: any) => sc.caseId === successCase.id
        );

        if (similarityInfo) {
          return {
            ...successCase,
            metadata: {
              ...successCase.metadata,
              similarityScore: similarityInfo.similarityScore
            },
          };
        }

        return successCase;
      });

      console.log('[HybridRetriever] Parsed similarity scores:', 
        result.map(c => ({ id: c.id, score: c.metadata.similarityScore })));

      return result;
    } catch (error) {
      console.error('[HybridRetriever] Failed to parse similarity response:', error);
      return candidates;
    }
  }

  private multiFactorRanking(
    cases: SuccessCase[],
    currentFailure: FailureContext
  ): SuccessCase[] {
    const scoredCases = cases.map(successCase => ({
      ...successCase,
      score: this.calculateScore(successCase, currentFailure)
    }));

    const ranked = scoredCases.sort((a, b) => b.score - a.score);

    console.log('[HybridRetriever] Multi-factor ranking scores:', 
      ranked.map(c => ({ id: c.id, score: c.score.toFixed(2) })));

    return ranked;
  }

  private calculateScore(
    successCase: SuccessCase,
    currentFailure: FailureContext
  ): number {
    const similarityScore = successCase.metadata.similarityScore || 0.5;
    const successRateScore = successCase.metadata.successRate;
    const useCountScore = Math.min(successCase.metadata.useCount / 10, 1);
    const recencyScore = this.calculateRecencyScore(successCase.metadata.createdAt);

    const totalScore = (
      similarityScore * 0.4 +
      successRateScore * 0.3 +
      useCountScore * 0.2 +
      recencyScore * 0.1
    );

    return totalScore;
  }

  private calculateRecencyScore(createdAt: string | Date): number {
    const now = Date.now();
    const created = typeof createdAt === 'string' 
      ? new Date(createdAt).getTime() 
      : createdAt.getTime();
    const daysSinceCreation = (now - created) / (1000 * 60 * 60 * 24);

    if (daysSinceCreation < 7) {
      return 1.0;
    } else if (daysSinceCreation < 30) {
      return 0.8;
    } else if (daysSinceCreation < 90) {
      return 0.6;
    } else {
      return 0.4;
    }
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig: Partial<RetrievalConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('[HybridRetriever] Config updated:', this.config);
  }

  /**
   * 获取当前配置
   */
  getConfig(): RetrievalConfig {
    return { ...this.config };
  }
}
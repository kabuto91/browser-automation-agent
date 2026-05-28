import { LLMClient } from '../llm/llmClient';
import { SuccessCaseStorage, SuccessCase, FailureContext } from './successCaseStorage';

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

export class HybridRetriever {
  constructor(
    private storage: SuccessCaseStorage,
    private llm: LLMClient
  ) {}

  async retrieveSimilarCases(
    currentFailure: FailureContext
  ): Promise<SuccessCase[]> {
    console.log('[HybridRetriever] Retrieving similar cases for error type:', 
      currentFailure.errorType);

    const keywordCandidates = await this.keywordSearch(currentFailure);

    if (keywordCandidates.length === 0) {
      console.log('[HybridRetriever] No keyword candidates found');
      return [];
    }

    console.log('[HybridRetriever] Found', keywordCandidates.length, 
      'keyword candidates');

    const semanticFiltered = await this.llmSemanticFilter(
      currentFailure,
      keywordCandidates
    );

    console.log('[HybridRetriever] Semantic filtered to', 
      semanticFiltered.length, 'cases');

    const rankedCases = this.multiFactorRanking(
      semanticFiltered,
      currentFailure
    );

    const topCases = rankedCases.slice(0, 5);

    console.log('[HybridRetriever] Returning top', topCases.length, 'cases');

    return topCases;
  }

  private async keywordSearch(
    failure: FailureContext
  ): Promise<SuccessCase[]> {
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
            }
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
}
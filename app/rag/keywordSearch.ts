// 关键词匹配检索 - 降级方案

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

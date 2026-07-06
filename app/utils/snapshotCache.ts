/**
 * 快照缓存管理器
 * 避免重复分析相似的页面状态，减少 token 消耗
 */

import { createHash } from 'crypto';

interface CacheEntry {
  hash: string;
  summary: string;
  timestamp: number;
  keyFeatures: string[];
}

class SnapshotCache {
  private cache: Map<string, CacheEntry> = new Map();
  private readonly MAX_CACHE_SIZE = 20;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 分钟过期

  /**
   * 生成快照指纹
   */
  generateHash(snapshot: string): string {
    return createHash('md5').update(snapshot).digest('hex');
  }

  /**
   * 提取快照的关键特征用于相似度比较
   */
  extractKeyFeatures(snapshot: string): string[] {
    const features: string[] = [];
    const lines = snapshot.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // 提取 ref 属性
      const refMatch = trimmed.match(/ref=(\d+)/);
      if (refMatch) {
        features.push(`ref:${refMatch[1]}`);
      }

      // 提取元素类型
      const tagMatch = trimmed.match(/<(\w+)/);
      if (tagMatch) {
        features.push(`tag:${tagMatch[1]}`);
      }

      // 提取关键属性
      const typeMatch = trimmed.match(/type="([^"]+)"/);
      if (typeMatch) {
        features.push(`type:${typeMatch[1]}`);
      }

      const nameMatch = trimmed.match(/name="([^"]+)"/);
      if (nameMatch) {
        features.push(`name:${nameMatch[1]}`);
      }
    }

    // 去重并限制数量
    return Array.from(new Set(features)).slice(0, 100);
  }

  /**
   * 计算两个特征集合的相似度
   */
  calculateSimilarity(features1: string[], features2: string[]): number {
    if (features1.length === 0 || features2.length === 0) {
      return 0;
    }

    const set1 = new Set(features1);
    const set2 = new Set(features2);

    let commonCount = 0;
    for (const feature of set1) {
      if (set2.has(feature)) {
        commonCount++;
      }
    }

    const totalUnique = set1.size + set2.size - commonCount;
    return totalUnique > 0 ? commonCount / totalUnique : 0;
  }

  /**
   * 判断当前快照是否与缓存中的快照相似
   */
  isSimilar(currentSnapshot: string): { similar: boolean; cachedSummary?: string } {
    this.cleanup(); // 清理过期缓存

    const currentHash = this.generateHash(currentSnapshot);
    
    // 检查完全匹配
    if (this.cache.has(currentHash)) {
      const entry = this.cache.get(currentHash)!;
      return { similar: true, cachedSummary: entry.summary };
    }

    // 检查相似度
    const currentFeatures = this.extractKeyFeatures(currentSnapshot);
    
    for (const [, entry] of this.cache) {
      const similarity = this.calculateSimilarity(currentFeatures, entry.keyFeatures);
      
      // 相似度阈值 80%
      if (similarity >= 0.8) {
        return { similar: true, cachedSummary: entry.summary };
      }
    }

    return { similar: false };
  }

  /**
   * 更新缓存
   */
  updateCache(snapshot: string, summary: string): void {
    const hash = this.generateHash(snapshot);
    const keyFeatures = this.extractKeyFeatures(snapshot);

    // 如果缓存已满，删除最旧的条目
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      let oldestKey = '';
      let oldestTime = Infinity;

      for (const [key, entry] of this.cache) {
        if (entry.timestamp < oldestTime) {
          oldestTime = entry.timestamp;
          oldestKey = key;
        }
      }

      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(hash, {
      hash,
      summary,
      timestamp: Date.now(),
      keyFeatures,
    });
  }

  /**
   * 清理过期缓存
   */
  cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > this.CACHE_TTL) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.cache.delete(key);
    }
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.MAX_CACHE_SIZE,
    };
  }
}

// 导出单例实例
export const snapshotCache = new SnapshotCache();

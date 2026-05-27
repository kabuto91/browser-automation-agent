import { globalBrowserManager } from '../browser/globalBrowserManager';
import { getLLMClient } from '../llm/llmClient';

export interface SystemResourceStatus {
  browser: {
    activeInstances: number;
    maxInstances: number;
    activeSession: string | null;
  };
  llm: {
    cacheSize: number;
    maxCacheSize: number;
    queueLength: number;
    activeRequests: number;
  };
  memory: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };
  timestamp: number;
}

export class SystemResourceMonitor {
  private static instance: SystemResourceMonitor | null = null;

  static getInstance(): SystemResourceMonitor {
    if (!SystemResourceMonitor.instance) {
      SystemResourceMonitor.instance = new SystemResourceMonitor();
    }
    return SystemResourceMonitor.instance;
  }

  getStatus(): SystemResourceStatus {
    const browserManager = globalBrowserManager;
    const llmClient = getLLMClient();

    const browserStatus = browserManager.getPoolStats();
    const llmCacheStatus = llmClient.getCacheStats();
    const llmQueueStatus = llmClient.getQueueStats();

    const memoryUsage = process.memoryUsage();

    return {
      browser: {
        activeInstances: browserStatus.totalInstances,
        maxInstances: browserStatus.maxInstances,
        activeSession: browserStatus.activeSession,
      },
      llm: {
        cacheSize: llmCacheStatus.size,
        maxCacheSize: llmCacheStatus.maxSize,
        queueLength: llmQueueStatus.queueLength,
        activeRequests: llmQueueStatus.activeRequests,
      },
      memory: {
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        external: memoryUsage.external,
        rss: memoryUsage.rss,
      },
      timestamp: Date.now(),
    };
  }

  logStatus(): void {
    const status = this.getStatus();
    
    console.log('[SystemResourceMonitor] Resource Status:');
    console.log(`  Browser: ${status.browser.activeInstances}/${status.browser.maxInstances} active, session: ${status.browser.activeSession || 'none'}`);
    console.log(`  LLM Cache: ${status.llm.cacheSize}/${status.llm.maxCacheSize} entries, queue: ${status.llm.queueLength}, active: ${status.llm.activeRequests}`);
    console.log(`  Memory: Heap ${Math.round(status.memory.heapUsed / 1024 / 1024)}MB / ${Math.round(status.memory.heapTotal / 1024 / 1024)}MB`);
  }

  checkHealth(): { healthy: boolean; warnings: string[] } {
    const status = this.getStatus();
    const warnings: string[] = [];

    if (status.browser.activeInstances >= status.browser.maxInstances * 0.9) {
      warnings.push('Browser pool near capacity');
    }

    if (status.llm.cacheSize >= status.llm.maxCacheSize * 0.9) {
      warnings.push('LLM cache near capacity');
    }

    if (status.llm.queueLength > 10) {
      warnings.push('LLM request queue backlog');
    }

    const heapUsagePercent = status.memory.heapUsed / status.memory.heapTotal;
    if (heapUsagePercent > 0.9) {
      warnings.push('High memory usage detected');
    }

    return {
      healthy: warnings.length === 0,
      warnings,
    };
  }

  cleanup(): void {
    const llmClient = getLLMClient();

    llmClient.clearCache();

    console.log('[SystemResourceMonitor] Cleanup completed');
  }
}

export function getSystemResourceMonitor(): SystemResourceMonitor {
  return SystemResourceMonitor.getInstance();
}
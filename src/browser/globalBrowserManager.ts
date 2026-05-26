import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { config } from '../config';

interface BrowserInstance {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  sessionId: string;
  isConnected: boolean;
  lastUsed: number;
  createdAt: number;
}

interface PoolConfig {
  maxInstances: number;
  maxIdleTime: number;
  healthCheckInterval: number;
}

class GlobalBrowserManager {
  private instances: Map<string, BrowserInstance> = new Map();
  private currentSessionId: string | null = null;
  private poolConfig: PoolConfig = {
    maxInstances: 3,
    maxIdleTime: 1800000,
    healthCheckInterval: 60000,
  };
  private healthCheckTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.startHealthCheck();
  }

  private startHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(() => {
      this.cleanIdleInstances();
    }, this.poolConfig.healthCheckInterval);

    console.log('[GlobalBrowserManager] Health check started');
  }

  private cleanIdleInstances(): void {
    const now = Date.now();
    const instancesToRemove: string[] = [];

    for (const [sessionId, instance] of this.instances.entries()) {
      if (now - instance.lastUsed > this.poolConfig.maxIdleTime) {
        instancesToRemove.push(sessionId);
      }
    }

    for (const sessionId of instancesToRemove) {
      this.closeInstance(sessionId);
    }

    if (instancesToRemove.length > 0) {
      console.log(`[GlobalBrowserManager] Cleaned ${instancesToRemove.length} idle instances`);
    }
  }

  private async closeInstance(sessionId: string): Promise<void> {
    const instance = this.instances.get(sessionId);
    if (!instance) return;

    try {
      if (!instance.isConnected) {
        await instance.browser.close();
      }
      this.instances.delete(sessionId);

      if (this.currentSessionId === sessionId) {
        this.currentSessionId = null;
      }

      console.log(`[GlobalBrowserManager] Closed instance: ${sessionId}`);
    } catch (error: any) {
      console.error(`[GlobalBrowserManager] Error closing instance ${sessionId}:`, error.message);
      this.instances.delete(sessionId);
    }
  }

  async launch(headless: boolean = false): Promise<{ page: Page; sessionId: string }> {
    if (this.currentSessionId) {
      const instance = this.instances.get(this.currentSessionId);
      if (instance && instance.page) {
        console.log('[GlobalBrowserManager] Reusing existing browser');
        instance.lastUsed = Date.now();
        return { page: instance.page, sessionId: instance.sessionId };
      }
    }

    const availableInstance = this.findAvailableInstance();
    if (availableInstance) {
      console.log('[GlobalBrowserManager] Using available instance from pool');
      availableInstance.lastUsed = Date.now();
      this.currentSessionId = availableInstance.sessionId;
      return { page: availableInstance.page, sessionId: availableInstance.sessionId };
    }

    if (this.instances.size >= this.poolConfig.maxInstances) {
      console.log('[GlobalBrowserManager] Pool full, closing oldest instance');
      const oldestSessionId = this.getOldestSessionId();
      if (oldestSessionId) {
        await this.closeInstance(oldestSessionId);
      }
    }

    console.log('[GlobalBrowserManager] Launching new browser');
    
    const browser = await chromium.launch({
      headless,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
      ],
    });

    const context = await browser.newContext({
      viewport: config.browser.viewport,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
    });

    await context.setDefaultTimeout(config.browser.timeout);
    const page = await context.newPage();
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const instance: BrowserInstance = {
      browser,
      context,
      page,
      sessionId,
      isConnected: false,
      lastUsed: Date.now(),
      createdAt: Date.now(),
    };

    this.instances.set(sessionId, instance);
    this.currentSessionId = sessionId;

    console.log(`[GlobalBrowserManager] Browser launched with session: ${sessionId}`);
    
    return { page, sessionId };
  }

  private findAvailableInstance(): BrowserInstance | null {
    for (const instance of this.instances.values()) {
      if (instance.page && !instance.isConnected) {
        return instance;
      }
    }
    return null;
  }

  private getOldestSessionId(): string | null {
    let oldestTime = Date.now();
    let oldestSessionId: string | null = null;

    for (const [sessionId, instance] of this.instances.entries()) {
      if (instance.createdAt < oldestTime) {
        oldestTime = instance.createdAt;
        oldestSessionId = sessionId;
      }
    }

    return oldestSessionId;
  }

  async connectToExistingBrowser(cdpEndpoint: string): Promise<{ page: Page; sessionId: string }> {
    try {
      console.log(`[GlobalBrowserManager] Connecting to existing browser at ${cdpEndpoint}`);
      
      const browser = await chromium.connectOverCDP(cdpEndpoint);
      
      console.log(`[GlobalBrowserManager] Successfully connected to browser`);
      
      let context: BrowserContext;
      let page: Page;
      
      const contexts = browser.contexts();
      if (contexts.length > 0) {
        context = contexts[0];
        const pages = context.pages();
        if (pages.length > 0) {
          page = pages[0];
          console.log(`[GlobalBrowserManager] Using existing page`);
        } else {
          page = await context.newPage();
          console.log(`[GlobalBrowserManager] Created new page`);
        }
      } else {
        context = await browser.newContext({
          viewport: config.browser.viewport,
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          locale: 'zh-CN',
          timezoneId: 'Asia/Shanghai',
        });
        await context.setDefaultTimeout(config.browser.timeout);
        page = await context.newPage();
        console.log(`[GlobalBrowserManager] Created new context and page`);
      }

      const sessionId = `cdp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const instance: BrowserInstance = {
        browser,
        context,
        page,
        sessionId,
        isConnected: true,
        lastUsed: Date.now(),
        createdAt: Date.now(),
      };

      this.instances.set(sessionId, instance);
      this.currentSessionId = sessionId;

      return { page, sessionId };
    } catch (error: any) {
      console.error(`[GlobalBrowserManager] Failed to connect to browser:`, error.message);
      throw new Error(`Failed to connect to browser at ${cdpEndpoint}: ${error.message}`);
    }
  }

  getPage(sessionId?: string): Page | null {
    if (sessionId) {
      const instance = this.instances.get(sessionId);
      if (!instance) {
        console.log(`[GlobalBrowserManager] Session not found: ${sessionId}`);
        return null;
      }
      return instance.page;
    }

    if (this.currentSessionId) {
      const instance = this.instances.get(this.currentSessionId);
      return instance?.page || null;
    }

    return null;
  }

  getSessionId(): string | null {
    return this.currentSessionId;
  }

  keepAlive(sessionId?: string) {
    const targetSessionId = sessionId || this.currentSessionId;
    if (!targetSessionId) {
      console.log(`[GlobalBrowserManager] No active session to keep alive`);
      return;
    }

    const instance = this.instances.get(targetSessionId);
    if (instance) {
      instance.lastUsed = Date.now();
      console.log(`[GlobalBrowserManager] Browser keep-alive updated: ${targetSessionId}`);
    }
  }

  async close(sessionId?: string) {
    const targetSessionId = sessionId || this.currentSessionId;
    
    if (!targetSessionId) {
      console.log(`[GlobalBrowserManager] Closing all instances`);
      for (const [sid] of this.instances.entries()) {
        await this.closeInstance(sid);
      }
      return;
    }

    await this.closeInstance(targetSessionId);
  }

  isActive(sessionId?: string): boolean {
    const targetSessionId = sessionId || this.currentSessionId;
    if (!targetSessionId) return false;

    const instance = this.instances.get(targetSessionId);
    return instance !== undefined && instance.browser !== null && instance.page !== null;
  }

  getLastUsed(sessionId?: string): number {
    const targetSessionId = sessionId || this.currentSessionId;
    if (!targetSessionId) return 0;

    const instance = this.instances.get(targetSessionId);
    return instance?.lastUsed || 0;
  }

  getPoolStats(): { totalInstances: number; maxInstances: number; activeSession: string | null } {
    return {
      totalInstances: this.instances.size,
      maxInstances: this.poolConfig.maxInstances,
      activeSession: this.currentSessionId,
    };
  }

  destroy(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    console.log('[GlobalBrowserManager] Health check stopped');
  }
}

export const globalBrowserManager = new GlobalBrowserManager();

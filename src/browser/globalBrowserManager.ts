import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { config } from '../config';

class GlobalBrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private isConnected: boolean = false;
  private lastUsed: number = Date.now();
  private sessionId: string | null = null;

  async launch(headless: boolean = false): Promise<{ page: Page; sessionId: string }> {
    if (this.browser && this.page) {
      console.log('[GlobalBrowserManager] Reusing existing browser');
      this.lastUsed = Date.now();
      return { page: this.page, sessionId: this.sessionId! };
    }

    console.log('[GlobalBrowserManager] Launching new browser');
    
    this.browser = await chromium.launch({
      headless,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
      ],
    });

    this.context = await this.browser.newContext({
      viewport: config.browser.viewport,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
    });

    await this.context.setDefaultTimeout(config.browser.timeout);
    this.page = await this.context.newPage();
    this.sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.isConnected = false;
    this.lastUsed = Date.now();

    console.log(`[GlobalBrowserManager] Browser launched with session: ${this.sessionId}`);
    
    return { page: this.page, sessionId: this.sessionId };
  }

  async connectToExistingBrowser(cdpEndpoint: string): Promise<{ page: Page; sessionId: string }> {
    try {
      console.log(`[GlobalBrowserManager] Connecting to existing browser at ${cdpEndpoint}`);
      
      this.browser = await chromium.connectOverCDP(cdpEndpoint);
      this.isConnected = true;
      
      console.log(`[GlobalBrowserManager] Successfully connected to browser`);
      
      const contexts = this.browser.contexts();
      if (contexts.length > 0) {
        this.context = contexts[0];
        const pages = this.context.pages();
        if (pages.length > 0) {
          this.page = pages[0];
          console.log(`[GlobalBrowserManager] Using existing page`);
        } else {
          this.page = await this.context.newPage();
          console.log(`[GlobalBrowserManager] Created new page`);
        }
      } else {
        this.context = await this.browser.newContext({
          viewport: config.browser.viewport,
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          locale: 'zh-CN',
          timezoneId: 'Asia/Shanghai',
        });
        await this.context.setDefaultTimeout(config.browser.timeout);
        this.page = await this.context.newPage();
        console.log(`[GlobalBrowserManager] Created new context and page`);
      }

      this.sessionId = `cdp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      this.lastUsed = Date.now();

      return { page: this.page, sessionId: this.sessionId };
    } catch (error: any) {
      console.error(`[GlobalBrowserManager] Failed to connect to browser:`, error.message);
      throw new Error(`Failed to connect to browser at ${cdpEndpoint}: ${error.message}`);
    }
  }

  getPage(sessionId?: string): Page | null {
    if (sessionId && this.sessionId !== sessionId) {
      console.log(`[GlobalBrowserManager] Session mismatch: ${sessionId} vs ${this.sessionId}`);
      return null;
    }
    return this.page;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  keepAlive() {
    this.lastUsed = Date.now();
    console.log(`[GlobalBrowserManager] Browser keep-alive updated: ${this.sessionId}`);
  }

  async close() {
    if (this.browser) {
      console.log(`[GlobalBrowserManager] Closing browser: ${this.sessionId}`);
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
      this.sessionId = null;
      this.isConnected = false;
    }
  }

  isActive(): boolean {
    return this.browser !== null && this.page !== null;
  }

  getLastUsed(): number {
    return this.lastUsed;
  }
}

export const globalBrowserManager = new GlobalBrowserManager();

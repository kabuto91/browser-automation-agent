import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { config } from '../config';

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private isConnected: boolean = false;

  async launch(headless?: boolean): Promise<Page> {
    const isHeadless = headless ?? config.browser.headless;
    
    const launchArgs = [
      '--disable-blink-features=AutomationControlled',
    ];

    if (config.security.networkIsolation) {
      launchArgs.push('--disable-network');
    }

    if (config.security.proxyServer) {
      launchArgs.push(`--proxy-server=${config.security.proxyServer}`);
      
      if (config.security.proxyBypassList && config.security.proxyBypassList.length > 0) {
        launchArgs.push(`--proxy-bypass-list=${config.security.proxyBypassList.join(',')}`);
      }
    }

    this.browser = await chromium.launch({
      headless: isHeadless,
      args: launchArgs,
    });

    this.context = await this.browser.newContext({
      viewport: config.browser.viewport,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
    });

    await this.context.setDefaultTimeout(config.browser.timeout);

    this.page = await this.context.newPage();
    this.isConnected = false;
    
    return this.page;
  }

  async connectToExistingBrowser(cdpEndpoint: string): Promise<Page> {
    try {
      console.log(`[BrowserManager] Connecting to existing browser at ${cdpEndpoint}`);
      
      this.browser = await chromium.connectOverCDP(cdpEndpoint);
      this.isConnected = true;
      
      console.log(`[BrowserManager] Successfully connected to browser`);
      
      const contexts = this.browser.contexts();
      if (contexts.length > 0) {
        this.context = contexts[0];
        const pages = this.context.pages();
        if (pages.length > 0) {
          this.page = pages[0];
          console.log(`[BrowserManager] Using existing page`);
        } else {
          this.page = await this.context.newPage();
          console.log(`[BrowserManager] Created new page`);
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
        console.log(`[BrowserManager] Created new context and page`);
      }

      return this.page;
    } catch (error: any) {
      console.error(`[BrowserManager] Failed to connect to browser:`, error.message);
      throw new Error(`Failed to connect to browser at ${cdpEndpoint}: ${error.message}`);
    }
  }

  getPage(): Page {
    if (!this.page) {
      throw new Error('Browser not launched. Call launch() or connectToExistingBrowser() first.');
    }
    return this.page;
  }

  getContext(): BrowserContext {
    if (!this.context) {
      throw new Error('Browser not launched. Call launch() or connectToExistingBrowser() first.');
    }
    return this.context;
  }

  async newPage(): Promise<Page> {
    if (!this.context) {
      throw new Error('Browser not launched. Call launch() or connectToExistingBrowser() first.');
    }
    return await this.context.newPage();
  }

  async close(): Promise<void> {
    if (this.page && !this.isConnected) {
      await this.page.close().catch(() => {});
    }
    this.page = null;
    
    if (this.context && !this.isConnected) {
      await this.context.close().catch(() => {});
    }
    this.context = null;
    
    if (this.browser) {
      if (this.isConnected) {
        await this.browser.close().catch(() => {});
      } else {
        await this.browser.close().catch(() => {});
      }
      this.browser = null;
    }
    
    this.isConnected = false;
  }

  async clearCookies(): Promise<void> {
    if (this.context) {
      await this.context.clearCookies();
    }
  }

  async setViewport(width: number, height: number): Promise<void> {
    if (this.page) {
      await this.page.setViewportSize({ width, height });
    }
  }

  isConnectedToExistingBrowser(): boolean {
    return this.isConnected;
  }
}

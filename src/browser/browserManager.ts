import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { config } from '../config';

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  async launch(headless?: boolean): Promise<Page> {
    const isHeadless = headless ?? config.browser.headless;
    
    this.browser = await chromium.launch({
      headless: isHeadless,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox',
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
    
    return this.page;
  }

  getPage(): Page {
    if (!this.page) {
      throw new Error('Browser not launched. Call launch() first.');
    }
    return this.page;
  }

  getContext(): BrowserContext {
    if (!this.context) {
      throw new Error('Browser not launched. Call launch() first.');
    }
    return this.context;
  }

  async newPage(): Promise<Page> {
    if (!this.context) {
      throw new Error('Browser not launched. Call launch() first.');
    }
    return await this.context.newPage();
  }

  async close(): Promise<void> {
    if (this.page) {
      await this.page.close().catch(() => {});
      this.page = null;
    }
    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
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
}

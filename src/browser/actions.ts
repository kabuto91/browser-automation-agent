import { Page, Locator } from 'playwright';
import { BrowserAction } from '../types';
import { config } from '../config';

export class BrowserActions {
  constructor(private page: Page) {}

  async perform(action: BrowserAction): Promise<void> {
    switch (action.type) {
      case 'navigate':
        await this.navigate(action.url);
        break;
      case 'click':
        await this.click(action.selector);
        break;
      case 'type':
        await this.type(action.selector, action.text);
        break;
      case 'select':
        await this.select(action.selector, action.value);
        break;
      case 'hover':
        await this.hover(action.selector);
        break;
      case 'scroll':
        await this.scroll(action.selector, action.x, action.y);
        break;
      case 'wait':
        await this.wait(action.selector, action.ms);
        break;
      case 'screenshot':
        await this.screenshot(action.name);
        break;
      case 'press':
        await this.press(action.key, action.selector);
        break;
      case 'evaluate':
        await this.evaluate(action.script);
        break;
      default:
        throw new Error(`Unknown action type: ${(action as any).type}`);
    }
  }

  private async navigate(url: string): Promise<void> {
    await this.page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: config.browser.timeout,
    });
  }

  private async click(selector: string): Promise<void> {
    const locator = this.page.locator(selector);
    await locator.waitFor({ state: 'visible', timeout: config.browser.timeout });
    
    await locator.click();
    
    await this.page.waitForTimeout(500);
    
    try {
      await this.page.waitForLoadState('domcontentloaded', { timeout: 3000 });
    } catch {
      // Ignore timeout
    }
  }

  private async type(selector: string, text: string): Promise<void> {
    const locator = this.page.locator(selector);
    await locator.waitFor({ state: 'visible', timeout: config.browser.timeout });
    await locator.fill(text);
  }

  private async select(selector: string, value: string): Promise<void> {
    const locator = this.page.locator(selector);
    await locator.waitFor({ state: 'visible', timeout: config.browser.timeout });
    await locator.selectOption(value);
  }

  private async hover(selector: string): Promise<void> {
    const locator = this.page.locator(selector);
    await locator.waitFor({ state: 'visible', timeout: config.browser.timeout });
    await locator.hover();
  }

  private async scroll(selector?: string, x?: number, y?: number): Promise<void> {
    if (selector) {
      const locator = this.page.locator(selector);
      await locator.scrollIntoViewIfNeeded();
    } else if (x !== undefined || y !== undefined) {
      await this.page.evaluate(
        ({ scrollX, scrollY }) => {
          window.scrollBy(scrollX || 0, scrollY || 0);
        },
        { scrollX: x, scrollY: y }
      );
    }
  }

  private async wait(selector?: string, ms?: number): Promise<void> {
    if (ms) {
      await this.page.waitForTimeout(ms);
    } else if (selector) {
      await this.page.waitForSelector(selector, {
        state: 'visible',
        timeout: config.browser.timeout,
      });
    }
  }

  private async screenshot(name: string): Promise<void> {
    const fs = require('fs');
    const path = require('path');
    
    const dir = config.screenshot.dir;
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    const filePath = path.join(dir, `${name}-${Date.now()}.png`);
    await this.page.screenshot({ path: filePath, fullPage: false });
  }

  private async press(key: string, selector?: string): Promise<void> {
    if (selector) {
      const locator = this.page.locator(selector);
      await locator.waitFor({ state: 'visible', timeout: config.browser.timeout });
      await locator.press(key);
    } else {
      await this.page.keyboard.press(key);
    }
  }

  private async evaluate(script: string): Promise<void> {
    await this.page.evaluate(script);
  }

  async isVisible(selector: string): Promise<boolean> {
    try {
      const locator = this.page.locator(selector);
      return await locator.isVisible();
    } catch {
      return false;
    }
  }

  async isHidden(selector: string): Promise<boolean> {
    try {
      const locator = this.page.locator(selector);
      return await locator.isHidden();
    } catch {
      return true;
    }
  }

  async getText(selector: string): Promise<string> {
    const locator = this.page.locator(selector);
    return (await locator.textContent()) || '';
  }

  async getValue(selector: string): Promise<string> {
    const locator = this.page.locator(selector);
    return await locator.inputValue();
  }

  async getCount(selector: string): Promise<number> {
    const locator = this.page.locator(selector);
    return await locator.count();
  }

  async getUrl(): Promise<string> {
    return this.page.url();
  }

  async getTitle(): Promise<string> {
    return await this.page.title();
  }
}

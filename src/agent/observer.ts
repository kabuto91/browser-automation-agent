import { Page } from 'playwright';
import { PageState, InteractiveElement } from '../types';
import { config, ensureDirectoriesOnce } from '../config';
import * as fs from 'fs';
import * as path from 'path';

export interface DetailedElement {
  tag: string;
  text: string;
  id: string;
  className: string;
  visible: boolean;
  type?: string;
  name?: string;
  placeholder?: string;
  href?: string;
  dataTestId?: string;
  ariaLabel?: string;
  title?: string;
  value?: string;
  selector: string;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface PageSnapshot {
  url: string;
  title: string;
  elements: DetailedElement[];
  forms: FormInfo[];
  links: LinkInfo[];
  buttons: ButtonInfo[];
  inputs: InputInfo[];
  rawHtml?: string;
}

export interface FormInfo {
  selector: string;
  action?: string;
  method?: string;
  inputs: string[];
}

export interface LinkInfo {
  selector: string;
  text: string;
  href: string;
}

export interface ButtonInfo {
  selector: string;
  text: string;
  type?: string;
  disabled: boolean;
}

export interface InputInfo {
  selector: string;
  type: string;
  name?: string;
  placeholder?: string;
  value?: string;
  required: boolean;
}

export class Observer {
  constructor(private page: Page) {}

  private lastPageSnapshot: PageSnapshot | null = null;
  private lastUpdateTime: number = 0;
  private lastUrl: string = '';
  private cacheConfig = {
    enabled: true,
    ttl: 5000,
    forceRefreshOnNavigation: true,
  };
  private eventListeners: Map<string, Function[]> = new Map();
  private isDisposed: boolean = false;

  async getPageState(): Promise<PageState> {
    const url = this.page.url();
    const title = await this.page.title();
    
    const interactiveElements = await this.extractInteractiveElements();

    return {
      url,
      title,
      interactiveElements,
    };
  }

  async getPageStateString(): Promise<string> {
    const state = await this.getPageState();
    return JSON.stringify(state, null, 2);
  }

  async getDetailedPageSnapshot(): Promise<PageSnapshot> {
    const currentUrl = this.page.url();
    const now = Date.now();

    if (this.cacheConfig.enabled && this.lastPageSnapshot) {
      const isUrlChanged = currentUrl !== this.lastUrl;
      const isCacheExpired = now - this.lastUpdateTime > this.cacheConfig.ttl;

      if (!isUrlChanged && !isCacheExpired) {
        console.log('[Observer] Using cached page snapshot');
        return this.lastPageSnapshot;
      }

      if (isUrlChanged && this.cacheConfig.forceRefreshOnNavigation) {
        console.log('[Observer] URL changed, refreshing snapshot');
      }
    }

    const url = currentUrl;
    const title = await this.page.title();
    
    const elements = await this.extractDetailedElements();
    const forms = await this.extractForms();
    const links = elements.filter(e => e.tag === 'a').map(e => ({
      selector: e.selector,
      text: e.text,
      href: e.href || '',
    }));
    const buttons = elements.filter(e => e.tag === 'button' || e.type === 'button').map(e => ({
      selector: e.selector,
      text: e.text,
      type: e.type,
      disabled: false,
    }));
    const inputs = elements.filter(e => e.tag === 'input' || e.tag === 'textarea' || e.tag === 'select').map(e => ({
      selector: e.selector,
      type: e.type || 'text',
      name: e.name,
      placeholder: e.placeholder,
      value: e.value,
      required: false,
    }));

    const snapshot: PageSnapshot = {
      url,
      title,
      elements,
      forms,
      links,
      buttons,
      inputs,
    };

    this.lastPageSnapshot = snapshot;
    this.lastUpdateTime = Date.now();
    this.lastUrl = url;

    return snapshot;
  }

  async getPageSnapshotForLLM(): Promise<string> {
    const snapshot = await this.getDetailedPageSnapshot();
    
    let summary = `Current Page:
URL: ${snapshot.url}
Title: ${snapshot.title}

`;

    if (snapshot.buttons.length > 0) {
      summary += `Buttons (${snapshot.buttons.length}):\n`;
      snapshot.buttons.slice(0, 10).forEach((btn, i) => {
        summary += `  ${i + 1}. "${btn.text}" -> ${btn.selector}\n`;
      });
      summary += '\n';
    }

    if (snapshot.links.length > 0) {
      summary += `Links (${snapshot.links.length}):\n`;
      snapshot.links.slice(0, 10).forEach((link, i) => {
        summary += `  ${i + 1}. "${link.text}" -> ${link.href}\n`;
      });
      summary += '\n';
    }

    if (snapshot.inputs.length > 0) {
      summary += `Input Fields (${snapshot.inputs.length}):\n`;
      snapshot.inputs.slice(0, 10).forEach((input, i) => {
        const placeholder = input.placeholder ? ` (placeholder: "${input.placeholder}")` : '';
        const name = input.name ? ` [name="${input.name}"]` : '';
        summary += `  ${i + 1}. ${input.type}${name}${placeholder} -> ${input.selector}\n`;
      });
      summary += '\n';
    }

    if (snapshot.forms.length > 0) {
      summary += `Forms (${snapshot.forms.length}):\n`;
      snapshot.forms.slice(0, 5).forEach((form, i) => {
        summary += `  ${i + 1}. ${form.selector} with ${form.inputs.length} inputs\n`;
      });
      summary += '\n';
    }

    const otherElements = snapshot.elements.filter(
      e => !['button', 'a', 'input', 'textarea', 'select'].includes(e.tag)
    );
    if (otherElements.length > 0) {
      summary += `Other Interactive Elements (${otherElements.length}):\n`;
      otherElements.slice(0, 10).forEach((el, i) => {
        summary += `  ${i + 1}. <${el.tag}> "${el.text.slice(0, 30)}" -> ${el.selector}\n`;
      });
    }

    return summary;
  }

  private async extractInteractiveElements(): Promise<InteractiveElement[]> {
    try {
      const elements = await this.page.evaluate(() => {
        const selectors = [
          'button',
          'a[href]',
          'input',
          'select',
          'textarea',
          '[role="button"]',
          '[role="link"]',
          '[role="checkbox"]',
          '[role="radio"]',
          '[onclick]',
          '[data-testid]',
        ];
        
        const allElements: Element[] = [];
        for (const selector of selectors) {
          allElements.push(...document.querySelectorAll(selector));
        }
        
        const uniqueElements = [...new Set(allElements)];
        
        return uniqueElements.slice(0, 30).map(el => {
          const htmlEl = el as HTMLElement;
          return {
            tag: el.tagName.toLowerCase(),
            text: (el.textContent || '').trim().slice(0, 50),
            id: el.id || '',
            className: typeof htmlEl.className === 'string' 
              ? htmlEl.className.slice(0, 50) 
              : '',
            visible: !!(htmlEl.offsetParent || htmlEl.offsetWidth || htmlEl.offsetHeight),
            type: (el as HTMLInputElement).type || '',
            name: (el as HTMLInputElement).name || '',
            placeholder: (el as HTMLInputElement).placeholder || '',
            href: (el as HTMLAnchorElement).href || '',
            dataTestId: el.getAttribute('data-testid') || '',
          };
        });
      });

      return elements;
    } catch (error) {
      console.error('Failed to extract interactive elements:', error);
      return [];
    }
  }

  private async extractDetailedElements(): Promise<DetailedElement[]> {
    try {
      const elements = await this.page.evaluate(() => {
        const selectors = [
          'button',
          'a[href]',
          'input',
          'select',
          'textarea',
          '[role="button"]',
          '[role="link"]',
          '[role="checkbox"]',
          '[role="radio"]',
          '[role="textbox"]',
          '[onclick]',
          '[data-testid]',
          '[tabindex]',
        ];
        
        const allElements: Element[] = [];
        for (const selector of selectors) {
          allElements.push(...document.querySelectorAll(selector));
        }
        
        const uniqueElements = [...new Set(allElements)];
        
        const generateSelector = (el: Element): string => {
          if (el.id) return `#${el.id}`;
          
          const dataTestId = el.getAttribute('data-testid');
          if (dataTestId) return `[data-testid="${dataTestId}"]`;
          
          const ariaLabel = el.getAttribute('aria-label');
          if (ariaLabel) {
            return `${el.tagName.toLowerCase()}[aria-label="${ariaLabel}"]`;
          }
          
          const name = (el as HTMLInputElement).name;
          if (name) {
            return `${el.tagName.toLowerCase()}[name="${name}"]`;
          }
          
          const placeholder = (el as HTMLInputElement).placeholder;
          if (placeholder) {
            return `${el.tagName.toLowerCase()}[placeholder="${placeholder}"]`;
          }
          
          const text = (el.textContent || '').trim().slice(0, 30);
          if (text && el.tagName.toLowerCase() !== 'input') {
            return `${el.tagName.toLowerCase()}:has-text("${text}")`;
          }
          
          const type = (el as HTMLInputElement).type;
          if (type) {
            return `${el.tagName.toLowerCase()}[type="${type}"]`;
          }
          
          return el.tagName.toLowerCase();
        };
        
        return uniqueElements.slice(0, 50).map(el => {
          const htmlEl = el as HTMLElement;
          const rect = el.getBoundingClientRect();
          
          return {
            tag: el.tagName.toLowerCase(),
            text: (el.textContent || '').trim().slice(0, 100),
            id: el.id || '',
            className: typeof htmlEl.className === 'string' 
              ? htmlEl.className.slice(0, 100) 
              : '',
            visible: !!(htmlEl.offsetParent || htmlEl.offsetWidth || htmlEl.offsetHeight),
            type: (el as HTMLInputElement).type || '',
            name: (el as HTMLInputElement).name || '',
            placeholder: (el as HTMLInputElement).placeholder || '',
            href: (el as HTMLAnchorElement).href || '',
            dataTestId: el.getAttribute('data-testid') || '',
            ariaLabel: el.getAttribute('aria-label') || '',
            title: el.getAttribute('title') || '',
            value: (el as HTMLInputElement).value || '',
            selector: generateSelector(el),
            boundingBox: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
            },
          };
        });
      });

      return elements;
    } catch (error) {
      console.error('Failed to extract detailed elements:', error);
      return [];
    }
  }

  private async extractForms(): Promise<FormInfo[]> {
    try {
      const forms = await this.page.evaluate(() => {
        const formElements = document.querySelectorAll('form');
        
        return Array.from(formElements).map(form => {
          const inputs = form.querySelectorAll('input, select, textarea');
          return {
            selector: form.id ? `#${form.id}` : 'form',
            action: form.action || '',
            method: form.method || '',
            inputs: Array.from(inputs).map(input => {
              const el = input as HTMLInputElement;
              if (el.id) return `#${el.id}`;
              if (el.name) return `[name="${el.name}"]`;
              return input.tagName.toLowerCase();
            }),
          };
        });
      });

      return forms;
    } catch (error) {
      console.error('Failed to extract forms:', error);
      return [];
    }
  }

  async takeScreenshot(name: string): Promise<string> {
    ensureDirectoriesOnce();
    
    const dir = config.screenshot.dir;
    const fileName = `${name}-${Date.now()}.png`;
    const filePath = path.join(dir, fileName);
    
    await this.page.screenshot({ 
      path: filePath, 
      fullPage: false,
    });
    
    return filePath;
  }

  async takeFullPageScreenshot(name: string): Promise<string> {
    ensureDirectoriesOnce();
    
    const dir = config.screenshot.dir;
    const fileName = `${name}-full-${Date.now()}.png`;
    const filePath = path.join(dir, fileName);
    
    await this.page.screenshot({ 
      path: filePath, 
      fullPage: true,
    });
    
    return filePath;
  }

  async getConsoleMessages(): Promise<string[]> {
    if (this.isDisposed) {
      return [];
    }

    const messages: string[] = [];
    
    const handler = (msg: any) => {
      messages.push(`[${msg.type()}] ${msg.text()}`);
    };
    
    this.page.on('console', handler);
    this.addEventListener('console', handler);
    
    return messages;
  }

  async getErrors(): Promise<string[]> {
    if (this.isDisposed) {
      return [];
    }

    const errors: string[] = [];
    
    const handler = (error: any) => {
      errors.push(error.message);
    };
    
    this.page.on('pageerror', handler);
    this.addEventListener('pageerror', handler);
    
    return errors;
  }

  async getNetworkRequests(): Promise<string[]> {
    if (this.isDisposed) {
      return [];
    }

    const requests: string[] = [];
    
    const handler = (request: any) => {
      requests.push(`${request.method()} ${request.url()}`);
    };
    
    this.page.on('request', handler);
    this.addEventListener('request', handler);
    
    return requests;
  }

  private addEventListener(event: string, handler: Function): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    
    this.eventListeners.get(event)?.push(handler);
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }

    this.isDisposed = true;

    for (const [event, handlers] of this.eventListeners.entries()) {
      for (const handler of handlers) {
        try {
          this.page.off(event, handler as any);
        } catch (error) {
          console.error(`[Observer] Failed to remove listener for ${event}:`, error);
        }
      }
    }

    this.eventListeners.clear();
    this.lastPageSnapshot = null;
    
    console.log('[Observer] All event listeners cleaned up');
  }

  isObserverDisposed(): boolean {
    return this.isDisposed;
  }

  async getAccessibilityTree(): Promise<string> {
    try {
      const snapshot = await this.page.accessibility.snapshot();
      return JSON.stringify(snapshot, null, 2);
    } catch (error) {
      console.error('Failed to get accessibility tree:', error);
      return '';
    }
  }

  async getElementInfo(selector: string): Promise<any> {
    try {
      const locator = this.page.locator(selector);
      const element = locator.first();
      
      const info = await element.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        return {
          tagName: el.tagName.toLowerCase(),
          text: el.textContent?.trim() || '',
          value: (el as HTMLInputElement).value || '',
          visible: !!(el as HTMLElement).offsetParent,
          boundingBox: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          },
          attributes: Array.from(el.attributes).reduce((acc, attr) => {
            acc[attr.name] = attr.value;
            return acc;
          }, {} as Record<string, string>),
        };
      });
      
      return info;
    } catch (error) {
      return null;
    }
  }

  async findElementByText(text: string): Promise<string | null> {
    try {
      const locator = this.page.getByText(text, { exact: false }).first();
      const count = await locator.count();
      if (count > 0) {
        return `:text("${text}")`;
      }
      return null;
    } catch {
      return null;
    }
  }

  async findElementByRole(role: string, name?: string): Promise<string | null> {
    try {
      const locator = name 
        ? this.page.getByRole(role as any, { name })
        : this.page.getByRole(role as any);
      const count = await locator.count();
      if (count > 0) {
        return name ? `role=${role}[name="${name}"]` : `role=${role}`;
      }
      return null;
    } catch {
      return null;
    }
  }
}

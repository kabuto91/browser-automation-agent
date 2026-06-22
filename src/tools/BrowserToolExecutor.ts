import { Page } from 'playwright';
import { BaseToolExecutor } from './BaseToolExecutor';
import { ToolResult, ToolCallContext } from './toolTypes';
import { browserToolNames } from './browserToolSchemas';
import { BrowserActions } from '../browser/actions';
import { config } from '../config';

/**
 * 浏览器工具执行器
 * 封装 BrowserActions 为 Function Calling 工具
 */
export class BrowserToolExecutor extends BaseToolExecutor {
  name = 'browser_tools';
  private actions: BrowserActions;

  constructor(private page: Page) {
    super();
    this.actions = new BrowserActions(page);
  }

  /**
   * 执行浏览器工具
   */
  async execute(args: Record<string, any>, context?: ToolCallContext): Promise<ToolResult> {
    const startTime = Date.now();
    const toolName = context?.toolName || args.toolName;

    try {
      let result: any;

      switch (toolName) {
        case browserToolNames.NAVIGATE:
          result = await this.executeNavigate(args);
          break;

        case browserToolNames.CLICK:
          result = await this.executeClick(args);
          break;

        case browserToolNames.TYPE:
          result = await this.executeType(args);
          break;

        case browserToolNames.SELECT:
          result = await this.executeSelect(args);
          break;

        case browserToolNames.HOVER:
          result = await this.executeHover(args);
          break;

        case browserToolNames.SCROLL:
          result = await this.executeScroll(args);
          break;

        case browserToolNames.WAIT:
          result = await this.executeWait(args);
          break;

        case browserToolNames.SCREENSHOT:
          result = await this.executeScreenshot(args);
          break;

        case browserToolNames.PRESS:
          result = await this.executePress(args);
          break;

        case browserToolNames.EVALUATE:
          result = await this.executeEvaluate(args);
          break;

        case browserToolNames.GET_TEXT:
          result = await this.executeGetText(args);
          break;

        case browserToolNames.GET_VALUE:
          result = await this.executeGetValue(args);
          break;

        case browserToolNames.GET_URL:
          result = await this.executeGetUrl();
          break;

        case browserToolNames.GET_TITLE:
          result = await this.executeGetTitle();
          break;

        case browserToolNames.IS_VISIBLE:
          result = await this.executeIsVisible(args);
          break;

        case browserToolNames.GET_COUNT:
          result = await this.executeGetCount(args);
          break;

        default:
          return this.createErrorResult(
            `Unknown tool: ${toolName}`,
            Date.now() - startTime
          );
      }

      return this.createSuccessResult(result, Date.now() - startTime);
    } catch (error: any) {
      return this.createErrorResult(
        error.message || String(error),
        Date.now() - startTime
      );
    }
  }

  /**
   * 参数验证
   */
  validateArgs(args: Record<string, any>): boolean {
    if (!args || typeof args !== 'object') {
      return false;
    }

    const toolName = args.toolName;
    if (!toolName || typeof toolName !== 'string') {
      return false;
    }

    return true;
  }

  // ==================== 工具执行方法 ====================

  private async executeNavigate(args: Record<string, any>): Promise<{ url: string; title: string }> {
    const navigateArgs = args as { url: string };
    await this.actions.perform({ type: 'navigate', url: navigateArgs.url });
    
    return {
      url: this.page.url(),
      title: await this.page.title(),
    };
  }

  private async executeClick(args: Record<string, any>): Promise<{ selector: string; clicked: boolean }> {
    const clickArgs = args as { selector: string; description?: string };
    await this.actions.perform({ type: 'click', selector: clickArgs.selector });
    
    return {
      selector: clickArgs.selector,
      clicked: true,
    };
  }

  private async executeType(args: Record<string, any>): Promise<{ selector: string; typed: boolean }> {
    const typeArgs = args as { selector: string; text: string; clear?: boolean };
    if (typeArgs.clear !== false) {
      await this.page.locator(typeArgs.selector).clear();
    }
    
    await this.actions.perform({ type: 'type', selector: typeArgs.selector, text: typeArgs.text });
    
    return {
      selector: typeArgs.selector,
      typed: true,
    };
  }

  private async executeSelect(args: Record<string, any>): Promise<{ selector: string; selected: boolean }> {
    const selectArgs = args as { selector: string; value: string };
    await this.actions.perform({ type: 'select', selector: selectArgs.selector, value: selectArgs.value });
    
    return {
      selector: selectArgs.selector,
      selected: true,
    };
  }

  private async executeHover(args: Record<string, any>): Promise<{ selector: string; hovered: boolean }> {
    const hoverArgs = args as { selector: string };
    await this.actions.perform({ type: 'hover', selector: hoverArgs.selector });
    
    return {
      selector: hoverArgs.selector,
      hovered: true,
    };
  }

  private async executeScroll(args: Record<string, any>): Promise<{ scrolled: boolean }> {
    const scrollArgs = args as { selector?: string; x?: number; y?: number };
    await this.actions.perform({
      type: 'scroll',
      selector: scrollArgs.selector,
      x: scrollArgs.x,
      y: scrollArgs.y,
    });
    
    return { scrolled: true };
  }

  private async executeWait(args: Record<string, any>): Promise<{ waited: boolean }> {
    const waitArgs = args as { selector?: string; ms?: number };
    await this.actions.perform({
      type: 'wait',
      selector: waitArgs.selector,
      ms: waitArgs.ms,
    });
    
    return { waited: true };
  }

  private async executeScreenshot(args: Record<string, any>): Promise<{ name: string; path: string }> {
    const screenshotArgs = args as { name: string; fullPage?: boolean };
    await this.actions.perform({ type: 'screenshot', name: screenshotArgs.name });
    
    const path = `${config.screenshot.dir}/${screenshotArgs.name}-${Date.now()}.png`;
    
    return {
      name: screenshotArgs.name,
      path,
    };
  }

  private async executePress(args: Record<string, any>): Promise<{ key: string; pressed: boolean }> {
    const pressArgs = args as { key: string; selector?: string };
    await this.actions.perform({
      type: 'press',
      key: pressArgs.key,
      selector: pressArgs.selector,
    });
    
    return {
      key: pressArgs.key,
      pressed: true,
    };
  }

  private async executeEvaluate(args: Record<string, any>): Promise<{ result: any }> {
    const evaluateArgs = args as { script: string };
    await this.actions.perform({ type: 'evaluate', script: evaluateArgs.script });
    
    return { result: 'Script executed successfully' };
  }

  private async executeGetText(args: Record<string, any>): Promise<{ selector: string; text: string }> {
    const getTextArgs = args as { selector: string };
    const text = await this.actions.getText(getTextArgs.selector);
    
    return {
      selector: getTextArgs.selector,
      text,
    };
  }

  private async executeGetValue(args: Record<string, any>): Promise<{ selector: string; value: string }> {
    const getValueArgs = args as { selector: string };
    const value = await this.actions.getValue(getValueArgs.selector);
    
    return {
      selector: getValueArgs.selector,
      value,
    };
  }

  private async executeGetUrl(): Promise<{ url: string }> {
    const url = await this.actions.getUrl();
    return { url };
  }

  private async executeGetTitle(): Promise<{ title: string }> {
    const title = await this.actions.getTitle();
    return { title };
  }

  private async executeIsVisible(args: Record<string, any>): Promise<{ selector: string; visible: boolean }> {
    const isVisibleArgs = args as { selector: string };
    const visible = await this.actions.isVisible(isVisibleArgs.selector);
    
    return {
      selector: isVisibleArgs.selector,
      visible,
    };
  }

  private async executeGetCount(args: Record<string, any>): Promise<{ selector: string; count: number }> {
    const getCountArgs = args as { selector: string };
    const count = await this.actions.getCount(getCountArgs.selector);
    
    return {
      selector: getCountArgs.selector,
      count,
    };
  }
}

/**
 * 创建浏览器工具执行器实例
 */
export function createBrowserToolExecutor(page: Page): BrowserToolExecutor {
  return new BrowserToolExecutor(page);
}
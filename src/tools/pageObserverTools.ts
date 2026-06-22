import OpenAI from 'openai';
import { Page } from 'playwright';
import { BaseToolExecutor } from './BaseToolExecutor';
import { ToolResult, ToolCallContext } from './toolTypes';
import { Observer } from '../agent/observer';

type Tool = OpenAI.Chat.ChatCompletionTool;

/**
 * 页面状态观察工具 Schema
 */

export const pageGetStateTool: Tool = {
  type: 'function',
  function: {
    name: 'page_get_state',
    description: '获取当前页面的完整状态信息，包括 URL、标题、可交互元素等',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
};

export const pageFindElementTool: Tool = {
  type: 'function',
  function: {
    name: 'page_find_element',
    description: '根据描述查找页面上的元素，返回匹配的 CSS 选择器',
    parameters: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: '元素的描述，例如 "登录按钮"、"搜索框"、"提交表单"',
        },
        elementType: {
          type: 'string',
          description: '元素类型提示，例如 "button", "input", "a", "form"',
        },
      },
      required: ['description'],
    },
  },
};

export const pageGetInteractiveElementsTool: Tool = {
  type: 'function',
  function: {
    name: 'page_get_interactive_elements',
    description: '获取页面上所有可交互元素的列表（按钮、链接、输入框等）',
    parameters: {
      type: 'object',
      properties: {
        filter: {
          type: 'string',
          description: '可选的过滤条件，例如 "button", "input", "a"',
        },
      },
    },
  },
};

export const pageAnalyzeStructureTool: Tool = {
  type: 'function',
  function: {
    name: 'page_analyze_structure',
    description: '分析页面的整体结构，识别主要区域和关键元素',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
};

/**
 * 所有页面观察工具的集合
 */
export const pageObserverTools: Tool[] = [
  pageGetStateTool,
  pageFindElementTool,
  pageGetInteractiveElementsTool,
  pageAnalyzeStructureTool,
];

/**
 * 页面观察工具名称映射
 */
export const pageObserverToolNames = {
  GET_STATE: 'page_get_state',
  FIND_ELEMENT: 'page_find_element',
  GET_INTERACTIVE_ELEMENTS: 'page_get_interactive_elements',
  ANALYZE_STRUCTURE: 'page_analyze_structure',
} as const;

/**
 * 页面观察工具执行器
 */
export class PageObserverToolExecutor extends BaseToolExecutor {
  name = 'page_observer_tools';
  private observer: Observer;

  constructor(private page: Page) {
    super();
    this.observer = new Observer(page);
  }

  /**
   * 执行页面观察工具
   */
  async execute(args: Record<string, any>, context?: ToolCallContext): Promise<ToolResult> {
    const startTime = Date.now();
    const toolName = context?.toolName || args.toolName;

    try {
      let result: any;

      switch (toolName) {
        case pageObserverToolNames.GET_STATE:
          result = await this.executeGetState();
          break;

        case pageObserverToolNames.FIND_ELEMENT:
          result = await this.executeFindElement(args);
          break;

        case pageObserverToolNames.GET_INTERACTIVE_ELEMENTS:
          result = await this.executeGetInteractiveElements(args);
          break;

        case pageObserverToolNames.ANALYZE_STRUCTURE:
          result = await this.executeAnalyzeStructure();
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

  private async executeGetState(): Promise<{
    url: string;
    title: string;
    interactiveElements: any[];
    stateString: string;
  }> {
    const state = await this.observer.getPageState();
    const stateString = await this.observer.getPageStateString();

    return {
      url: state.url,
      title: state.title,
      interactiveElements: state.interactiveElements,
      stateString,
    };
  }

  private async executeFindElement(args: Record<string, any>): Promise<{
    selectors: string[];
    description: string;
  }> {
    // 使用 LLM 或启发式方法查找元素
    // 这里简化实现，实际可以使用更复杂的逻辑
    const selectors: string[] = [];
    const findElementArgs = args as { description: string; elementType?: string };

    // 根据元素类型查找
    if (findElementArgs.elementType) {
      const elements = await this.page.$$eval(findElementArgs.elementType, (els) =>
        els.map((el) => ({
          tag: el.tagName.toLowerCase(),
          text: el.textContent?.trim() || '',
          id: el.id,
          className: el.className,
          selector: el.id ? `#${el.id}` : el.className ? `.${el.className.split(' ')[0]}` : el.tagName.toLowerCase(),
        }))
      );

      // 根据描述匹配
      const matchingElements = elements.filter((el) =>
        el.text.toLowerCase().includes(findElementArgs.description.toLowerCase()) ||
        el.className.toLowerCase().includes(findElementArgs.description.toLowerCase())
      );

      selectors.push(...matchingElements.map((el) => el.selector));
    } else {
      // 查找所有可交互元素
      const interactiveSelectors = ['button', 'a', 'input', 'select', 'textarea'];
      
      for (const selector of interactiveSelectors) {
        const elements = await this.page.$$eval(selector, (els) =>
          els.map((el) => ({
            tag: el.tagName.toLowerCase(),
            text: el.textContent?.trim() || (el as HTMLInputElement).value || '',
            id: el.id,
            className: el.className,
            selector: el.id ? `#${el.id}` : el.className ? `.${el.className.split(' ')[0]}` : el.tagName.toLowerCase(),
          }))
        );

        const matchingElements = elements.filter((el) =>
          el.text.toLowerCase().includes(findElementArgs.description.toLowerCase()) ||
          el.className.toLowerCase().includes(findElementArgs.description.toLowerCase())
        );

        selectors.push(...matchingElements.map((el) => el.selector));
      }
    }

    return {
      selectors: selectors.length > 0 ? selectors : ['No matching element found'],
      description: findElementArgs.description,
    };
  }

  private async executeGetInteractiveElements(args: {
    filter?: string;
  }): Promise<{
    elements: any[];
    count: number;
  }> {
    const state = await this.observer.getPageState();
    
    let elements = state.interactiveElements;
    
    // 应用过滤
    if (args.filter) {
      elements = elements.filter((el) =>
        el.tag.toLowerCase().includes(args.filter!.toLowerCase())
      );
    }

    return {
      elements,
      count: elements.length,
    };
  }

  private async executeAnalyzeStructure(): Promise<{
    structure: string;
    mainAreas: string[];
    keyElements: string[];
  }> {
    // 分析页面结构
    const html = await this.page.content();
    
    // 简化的结构分析
    const mainAreas: string[] = [];
    const keyElements: string[] = [];

    // 查找主要区域
    const headers = await this.page.$$('header, .header, #header');
    const navs = await this.page.$$('nav, .nav, #nav');
    const mains = await this.page.$$('main, .main, #main');
    const footers = await this.page.$$('footer, .footer, #footer');

    if (headers.length > 0) mainAreas.push('Header');
    if (navs.length > 0) mainAreas.push('Navigation');
    if (mains.length > 0) mainAreas.push('Main Content');
    if (footers.length > 0) mainAreas.push('Footer');

    // 查找关键元素
    const forms = await this.page.$$('form');
    const buttons = await this.page.$$('button');
    const inputs = await this.page.$$('input');
    const links = await this.page.$$('a');

    if (forms.length > 0) keyElements.push(`${forms.length} Forms`);
    if (buttons.length > 0) keyElements.push(`${buttons.length} Buttons`);
    if (inputs.length > 0) keyElements.push(`${inputs.length} Inputs`);
    if (links.length > 0) keyElements.push(`${links.length} Links`);

    const structure = `Page structure: ${mainAreas.join(', ')}. Key elements: ${keyElements.join(', ')}`;

    return {
      structure,
      mainAreas,
      keyElements,
    };
  }
}

/**
 * 创建页面观察工具执行器实例
 */
export function createPageObserverToolExecutor(page: Page): PageObserverToolExecutor {
  return new PageObserverToolExecutor(page);
}
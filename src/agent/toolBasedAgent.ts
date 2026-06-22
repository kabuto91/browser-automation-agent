import { Page } from 'playwright';
import { LLMClient, getLLMClient } from '../llm/llmClient';
import { ToolCallingEngine } from '../llm/toolCallingEngine';
import { BrowserToolExecutor, createBrowserToolExecutor } from '../tools/BrowserToolExecutor';
import { browserTools } from '../tools/browserToolSchemas';
import { ToolCallSession } from '../tools/toolTypes';
import { BrowserManager } from '../browser/browserManager';
import { Observer } from './observer';
import { config } from '../config';

/**
 * Tool-Based Agent
 * 使用 Function Calling 动态执行浏览器自动化任务
 */
export class ToolBasedAgent {
  private llm: LLMClient;
  private engine: ToolCallingEngine;
  private browserManager: BrowserManager;
  private observer!: Observer;
  private page: Page | null = null;

  constructor() {
    this.llm = getLLMClient();
    this.browserManager = new BrowserManager();
    
    // 创建工具调用引擎（稍后初始化执行器）
    this.engine = new ToolCallingEngine(this.llm, [], {
      maxCalls: 50,
      toolTimeout: 30000,
      sessionTimeout: 300000,
      enableLogging: true,
    });
  }

  /**
   * 运行 Agent
   */
  async run(goal: string): Promise<{
    success: boolean;
    result: string;
    session: ToolCallSession;
    screenshots: string[];
  }> {
    try {
      // 1. 初始化浏览器
      console.log('[ToolBasedAgent] Initializing browser...');
      this.page = await this.browserManager.launch();
      this.observer = new Observer(this.page);

      // 2. 注册工具执行器
      const browserExecutor = createBrowserToolExecutor(this.page);
      this.engine = new ToolCallingEngine(this.llm, [browserExecutor], {
        maxCalls: 50,
        toolTimeout: 30000,
        sessionTimeout: 300000,
        enableLogging: true,
      });

      // 3. 生成系统提示
      const systemPrompt = this.generateSystemPrompt();

      // 4. 执行工具调用循环
      console.log('[ToolBasedAgent] Starting tool calling loop...');
      const { finalResponse, session } = await this.engine.runToolCallingLoop(
        systemPrompt,
        goal,
        browserTools as any,
        (context, result) => {
          this.onToolCall(context, result);
        }
      );

      // 5. 收集截图
      const screenshots = await this.collectScreenshots(session);

      // 6. 关闭浏览器
      await this.browserManager.close();

      return {
        success: session.status === 'completed',
        result: finalResponse,
        session,
        screenshots,
      };
    } catch (error: any) {
      console.error('[ToolBasedAgent] Error:', error);
      
      if (this.page) {
        await this.browserManager.close();
      }

      throw error;
    }
  }

  /**
   * 生成系统提示
   */
  private generateSystemPrompt(): string {
    return `You are a browser automation agent that can interact with web pages using tools.

Your goal is to complete the user's task by calling appropriate browser tools.

Available tools:
- browser_navigate: Navigate to a URL
- browser_click: Click an element
- browser_type: Type text into an input field
- browser_select: Select an option from a dropdown
- browser_hover: Hover over an element
- browser_scroll: Scroll the page
- browser_wait: Wait for an element or time
- browser_screenshot: Take a screenshot
- browser_press: Press a keyboard key
- browser_evaluate: Execute JavaScript
- browser_get_text: Get text from an element
- browser_get_value: Get value from an input
- browser_get_url: Get current URL
- browser_get_title: Get page title
- browser_is_visible: Check if an element is visible
- browser_get_count: Get count of elements

Guidelines:
1. Start by navigating to the target URL if needed
2. Use browser_get_text, browser_get_url, browser_get_title to understand the page state
3. Use CSS selectors that are robust (prefer data-testid, id, or unique attributes)
4. Add appropriate wait steps before interactions
5. Take screenshots at key points for debugging
6. Verify actions with appropriate checks
7. If an action fails, try alternative approaches
8. Complete the task efficiently with minimal tool calls

Important:
- Always use valid CSS selectors
- Handle errors gracefully
- Don't make assumptions about page structure
- Verify each step's outcome before proceeding
- Use browser_wait when elements might not be immediately available

Current context:
- Browser is initialized and ready
- You can call tools to interact with the page
- Provide clear reasoning for each tool call`;
  }

  /**
   * 工具调用回调
   */
  private onToolCall(context: any, result: any): void {
    console.log(`[ToolBasedAgent] Tool called: ${context.toolName}`);
    
    // 可以在这里添加额外的逻辑，如：
    // - 记录关键操作
    // - 触发事件
    // - 更新 UI
  }

  /**
   * 收集截图
   */
  private async collectScreenshots(session: ToolCallSession): Promise<string[]> {
    const screenshots: string[] = [];

    // 从会话历史中提取截图
    for (const record of session.history) {
      if (record.result.screenshot) {
        screenshots.push(record.result.screenshot);
      }
    }

    return screenshots;
  }

  /**
   * 获取当前页面状态
   */
  async getPageState(): Promise<string> {
    if (!this.page) {
      return 'Browser not initialized';
    }

    return await this.observer.getPageStateString();
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<{
    browser: boolean;
    llm: boolean;
    tools: boolean;
  }> {
    return {
      browser: this.page !== null,
      llm: this.llm !== null,
      tools: this.engine !== null,
    };
  }
}

/**
 * 创建 Tool-Based Agent 实例
 */
export function createToolBasedAgent(): ToolBasedAgent {
  return new ToolBasedAgent();
}
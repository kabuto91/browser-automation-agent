/**
 * LLM Parser - 将自然语言指令转换为 MCP 工具调用序列
 */

import type { MCPToolSequence, MCPToolCall } from './types';
import { qwenClient } from './qwen-client';

export class LLMParser {
  /**
   * 解析自然语言指令
   * 优先使用千问 LLM API，如果失败则降级到预设模板匹配
   */
  async parseInstruction(instruction: string): Promise<MCPToolSequence> {
    console.log('📝 解析指令:', instruction);

    // 尝试使用千问 LLM API
    try {
      const isAvailable = await qwenClient.isAvailable();
      if (isAvailable) {
        console.log('🤖 使用千问 LLM API 解析...');
        const sequence = await this.parseWithQwen(instruction);
        if (sequence) {
          console.log('✅ 千问 LLM API 解析成功');
          return sequence;
        }
      }
    } catch (error) {
      console.warn('⚠️ 千问 LLM API 解析失败，降级到模板匹配:', error);
    }

    // 降级方案：使用预设模板匹配
    const sequence = this.matchTemplates(instruction);

    if (sequence) {
      console.log('✅ 使用预设模板解析成功');
      return sequence;
    }

    // 如果无法匹配模板，返回错误
    throw new Error('无法解析指令，请提供更详细的描述或使用预设模板');
  }

  /**
   * 使用千问 LLM API 解析指令
   */
  private async parseWithQwen(instruction: string): Promise<MCPToolSequence | null> {
    try {
      // 构造系统提示词
      const systemPrompt = `你是一个浏览器自动化测试助手。用户会给你自然语言描述的测试流程，你需要将其转换为结构化的测试步骤。

每个测试步骤包含：
- tool: 工具名称（browser_navigate, browser_click, browser_type, browser_snapshot, browser_wait_for, browser_evaluate）
- params: 工具参数（根据不同工具有所不同）

关键注意：Playwright MCP 使用辅助功能树的元素引用（ref），而不是 CSS 选择器。
因此，操作流程应该是：
1. 先使用 browser_navigate 打开页面
2. 使用 browser_snapshot 获取页面快照
3. 从快照中找到目标元素的 ref（如 [ref=e5]）
4. 使用 ref 参数进行后续操作（如 browser_click, browser_type）

请以JSON格式返回测试步骤序列，格式如下：
{
  "steps": [
    { "tool": "browser_navigate", "params": { "url": "https://example.com" } },
    { "tool": "browser_snapshot", "params": {} },
    { "tool": "browser_click", "params": { "ref": "e5" } },
    { "tool": "browser_type", "params": { "ref": "e6", "text": "admin" } }
  ]
}

常用工具参数说明：
- browser_navigate: { "url": "https://..." }
- browser_snapshot: {} （获取页面快照，返回元素引用）
- browser_click: { "ref": "元素引用ID" }
- browser_type: { "ref": "元素引用ID", "text": "要输入的文本", "submit": true（可选） }
- browser_wait_for: { "selector": "CSS选择器", "time": 等待秒数 }
- browser_evaluate: { "function": "JavaScript代码" }

注意：
1. 任何交互前都要先 browser_snapshot 获取元素 ref
2. 不要使用 selector 参数（除非是 browser_wait_for）
3. 从用户描述推断元素可能的 ref（如用户名输入框可能是 e3，密码框可能是 e4）
4. 返回纯JSON格式，不要包含其他文字`;

      // 调用千问 API
      const response = await qwenClient.generate([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: instruction },
      ]);

      // 解析 LLM 返回的 JSON
      const sequence = this.parseLLMResponse(response);
      return sequence;
    } catch (error) {
      console.error('❌ 千问 LLM API 解析失败:', error);
      return null;
    }
  }

  /**
   * 解析 LLM 返回的响应，转换为 MCP 工具调用序列
   */
  private parseLLMResponse(response: string | undefined): MCPToolSequence | null {
    try {
      // 检查 response 是否有效
      if (!response || typeof response !== 'string') {
        console.warn('⚠️ LLM 响应为空或无效');
        return null;
      }

      // 提取 JSON 部分（可能包含额外的文字）
      const jsonMatch = response.match(/\{[\s\S]*"steps"[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn('⚠️ LLM 响应中未找到有效 JSON');
        console.log('📋 LLM 响应内容:', response.substring(0, 200));
        return null;
      }

      // 解析 JSON
      const parsed = JSON.parse(jsonMatch[0]);
      
      // 验证格式
      if (!parsed.steps || !Array.isArray(parsed.steps)) {
        console.warn('⚠️ LLM 响应格式不正确');
        return null;
      }

      // 转换为 MCPToolSequence
      const steps: MCPToolCall[] = parsed.steps.map((step: any) => ({
        tool: step.tool,
        params: step.params || {},
      }));

      return { steps };
    } catch (error) {
      console.error('❌ 解析 LLM 响应失败:', error);
      return null;
    }
  }

  /**
   * 预设模板匹配
   */
  private matchTemplates(instruction: string): MCPToolSequence | null {
    const lowerInstruction = instruction.toLowerCase();

    // 登录测试模板
    if (lowerInstruction.includes('登录')) {
      return this.generateLoginTemplate(instruction);
    }

    // 表单填写模板
    if (lowerInstruction.includes('填写') || lowerInstruction.includes('输入')) {
      return this.generateFormTemplate(instruction);
    }

    // 页面导航模板
    if (lowerInstruction.includes('打开') || lowerInstruction.includes('访问')) {
      return this.generateNavigationTemplate(instruction);
    }

    // 内容验证模板
    if (lowerInstruction.includes('验证') || lowerInstruction.includes('检查')) {
      return this.generateAssertionTemplate(instruction);
    }

    return null;
  }

  /**
   * 登录测试模板
   */
  private generateLoginTemplate(instruction: string): MCPToolSequence {
    // 从指令中提取信息
    const urlMatch = instruction.match(/(https?:\/\/[^\s]+)/);
    const url = urlMatch ? urlMatch[1] : 'https://example.com/login';

    const usernameMatch = instruction.match(/用户名\s*([^\s，。]+)/);
    const username = usernameMatch ? usernameMatch[1] : 'admin';

    const passwordMatch = instruction.match(/密码\s*([^\s，。]+)/);
    const password = passwordMatch ? passwordMatch[1] : '123456';

    const steps: MCPToolCall[] = [
      {
        tool: 'browser_navigate',
        params: { url },
      },
      {
        tool: 'browser_snapshot',
        params: {},
      },
      // 注意：后续步骤需要真实 LLM 解析快照结果，获取真实的元素 ref
      // 预设模板无法获取真实页面的元素引用，因此只演示前两个步骤
    ];

    console.log('💡 提示：预设模板只演示导航和快照步骤。');
    console.log('💡 要执行完整的交互流程，请配置真实千问 API Key，让 LLM 从快照中提取真实元素引用。');

    return { steps };
  }

  /**
   * 表单填写模板
   */
  private generateFormTemplate(instruction: string): MCPToolSequence {
    const urlMatch = instruction.match(/(https?:\/\/[^\s]+)/);
    const url = urlMatch ? urlMatch[1] : 'https://example.com/form';

    // 从指令中提取字段信息（简化处理）
    const fields = instruction.match(/输入\s*([^\s]+)\s*([^\s，。]+)/g);

    const steps: MCPToolCall[] = [
      {
        tool: 'browser_navigate',
        params: { url },
      },
      {
        tool: 'browser_snapshot',
        params: {},
      },
      // 注意：后续步骤需要真实 LLM 解析快照结果
    ];

    console.log('💡 提示：预设模板只演示导航和快照步骤。');

    return { steps };
  }

  /**
   * 页面导航模板
   */
  private generateNavigationTemplate(instruction: string): MCPToolSequence {
    const urlMatch = instruction.match(/(https?:\/\/[^\s]+)/);
    const url = urlMatch ? urlMatch[1] : 'https://example.com';

    const steps: MCPToolCall[] = [
      {
        tool: 'browser_navigate',
        params: { url },
      },
      {
        tool: 'browser_snapshot',
        params: {},
      },
      // 注意：后续点击步骤需要真实 LLM 解析快照结果
    ];

    // 如果有点击操作
    if (instruction.includes('点击')) {
      console.log('💡 提示：点击操作需要真实元素引用，请配置千问 API。');
    }

    return { steps };
  }

  /**
   * 内容验证模板
   */
  private generateAssertionTemplate(instruction: string): MCPToolSequence {
    const steps: MCPToolCall[] = [];

    // 如果有 URL，先导航
    const urlMatch = instruction.match(/(https?:\/\/[^\s]+)/);
    if (urlMatch) {
      steps.push({
        tool: 'browser_navigate',
        params: { url: urlMatch[1] },
      });
    }

    // 验证文本
    const textMatch = instruction.match(/验证\s*文本\s*([^\s]+)/);
    if (textMatch) {
      steps.push({
        tool: 'browser_evaluate',
        params: {
          function: `document.body.innerText.includes('${textMatch[1]}')`,
        },
      });
    }

    // 验证元素可见性
    const visibleMatch = instruction.match(/验证\s*([^\s]+)\s*可见/);
    if (visibleMatch) {
      steps.push({
        tool: 'browser_evaluate',
        params: {
          function: `document.querySelector('#${visibleMatch[1]}') !== null`,
        },
      });
    }

    return { steps };
  }
}

// 创建全局 LLM Parser 实例
export const llmParser = new LLMParser();
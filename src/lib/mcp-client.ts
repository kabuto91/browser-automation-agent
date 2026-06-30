/**
 * MCP Client - 连接 Playwright MCP Server 并执行浏览器操作
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CallToolResultSchema, ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js';
import type { MCPToolCall, MCPToolResult, MCPToolSequence, ExecutionStep } from './types';

export class MCPClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private connected: boolean = false;

  /**
   * 连接到 Playwright MCP Server
   */
  async connect(): Promise<void> {
    try {
      // 创建 transport (通过 stdio 与 Playwright MCP Server 通信)
      // 使用官方 Playwright MCP Server: https://github.com/microsoft/playwright-mcp
      this.transport = new StdioClientTransport({
        command: 'npx',
        args: ['-y', '@playwright/mcp@latest'],
      });

      // 创建 MCP Client
      this.client = new Client(
        { name: 'browser-automation-client', version: '1.0.0' },
        { capabilities: {} }
      );

      // 连接到 server
      await this.client.connect(this.transport);
      this.connected = true;

      console.log('✅ 已连接到 Playwright MCP Server');
    } catch (error) {
      console.error('❌ 连接失败:', error);
      this.connected = false;
      throw new Error(`无法连接到 Playwright MCP Server: ${error}`);
    }
  }

  /**
   * 获取可用的工具列表
   */
  async getAvailableTools(): Promise<string[]> {
    if (!this.client || !this.connected) {
      throw new Error('MCP Client 未连接');
    }

    try {
      const response = await this.client.request(
        { method: 'tools/list' },
        ListToolsResultSchema  // 使用导入的 schema
      );

      return response.tools.map(tool => tool.name);
    } catch (error) {
      console.error('获取工具列表失败:', error);
      return [];
    }
  }

  /**
   * 执行单个工具调用
   */
  async executeToolCall(toolCall: MCPToolCall): Promise<MCPToolResult> {
    if (!this.client || !this.connected) {
      throw new Error('MCP Client 未连接');
    }

    try {
      console.log(`🔧 执行工具: ${toolCall.tool}`, toolCall.params);

      // 使用更宽松的调用方式，避免 schema 验证错误
      const response = await this.client.request(
        {
          method: 'tools/call',
          params: {
            name: toolCall.tool,
            arguments: toolCall.params,
          },
        },
        CallToolResultSchema  // 使用导入的 schema
      );

      const result: MCPToolResult = {
        success: !response.isError,
        data: response.content,
        error: response.isError ? response.content?.[0]?.text : undefined,
      };

      // 如果返回了截图，提取 base64 数据
      if (response.content && Array.isArray(response.content)) {
        const screenshot = response.content.find(
          (item: any) => item.type === 'image'
        );
        if (screenshot) {
          result.screenshot = screenshot.data;
        }
      }

      console.log(`✅ 工具执行成功: ${toolCall.tool}`);
      return result;
    } catch (error) {
      console.error(`❌ 工具执行失败: ${toolCall.tool}`, error);
      return {
        success: false,
        error: String(error),
      };
    }
  }

  /**
   * 执行工具调用序列
   */
  async executeSequence(sequence: MCPToolSequence): Promise<ExecutionStep[]> {
    const steps: ExecutionStep[] = [];

    for (let i = 0; i < sequence.steps.length; i++) {
      const toolCall = sequence.steps[i];
      const stepId = `step-${i + 1}`;

      const step: ExecutionStep = {
        id: stepId,
        tool: toolCall.tool,
        params: toolCall.params,
        startTime: new Date(),
        status: 'running',
      };

      steps.push(step);

      try {
        const result = await this.executeToolCall(toolCall);
        
        step.endTime = new Date();
        step.duration = step.endTime.getTime() - step.startTime.getTime();
        step.status = result.success ? 'success' : 'failed';
        step.screenshot = result.screenshot;
        step.error = result.error;

        // 如果步骤失败，停止执行后续步骤
        if (!result.success) {
          console.log(`⚠️ 步骤失败，停止执行后续步骤`);
          break;
        }
      } catch (error) {
        step.endTime = new Date();
        step.duration = step.endTime.getTime() - step.startTime.getTime();
        step.status = 'failed';
        step.error = String(error);

        console.error(`❌ 步骤执行异常:`, error);
        break;
      }
    }

    return steps;
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (this.client && this.connected) {
      try {
        await this.client.close();
        this.connected = false;
        console.log('✅ 已断开 MCP 连接');
      } catch (error) {
        console.error('❌ 断开连接失败:', error);
      }
    }

    if (this.transport) {
      this.transport.close();
      this.transport = null;
    }

    this.client = null;
  }

  /**
   * 检查连接状态
   */
  isConnected(): boolean {
    return this.connected;
  }
}

// 创建全局 MCP Client 实例
export const mcpClient = new MCPClient();
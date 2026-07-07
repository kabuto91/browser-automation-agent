// 脚本执行器 - 按顺序执行工具调用序列

import { ToolCall } from './stepLibraryDB';

export interface ExecutionResult {
  success: boolean;
  error?: string;
  executedSteps: number;
}

export interface MCPClient {
  callTool(params: { name: string; arguments: any }): Promise<any>;
}

export async function executeScript(
  script: ToolCall[],
  mcpClient: MCPClient,
  onProgress?: (step: number, total: number, toolName: string) => void
): Promise<ExecutionResult> {
  for (let i = 0; i < script.length; i++) {
    const { toolName, arguments: args } = script[i];
    
    onProgress?.(i + 1, script.length, toolName);

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`工具调用超时: ${toolName}`)), 30000);
      });

      await Promise.race([
        mcpClient.callTool({
          name: toolName,
          arguments: args,
        }),
        timeoutPromise,
      ]);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        executedSteps: i + 1,
      };
    }
  }

  return {
    success: true,
    executedSteps: script.length,
  };
}

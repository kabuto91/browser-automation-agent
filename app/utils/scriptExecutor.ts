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
  onProgress?: (step: number, total: number, toolName: string) => void,
  instanceId?: string
): Promise<ExecutionResult> {
  const logPrefix = instanceId ? `[${instanceId}]` : '';
  console.log(`${logPrefix} 🚀 开始执行脚本，共 ${script.length} 个步骤`);

  for (let i = 0; i < script.length; i++) {
    const { toolName, arguments: args } = script[i];
    
    console.log(`${logPrefix} 📍 步骤 ${i + 1}/${script.length}: ${toolName}`, args);
    onProgress?.(i + 1, script.length, toolName);

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`工具调用超时: ${toolName}`)), 30000);
      });

      const result = await Promise.race([
        mcpClient.callTool({
          name: toolName,
          arguments: args,
        }),
        timeoutPromise,
      ]);

      console.log(`${logPrefix} ✅ 步骤 ${i + 1} 执行成功:`, typeof result === 'string' ? result.slice(0, 200) : '...');
    } catch (error) {
      console.error(`${logPrefix} ❌ 步骤 ${i + 1} 执行失败:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        executedSteps: i + 1,
      };
    }
  }

  console.log(`${logPrefix} 🎉 脚本执行完成`);
  return {
    success: true,
    executedSteps: script.length,
  };
}

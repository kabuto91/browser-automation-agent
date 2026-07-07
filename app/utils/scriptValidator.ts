// 脚本验证器 - 执行脚本多次验证稳定性

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ToolCall } from './stepLibraryDB';
import { executeScript } from './scriptExecutor';

export interface ValidationResult {
  valid: boolean;
  successCount: number;
  totalAttempts: number;
  errors: string[];
}

export async function validateScript(
  script: ToolCall[],
  mcpClient: Client,
  times: number = 3,
  onProgress?: (attempt: number, total: number, success: boolean) => void
): Promise<ValidationResult> {
  let successCount = 0;
  const errors: string[] = [];

  for (let i = 0; i < times; i++) {
    // 每次验证前重置浏览器状态
    try {
      await mcpClient.callTool({
        name: 'browser_navigate',
        arguments: { url: 'about:blank' },
      });
    } catch (error) {
      errors.push(`Attempt ${i + 1}: Failed to reset browser - ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // 执行脚本
    const result = await executeScript(script, mcpClient);
    
    if (result.success) {
      successCount++;
      onProgress?.(i + 1, times, true);
    } else {
      errors.push(`Attempt ${i + 1}: ${result.error}`);
      onProgress?.(i + 1, times, false);
    }
  }

  return {
    valid: successCount === times,
    successCount,
    totalAttempts: times,
    errors,
  };
}

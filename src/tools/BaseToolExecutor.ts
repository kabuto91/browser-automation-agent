import { ToolResult, ToolCallContext, ToolExecutor } from './toolTypes';

/**
 * 工具执行器抽象基类
 * 提供统一的错误处理、日志记录和性能监控
 */
export abstract class BaseToolExecutor implements ToolExecutor {
  abstract name: string;

  /**
   * 执行工具的抽象方法，子类必须实现
   */
  abstract execute(args: Record<string, any>, context?: ToolCallContext): Promise<ToolResult>;

  /**
   * 参数验证方法，子类可以重写
   */
  validateArgs(args: Record<string, any>): boolean {
    return args !== null && typeof args === 'object';
  }

  /**
   * 安全执行工具，包含错误处理和性能监控
   */
  async safeExecute(
    args: Record<string, any>,
    context?: ToolCallContext
  ): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      // 参数验证
      if (!this.validateArgs(args)) {
        return this.createErrorResult(
          'Invalid arguments',
          Date.now() - startTime
        );
      }

      // 执行工具
      const result = await this.execute(args, context);

      // 日志记录
      this.logExecution(args, result, context);

      return result;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      const errorMessage = error.message || String(error);

      console.error(`[ToolExecutor] Tool "${this.name}" failed:`, errorMessage);

      return this.createErrorResult(errorMessage, duration);
    }
  }

  /**
   * 创建成功结果
   */
  protected createSuccessResult(
    data: any,
    duration: number,
    metadata?: Record<string, any>
  ): ToolResult {
    return {
      toolName: this.name,
      status: 'success',
      data,
      duration,
      metadata,
    };
  }

  /**
   * 创建错误结果
   */
  protected createErrorResult(error: string, duration: number): ToolResult {
    return {
      toolName: this.name,
      status: 'error',
      error,
      duration,
    };
  }

  /**
   * 日志记录
   */
  protected logExecution(
    args: Record<string, any>,
    result: ToolResult,
    context?: ToolCallContext
  ): void {
    const logData = {
      tool: this.name,
      args: this.sanitizeArgs(args),
      status: result.status,
      duration: result.duration,
      callId: context?.callId,
    };

    if (result.status === 'success') {
      console.log('[ToolExecutor] Success:', logData);
    } else {
      console.warn('[ToolExecutor] Failed:', { ...logData, error: result.error });
    }
  }

  /**
   * 清理敏感参数（用于日志记录）
   */
  protected sanitizeArgs(args: Record<string, any>): Record<string, any> {
    const sanitized = { ...args };

    // 隐藏可能包含敏感信息的字段
    const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'api_key'];
    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '***REDACTED***';
      }
    }

    return sanitized;
  }

  /**
   * 超时包装器
   */
  protected async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    errorMessage?: string
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error(errorMessage || `Timeout after ${timeoutMs}ms`)),
          timeoutMs
        )
      ),
    ]);
  }

  /**
   * 重试包装器
   */
  protected async withRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number,
    delayMs: number = 1000
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        if (i < maxRetries) {
          console.warn(
            `[ToolExecutor] Retry ${i + 1}/${maxRetries} for tool "${this.name}":`,
            error.message
          );
          await this.sleep(delayMs);
        }
      }
    }

    throw lastError;
  }

  /**
   * 延迟函数
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * 工具执行器工厂
 */
export class ToolExecutorFactory {
  private static executors: Map<string, ToolExecutor> = new Map();

  /**
   * 注册工具执行器
   */
  static register(executor: ToolExecutor): void {
    ToolExecutorFactory.executors.set(executor.name, executor);
    console.log(`[ToolExecutorFactory] Registered tool: ${executor.name}`);
  }

  /**
   * 获取工具执行器
   */
  static get(name: string): ToolExecutor | undefined {
    return ToolExecutorFactory.executors.get(name);
  }

  /**
   * 获取所有已注册的工具执行器
   */
  static getAll(): ToolExecutor[] {
    return Array.from(ToolExecutorFactory.executors.values());
  }

  /**
   * 获取所有已注册的工具名称
   */
  static getNames(): string[] {
    return Array.from(ToolExecutorFactory.executors.keys());
  }

  /**
   * 清除所有已注册的工具执行器
   */
  static clear(): void {
    ToolExecutorFactory.executors.clear();
    console.log('[ToolExecutorFactory] Cleared all executors');
  }
}
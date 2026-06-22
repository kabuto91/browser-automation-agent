/**
 * 工具调用相关类型定义
 */

/**
 * 工具执行结果
 */
export interface ToolResult {
  /** 工具名称 */
  toolName: string;
  /** 执行状态 */
  status: 'success' | 'error';
  /** 返回数据 */
  data?: any;
  /** 错误信息 */
  error?: string;
  /** 执行时长（毫秒） */
  duration: number;
  /** 截图（可选） */
  screenshot?: string;
  /** 额外信息 */
  metadata?: Record<string, any>;
}

/**
 * 工具调用上下文
 */
export interface ToolCallContext {
  /** 调用 ID */
  callId: string;
  /** 工具名称 */
  toolName: string;
  /** 工具参数 */
  arguments: Record<string, any>;
  /** 调用时间戳 */
  timestamp: number;
  /** 调用来源 */
  source?: 'llm' | 'user' | 'system';
}

/**
 * 工具执行器接口
 */
export interface ToolExecutor {
  /** 工具名称 */
  name: string;
  /** 执行工具 */
  execute(args: Record<string, any>, context?: ToolCallContext): Promise<ToolResult>;
  /** 参数验证 */
  validateArgs(args: Record<string, any>): boolean;
}

/**
 * 工具调用历史记录
 */
export interface ToolCallRecord {
  /** 记录 ID */
  id: string;
  /** 调用上下文 */
  context: ToolCallContext;
  /** 执行结果 */
  result: ToolResult;
  /** 创建时间 */
  createdAt: number;
}

/**
 * 工具调用会话
 */
export interface ToolCallSession {
  /** 会话 ID */
  sessionId: string;
  /** 目标描述 */
  goal: string;
  /** 调用历史 */
  history: ToolCallRecord[];
  /** 会话状态 */
  status: 'running' | 'completed' | 'failed' | 'timeout';
  /** 开始时间 */
  startTime: number;
  /** 结束时间 */
  endTime?: number;
  /** 总调用次数 */
  totalCalls: number;
  /** 成功次数 */
  successCalls: number;
  /** 失败次数 */
  failedCalls: number;
}

/**
 * 工具调用引擎配置
 */
export interface ToolCallingEngineConfig {
  /** 最大调用次数 */
  maxCalls: number;
  /** 单个工具超时时间（毫秒） */
  toolTimeout: number;
  /** 会话超时时间（毫秒） */
  sessionTimeout: number;
  /** 是否启用重试 */
  enableRetry: boolean;
  /** 重试次数 */
  maxRetries: number;
  /** 是否启用日志 */
  enableLogging: boolean;
  /** 是否启用截图 */
  enableScreenshot: boolean;
}

/**
 * 工具调用统计信息
 */
export interface ToolCallStats {
  /** 总调用次数 */
  totalCalls: number;
  /** 成功次数 */
  successCalls: number;
  /** 失败次数 */
  failedCalls: number;
  /** 平均执行时长 */
  avgDuration: number;
  /** 工具使用频率统计 */
  toolUsage: Record<string, number>;
  /** 错误类型统计 */
  errorTypes: Record<string, number>;
}

/**
 * 工具调用选项
 */
export interface ToolCallOptions {
  /** 是否跳过参数验证 */
  skipValidation?: boolean;
  /** 是否启用截图 */
  enableScreenshot?: boolean;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 重试次数 */
  retries?: number;
  /** 额外的上下文信息 */
  context?: Record<string, any>;
}

/**
 * 工具注册信息
 */
export interface ToolRegistration {
  /** 工具名称 */
  name: string;
  /** 工具描述 */
  description: string;
  /** 工具执行器 */
  executor: ToolExecutor;
  /** 工具 Schema */
  schema: any;
  /** 是否启用 */
  enabled: boolean;
  /** 优先级 */
  priority: number;
}

/**
 * 工具调用结果汇总
 */
export interface ToolCallSummary {
  /** 会话 ID */
  sessionId: string;
  /** 目标 */
  goal: string;
  /** 最终状态 */
  finalStatus: 'success' | 'failed' | 'partial';
  /** 总调用次数 */
  totalCalls: number;
  /** 成功次数 */
  successCalls: number;
  /** 失败次数 */
  failedCalls: number;
  /** 总时长 */
  totalDuration: number;
  /** 工具使用统计 */
  toolStats: Record<string, { count: number; successRate: number }>;
  /** 错误列表 */
  errors: Array<{ toolName: string; error: string; timestamp: number }>;
  /** 关键截图 */
  screenshots: Array<{ name: string; data: string; timestamp: number }>;
}
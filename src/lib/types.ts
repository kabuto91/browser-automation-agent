/**
 * 浏览器自动化测试系统类型定义
 */

// MCP 工具调用相关类型
export interface MCPToolCall {
  tool: string;
  params: Record<string, any>;
}

export interface MCPToolResult {
  success: boolean;
  data?: any;
  error?: string;
  screenshot?: string; // base64
}

export interface MCPToolSequence {
  steps: MCPToolCall[];
}

// 执行步骤相关类型
export interface ExecutionStep {
  id: string;
  tool: string;
  params: Record<string, any>;
  startTime: Date;
  endTime?: Date;
  status: 'pending' | 'running' | 'success' | 'failed';
  screenshot?: string;
  error?: string;
  duration?: number; // 毫秒
}

// 测试会话相关类型
export interface TestSession {
  sessionId: string;
  instruction: string;
  startTime: Date;
  endTime?: Date;
  steps: ExecutionStep[];
  result: 'running' | 'success' | 'failed';
  metrics?: {
    totalSteps: number;
    successCount: number;
    failedCount: number;
    avgDuration: number;
  };
}

// 历史记录查询过滤条件
export interface HistoryFilters {
  search?: string;
  status?: 'success' | 'failed' | 'all';
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

// 用户交互事件
export interface UserAction {
  type: 'click' | 'type' | 'scroll' | 'hover';
  selector?: string;
  text?: string;
  coordinates?: { x: number; y: number };
}

// 错误类型分类
export type ErrorType = 
  | 'user_input' 
  | 'llm_parse' 
  | 'mcp_tool' 
  | 'preview' 
  | 'storage';

export type ErrorLevel = 
  | 'fatal' 
  | 'recoverable' 
  | 'non_critical';

export interface ExecutionError {
  timestamp: Date;
  errorType: ErrorType;
  errorLevel: ErrorLevel;
  errorCode: string;
  message: string;
  context?: {
    tool?: string;
    params?: Record<string, any>;
    screenshot?: string;
  };
  userAction?: 'retry' | 'skip' | 'manual' | 'stop';
  recoveryResult?: 'success' | 'failed';
}

// 浏览器预览状态
export interface BrowserPreviewState {
  connected: boolean;
  mode: 'realtime' | 'static' | 'none';
  cdpEndpoint?: string;
  interactionEnabled: boolean;
}

// 执行日志显示格式
export type LogDisplayFormat = 'timeline' | 'list' | 'table';

// 状态栏状态
export interface StatusBarState {
  playwrightConnected: boolean;
  browserReady: boolean;
  llmAvailable: boolean;
  testStatus: 'idle' | 'running' | 'paused' | 'completed' | 'failed';
}
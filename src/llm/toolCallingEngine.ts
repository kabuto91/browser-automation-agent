import OpenAI from 'openai';
import { LLMClient } from './llmClient';
import { ToolExecutor } from '../tools/toolTypes';
import { ToolCallingEngineConfig, ToolCallSession, ToolCallRecord, ToolCallContext } from '../tools/toolTypes';
import { v4 as uuidv4 } from 'uuid';

/**
 * 工具调用引擎
 * 管理工具调用循环、结果处理和会话管理
 */
export class ToolCallingEngine {
  private llm: LLMClient;
  private executors: Map<string, ToolExecutor>;
  private config: ToolCallingEngineConfig;
  private sessions: Map<string, ToolCallSession>;

  constructor(
    llm: LLMClient,
    executors: ToolExecutor[],
    config?: Partial<ToolCallingEngineConfig>
  ) {
    this.llm = llm;
    this.executors = new Map();
    this.sessions = new Map();

    // 注册执行器
    executors.forEach(executor => {
      this.executors.set(executor.name, executor);
    });

    // 默认配置
    this.config = {
      maxCalls: 50,
      toolTimeout: 30000,
      sessionTimeout: 300000,
      enableRetry: true,
      maxRetries: 3,
      enableLogging: true,
      enableScreenshot: true,
      ...config,
    };
  }

  /**
   * 执行工具调用循环
   */
  async runToolCallingLoop(
    systemPrompt: string,
    userMessage: string,
    tools: OpenAI.Chat.ChatCompletionTool[],
    onToolCall?: (context: ToolCallContext, result: any) => void
  ): Promise<{ finalResponse: string; session: ToolCallSession }> {
    const sessionId = uuidv4();
    const session = this.createSession(sessionId, userMessage);

    try {
      let messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'user', content: userMessage },
      ];

      let callCount = 0;
      let lastResponse: OpenAI.Chat.ChatCompletion | null = null;

      while (callCount < this.config.maxCalls) {
        // 调用 LLM
        const response = await this.llm.continueWithToolResult(
          systemPrompt,
          messages,
          tools
        );

        lastResponse = response;
        const choice = response.choices[0];

        // 如果没有工具调用，返回最终结果
        if (!choice.message.tool_calls || choice.message.tool_calls.length === 0) {
          session.status = 'completed';
          session.endTime = Date.now();
          
          return {
            finalResponse: choice.message.content || '',
            session,
          };
        }

        // 处理工具调用
        const assistantMessage = choice.message;
        messages.push(assistantMessage);

        for (const toolCall of choice.message.tool_calls) {
          callCount++;
          session.totalCalls++;

          if (callCount > this.config.maxCalls) {
            session.status = 'timeout';
            session.endTime = Date.now();
            
            console.warn(`[ToolCallingEngine] Max calls (${this.config.maxCalls}) reached`);
            
            return {
              finalResponse: 'Maximum tool calls reached',
              session,
            };
          }

          // 执行工具
          const result = await this.executeToolCall(toolCall, session, onToolCall);

          // 将结果添加到消息历史
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(result),
          });
        }
      }

      session.status = 'timeout';
      session.endTime = Date.now();
      
      return {
        finalResponse: 'Maximum tool calls reached',
        session,
      };
    } catch (error: any) {
      session.status = 'failed';
      session.endTime = Date.now();
      
      console.error('[ToolCallingEngine] Error in tool calling loop:', error);
      
      throw error;
    }
  }

  /**
   * 执行单个工具调用
   */
  private async executeToolCall(
    toolCall: OpenAI.Chat.ChatCompletionMessageToolCall,
    session: ToolCallSession,
    onToolCall?: (context: ToolCallContext, result: any) => void
  ): Promise<any> {
    const startTime = Date.now();
    const toolName = toolCall.function.name;
    const callId = toolCall.id;

    // 创建调用上下文
    const context: ToolCallContext = {
      callId,
      toolName,
      arguments: JSON.parse(toolCall.function.arguments),
      timestamp: startTime,
      source: 'llm',
    };

    try {
      // 获取执行器
      const executor = this.executors.get(toolName);
      if (!executor) {
        throw new Error(`Unknown tool: ${toolName}`);
      }

      // 执行工具
      const result = await this.executeWithTimeout(
        executor.execute(context.arguments, context),
        this.config.toolTimeout
      );

      // 记录成功
      session.successCalls++;
      this.addRecord(session, context, result);

      // 回调
      if (onToolCall) {
        onToolCall(context, result);
      }

      if (this.config.enableLogging) {
        console.log(`[ToolCallingEngine] Tool "${toolName}" executed successfully in ${Date.now() - startTime}ms`);
      }

      return result;
    } catch (error: any) {
      // 记录失败
      session.failedCalls++;
      
      const errorResult = {
        toolName,
        status: 'error',
        error: error.message || String(error),
        duration: Date.now() - startTime,
      };

      this.addRecord(session, context, errorResult);

      if (this.config.enableLogging) {
        console.error(`[ToolCallingEngine] Tool "${toolName}" failed:`, error.message);
      }

      return errorResult;
    }
  }

  /**
   * 带超时的执行
   */
  private async executeWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Tool execution timeout after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
  }

  /**
   * 创建会话
   */
  private createSession(sessionId: string, goal: string): ToolCallSession {
    const session: ToolCallSession = {
      sessionId,
      goal,
      history: [],
      status: 'running',
      startTime: Date.now(),
      totalCalls: 0,
      successCalls: 0,
      failedCalls: 0,
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * 添加记录
   */
  private addRecord(
    session: ToolCallSession,
    context: ToolCallContext,
    result: any
  ): void {
    const record: ToolCallRecord = {
      id: uuidv4(),
      context,
      result,
      createdAt: Date.now(),
    };

    session.history.push(record);
  }

  /**
   * 获取会话
   */
  getSession(sessionId: string): ToolCallSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * 清理过期会话
   */
  cleanupExpiredSessions(): void {
    const now = Date.now();
    
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.endTime && now - session.endTime > this.config.sessionTimeout) {
        this.sessions.delete(sessionId);
      }
    }
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    activeSessions: number;
    totalExecutors: number;
    config: ToolCallingEngineConfig;
  } {
    return {
      activeSessions: this.sessions.size,
      totalExecutors: this.executors.size,
      config: this.config,
    };
  }
}
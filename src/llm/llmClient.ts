import OpenAI from 'openai';
import { config } from '../config';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface CacheEntry {
  result: string;
  timestamp: number;
  ttl: number;
}

interface CacheConfig {
  enabled: boolean;
  ttl: number;
  maxSize: number;
}

interface QueueConfig {
  maxConcurrent: number;
  retryDelay: number;
  maxRetries: number;
}

interface QueueItem {
  id: string;
  execute: () => Promise<string>;
  resolve: (value: string) => void;
  reject: (error: Error) => void;
  retries: number;
  priority: number;
}

export class LLMClient {
  private client: OpenAI;
  private model: string;
  private maxTokens: number;
  private provider: 'anthropic' | 'openai' | 'qwen';
  private cache: Map<string, CacheEntry> = new Map();
  private cacheConfig: CacheConfig = {
    enabled: true,
    ttl: 3600000,
    maxSize: 100,
  };
  private requestQueue: QueueItem[] = [];
  private activeRequests: number = 0;
  private queueConfig: QueueConfig = {
    maxConcurrent: 3,
    retryDelay: 1000,
    maxRetries: 3,
  };
  private isProcessingQueue: boolean = false;

  constructor() {
    this.provider = config.llm.provider;
    this.model = config.llm.model;
    this.maxTokens = config.llm.maxTokens;

    let baseURL = config.llm.baseUrl;
    let apiKey = config.llm.apiKey;

    console.log('baseURL', baseURL)
    console.log('process.env.DASHSCOPE_API_KEY', process.env.DASHSCOPE_API_KEY)

    if (this.provider === 'qwen') {
      baseURL = baseURL || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
      apiKey = apiKey || process.env.DASHSCOPE_API_KEY || '';
    } else if (this.provider === 'openai') {
      baseURL = baseURL || 'https://api.openai.com/v1';
      apiKey = apiKey || process.env.OPENAI_API_KEY || '';
    } else if (this.provider === 'anthropic') {
      baseURL = baseURL || 'https://api.anthropic.com/v1';
      apiKey = apiKey || process.env.ANTHROPIC_API_KEY || '';
    }

    console.log('apiKey', apiKey)

    this.client = new OpenAI({
      apiKey,
      baseURL,
    });
  }

  private addToQueue(
    execute: () => Promise<string>,
    priority: number = 0
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const item: QueueItem = {
        id: `queue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        execute,
        resolve,
        reject,
        retries: 0,
        priority,
      };

      this.requestQueue.push(item);
      this.requestQueue.sort((a, b) => b.priority - a.priority);

      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) {
      return;
    }

    this.isProcessingQueue = true;

    while (
      this.requestQueue.length > 0 &&
      this.activeRequests < this.queueConfig.maxConcurrent
    ) {
      const item = this.requestQueue.shift();
      if (!item) break;

      this.activeRequests++;

      try {
        const result = await item.execute();
        item.resolve(result);
      } catch (error: any) {
        if (item.retries < this.queueConfig.maxRetries) {
          item.retries++;
          console.log(`[LLMClient] Retrying request (attempt ${item.retries}/${this.queueConfig.maxRetries})`);
          
          await new Promise(resolve => 
            setTimeout(resolve, this.queueConfig.retryDelay * item.retries)
          );
          
          this.requestQueue.unshift(item);
          this.requestQueue.sort((a, b) => b.priority - a.priority);
        } else {
          item.reject(error);
        }
      } finally {
        this.activeRequests--;
      }
    }

    this.isProcessingQueue = false;

    if (this.requestQueue.length > 0 && this.activeRequests < this.queueConfig.maxConcurrent) {
      this.processQueue();
    }
  }

  getQueueStats(): { queueLength: number; activeRequests: number; maxConcurrent: number } {
    return {
      queueLength: this.requestQueue.length,
      activeRequests: this.activeRequests,
      maxConcurrent: this.queueConfig.maxConcurrent,
    };
  }

  private generateCacheKey(systemPrompt: string, userMessage: string): string {
    const combined = `${systemPrompt}:${userMessage}`;
    const hash = combined.length > 200 
      ? combined.slice(0, 100) + combined.slice(-100)
      : combined;
    return hash;
  }

  private getCached(key: string): string | null {
    if (!this.cacheConfig.enabled) {
      return null;
    }

    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.result;
  }

  private setCache(key: string, result: string): void {
    if (!this.cacheConfig.enabled) {
      return;
    }

    if (this.cache.size >= this.cacheConfig.maxSize) {
      this.cleanExpiredCache();
      
      if (this.cache.size >= this.cacheConfig.maxSize) {
        const oldestKey = this.cache.keys().next().value;
        if (oldestKey) {
          this.cache.delete(oldestKey);
        }
      }
    }

    this.cache.set(key, {
      result,
      timestamp: Date.now(),
      ttl: this.cacheConfig.ttl,
    });
  }

  private cleanExpiredCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }

  getCacheStats(): { size: number; maxSize: number; enabled: boolean } {
    return {
      size: this.cache.size,
      maxSize: this.cacheConfig.maxSize,
      enabled: this.cacheConfig.enabled,
    };
  }

  clearCache(): void {
    this.cache.clear();
  }

  dispose(): void {
    this.clearCache();
    this.requestQueue = [];
    this.isProcessingQueue = false;
    
    console.log('[LLMClient] All resources cleaned up');
  }

  getQueueStatus(): { queueLength: number; isProcessing: boolean } {
    return {
      queueLength: this.requestQueue.length,
      isProcessing: this.isProcessingQueue,
    };
  }

  async chat(systemPrompt: string, userMessage: string): Promise<string> {
    const cacheKey = this.generateCacheKey(systemPrompt, userMessage);
    
    const cachedResult = this.getCached(cacheKey);
    if (cachedResult) {
      console.log('[LLMClient] Using cached response');
      return cachedResult;
    }

    const executeRequest = async (): Promise<string> => {
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ];

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages,
        max_tokens: this.maxTokens,
      });

      return response.choices[0]?.message?.content || '';
    };

    const result = await this.addToQueue(executeRequest);
    
    this.setCache(cacheKey, result);
    
    return result;
  }

  async chatWithHistory(
    systemPrompt: string,
    messages: ChatMessage[]
  ): Promise<string> {
    const formattedMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      })),
    ];

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: formattedMessages,
      max_tokens: this.maxTokens,
    });

    return response.choices[0]?.message?.content || '';
  }

  async chatWithJson<T>(
    systemPrompt: string,
    userMessage: string
  ): Promise<T> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages,
      max_tokens: this.maxTokens,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content || '{}';
    return JSON.parse(content) as T;
  }

  /**
   * 支持 Function Calling 的对话方法
   */
  async chatWithTools(
    systemPrompt: string,
    userMessage: string,
    tools: OpenAI.Chat.ChatCompletionTool[]
  ): Promise<OpenAI.Chat.ChatCompletion> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages,
      max_tokens: this.maxTokens,
      tools,
      tool_choice: 'auto',
    });

    return response;
  }

  /**
   * 支持 Function Calling 的多轮对话方法
   */
  async chatWithToolsAndHistory(
    systemPrompt: string,
    messages: ChatMessage[],
    tools: OpenAI.Chat.ChatCompletionTool[]
  ): Promise<OpenAI.Chat.ChatCompletion> {
    const formattedMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      })),
    ];

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: formattedMessages,
      max_tokens: this.maxTokens,
      tools,
      tool_choice: 'auto',
    });

    return response;
  }

  /**
   * 继续对话（用于工具调用结果返回后）
   */
  async continueWithToolResult(
    systemPrompt: string,
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    tools: OpenAI.Chat.ChatCompletionTool[]
  ): Promise<OpenAI.Chat.ChatCompletion> {
    const allMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...messages,
    ];

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: allMessages,
      max_tokens: this.maxTokens,
      tools,
      tool_choice: 'auto',
    });

    return response;
  }
}

let globalLLMClientInstance: LLMClient | null = null;

export function getLLMClient(): LLMClient {
  if (!globalLLMClientInstance) {
    globalLLMClientInstance = new LLMClient();
    console.log('[LLMClient] Created global singleton instance');
  }
  return globalLLMClientInstance;
}

export function resetLLMClient(): void {
  if (globalLLMClientInstance) {
    globalLLMClientInstance.clearCache();
    globalLLMClientInstance = null;
    console.log('[LLMClient] Reset global instance');
  }
}

import OpenAI from 'openai';
import { config } from '../config';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export class LLMClient {
  private client: OpenAI;
  private model: string;
  private maxTokens: number;
  private provider: 'anthropic' | 'openai' | 'qwen';

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

  async chat(systemPrompt: string, userMessage: string): Promise<string> {
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
}

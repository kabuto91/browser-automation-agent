import OpenAI from 'openai';
import type {
  ChatCompletionTool,
} from "openai/resources/chat/completions";

export class LLMClient {
  private client: OpenAI;
  private model: string;
  constructor() {
    this.model = process.env.OPENAI_API_MODEL || "gpt-3.5-turbo";
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_API_BASE_URL,
    });
  }

  private parseResponse(response: any): any {
    if (typeof response === 'object' && response?.choices?.[0]?.message) {
      return response;
    }
    let raw: string;
    if (typeof response === 'string') {
      raw = response;
    } else {
      raw = String(response);
    }
    const jsonStr = raw.replace(/^data:\s*/, '').trim();
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed.error) {
        throw new Error(`LLM API error: ${parsed.error.error_msg || JSON.stringify(parsed.error)}`);
      }
      return parsed;
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('LLM API error')) throw e;
      console.error('[parseResponse] JSON.parse failed, raw slice:', raw.slice(0, 300));
      throw e;
    }
  }
  
  async chat(systemMsg: string, userMessage: string) {
    
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemMsg },
      { role: 'user', content: userMessage },
    ];
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages
    });
    return this.parseResponse(response).choices[0].message.content;
  }

  async chatWithHistory(systemMsg: string, userMessage: string, history: string[]) {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemMsg },
      ...history.map(msg => ({ role: 'user' as const, content: msg })),
      { role: 'user', content: userMessage },
    ];
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages
    });
    console.log(response);
    
    return this.parseResponse(response).choices[0].message.content;
  }

  async chatWithTool(systemMsg: string, history: OpenAI.Chat.ChatCompletionMessageParam[], tools: ChatCompletionTool[]) {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemMsg },
      ...history,
    ];
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages,
      tools,
      tool_choice: "auto",
      temperature: 0.3,
    });
    return this.parseResponse(response).choices[0].message;
  }
}

let globalLLMClient: LLMClient | null = null;

export function getLLMClient() {
  if (!globalLLMClient) {
    globalLLMClient = new LLMClient();
  }
  return globalLLMClient;
}

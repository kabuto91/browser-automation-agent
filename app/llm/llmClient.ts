import { ChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

export class LLMClient {
  private client: ChatOpenAI;

  constructor() {
    this.client = new ChatOpenAI({
      model: process.env.OPENAI_API_MODEL || "qwen3.6-35b-a3b",
      apiKey: process.env.OPENAI_API_KEY,
      configuration: {
        baseURL: process.env.OPENAI_API_BASE_URL,
      },
      temperature: 0.3,
    });
  }

  async chat(systemMsg: string, userMessage: string): Promise<string> {
    const messages = [
      new SystemMessage(systemMsg),
      new HumanMessage(userMessage),
    ];

    const response = await this.client.invoke(messages);
    return response.content as string;
  }
}

let globalLLMClient: LLMClient | null = null;

export function getLLMClient() {
  if (!globalLLMClient) {
    globalLLMClient = new LLMClient();
  }
  return globalLLMClient;
}

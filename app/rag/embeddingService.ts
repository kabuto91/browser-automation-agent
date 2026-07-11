// 嵌入生成服务 - 使用 LangChain OpenAI Embeddings

import { OpenAIEmbeddings } from '@langchain/openai';

let embeddingsInstance: OpenAIEmbeddings | null = null;

export function getEmbeddings(): OpenAIEmbeddings {
  if (!embeddingsInstance) {
    embeddingsInstance = new OpenAIEmbeddings({
      model: 'text-embedding-3-small',
      apiKey: process.env.OPENAI_API_KEY,
      configuration: {
        baseURL: process.env.OPENAI_API_BASE_URL,
      },
    });
  }
  return embeddingsInstance;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const embeddings = getEmbeddings();
  const vector = await embeddings.embedQuery(text);
  return vector;
}

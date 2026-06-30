/**
 * 千问（Qwen）LLM API 客户端
 * 使用阿里云 DashScope 服务
 */

import axios from 'axios';

export interface QwenMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface QwenResponse {
  output: {
    text: string;
    finish_reason: string;
  };
  usage: {
    total_tokens: number;
    input_tokens: number;
    output_tokens: number;
  };
  request_id: string;
}

export class QwenAPIClient {
  private apiKey: string;
  private model: string;
  private endpoint: string;

  constructor() {
    // 从环境变量获取配置
    this.apiKey = process.env.QWEN_API_KEY || 'sk-test-key';
    this.model = process.env.QWEN_MODEL || 'qwen-turbo';
    this.endpoint = process.env.QWEN_API_ENDPOINT || 
      'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation';

    console.log('🔧 千问 API 配置:', {
      model: this.model,
      endpoint: this.endpoint,
      apiKeyConfigured: this.apiKey !== 'sk-test-key',
    });
  }

  /**
   * 调用千问 API 进行文本生成
   */
  async generate(
    messages: QwenMessage[],
    options?: {
      temperature?: number;
      max_tokens?: number;
      top_p?: number;
    }
  ): Promise<string> {
    try {
      console.log('🚀 调用千问 API...');

      const response = await axios.post<QwenResponse>(
        this.endpoint,
        {
          model: this.model,
          input: {
            messages: messages,
          },
          parameters: {
            temperature: options?.temperature || 0.7,
            max_tokens: options?.max_tokens || 2000,
            top_p: options?.top_p || 0.8,
            result_format: 'message',
          },
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      console.log('✅ 千问 API 调用成功');
      console.log('📊 Token 使用:', response.data.usage);

      return response.data.output.text;
    } catch (error) {
      console.error('❌ 千问 API 调用失败:', error);
      
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          throw new Error('API Key 无效，请检查环境变量配置');
        }
        if (error.response?.status === 429) {
          throw new Error('API 调用频率超限，请稍后重试');
        }
        throw new Error(`API 调用失败: ${error.response?.data?.message || error.message}`);
      }
      
      throw new Error(`API 调用异常: ${String(error)}`);
    }
  }

  /**
   * 检查 API 是否可用
   */
  async isAvailable(): Promise<boolean> {
    if (this.apiKey === 'sk-test-key') {
      console.warn('⚠️ 使用测试 API Key，请配置真实的千问 API Key');
      return false;
    }

    try {
      // 发送简单测试请求
      await this.generate([
        { role: 'user', content: '你好' },
      ], { max_tokens: 10 });
      return true;
    } catch (error) {
      console.warn('⚠️ 千问 API 不可用:', error);
      return false;
    }
  }
}

// 创建全局千问 API 客户端实例
export const qwenClient = new QwenAPIClient();
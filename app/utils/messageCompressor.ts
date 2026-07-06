/**
 * 消息历史压缩器
 * 对历史消息进行摘要而非简单截断，减少 token 消耗
 */

import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

/**
 * 压缩消息历史
 * @param messages 原始消息历史
 * @param keepRecent 保留最近的消息数量
 * @returns 压缩后的消息历史
 */
export function compressMessages(
  messages: ChatCompletionMessageParam[],
  keepRecent: number = 5
): ChatCompletionMessageParam[] {
  if (messages.length <= keepRecent) {
    return messages;
  }

  // 保留最近的消息
  const recentMessages = messages.slice(-keepRecent);
  
  // 压缩早期消息
  const earlyMessages = messages.slice(0, -keepRecent);
  const compressedSummary = compressEarlyMessages(earlyMessages);

  // 如果没有早期消息需要压缩，直接返回
  if (!compressedSummary) {
    return recentMessages;
  }

  // 返回压缩后的消息
  return [
    { role: 'user', content: compressedSummary },
    ...recentMessages
  ];
}

/**
 * 压缩早期消息为摘要
 */
function compressEarlyMessages(messages: ChatCompletionMessageParam[]): string {
  if (messages.length === 0) {
    return '';
  }

  const summary: string[] = ['以下是之前操作的摘要：'];
  const toolCalls: string[] = [];
  const toolResults: string[] = [];

  for (const msg of messages) {
    if (msg.role === 'tool') {
      // 提取工具名称和关键结果
      const briefResult = extractBriefResult(msg.content as string);
      toolResults.push(briefResult);
    } else if (msg.role === 'assistant') {
      const assistantMsg = msg as ChatCompletionMessageParam & { tool_calls?: Array<{ function: { name: string; arguments: string } }> };
      if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
        // 提取工具调用意图
        const toolNames = assistantMsg.tool_calls.map((tc: { function: { name: string; arguments: string } }) => tc.function.name);
        toolCalls.push(...toolNames);
      } else if (msg.content) {
        // 提取助手的关键回复
        const briefContent = extractBriefContent(msg.content as string);
        if (briefContent) {
          summary.push(`- 助手: ${briefContent}`);
        }
      }
    } else if (msg.role === 'user' && msg.content) {
      // 提取用户的关键指令
      const briefContent = extractBriefContent(msg.content as string);
      if (briefContent) {
        summary.push(`- 用户: ${briefContent}`);
      }
    }
  }

  // 添加工具调用摘要
  if (toolCalls.length > 0) {
    const uniqueTools = Array.from(new Set(toolCalls));
    summary.push(`- 执行了 ${toolCalls.length} 次工具调用: ${uniqueTools.join(', ')}`);
  }

  // 添加工具结果摘要
  if (toolResults.length > 0) {
    summary.push('- 工具执行结果:');
    toolResults.slice(0, 5).forEach(result => {
      summary.push(`  ${result}`);
    });
    if (toolResults.length > 5) {
      summary.push(`  ... 还有 ${toolResults.length - 5} 个结果`);
    }
  }

  return summary.join('\n');
}

/**
 * 提取工具结果的简要信息
 */
function extractBriefResult(content: string): string {
  if (!content) {
    return '无结果';
  }

  // 如果是 JSON，尝试提取关键信息
  try {
    const json = JSON.parse(content);
    
    // 提取成功/失败状态
    if (json.success !== undefined) {
      return json.success ? '操作成功' : '操作失败';
    }
    
    // 提取 URL
    if (json.url) {
      return `访问: ${json.url}`;
    }
    
    // 提取文本内容的前 100 个字符
    if (json.text) {
      const text = json.text.slice(0, 100);
      return `内容: ${text}${json.text.length > 100 ? '...' : ''}`;
    }
  } catch {
    // 不是 JSON，继续处理
  }

  // 普通文本，提取前 100 个字符
  const brief = content.slice(0, 100);
  return brief + (content.length > 100 ? '...' : '');
}

/**
 * 提取消息内容的简要信息
 */
function extractBriefContent(content: string): string {
  if (!content) {
    return '';
  }

  // 移除多余的空白符
  const cleaned = content.replace(/\s+/g, ' ').trim();

  // 如果内容较短，直接返回
  if (cleaned.length <= 100) {
    return cleaned;
  }

  // 提取第一句话或前 100 个字符
  const firstSentence = cleaned.match(/^[^.!?]+[.!?]?/);
  if (firstSentence && firstSentence[0].length <= 100) {
    return firstSentence[0].trim();
  }

  return cleaned.slice(0, 100) + '...';
}

/**
 * 估算消息的 token 数量（简单估算）
 * @param messages 消息数组
 * @returns 估算的 token 数量
 */
export function estimateTokenCount(messages: ChatCompletionMessageParam[]): number {
  let totalChars = 0;

  for (const msg of messages) {
    if (msg.content) {
      totalChars += (msg.content as string).length;
    }
    
    if (msg.role === 'assistant' && 'tool_calls' in msg && msg.tool_calls) {
      const toolCalls = msg.tool_calls;
      for (const tc of toolCalls) {
        totalChars += (tc as { function: { arguments: string } }).function.arguments.length;
      }
    }
  }

  // 粗略估算：1 token ≈ 4 个字符（英文）或 2 个字符（中文）
  // 取平均值 3 个字符 per token
  return Math.ceil(totalChars / 3);
}

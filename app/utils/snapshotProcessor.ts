/**
 * 快照预处理器
 * 智能截断浏览器快照，保留关键的 ref 和可交互元素，避免超过 LLM API 限制
 */

const MAX_SNAPSHOT_LENGTH = 20000; // 远低于 229376 限制，留足空间给其他内容

export function processSnapshot(rawSnapshot: string): string {
  if (!rawSnapshot || rawSnapshot.length <= MAX_SNAPSHOT_LENGTH) {
    return rawSnapshot;
  }

  const lines = rawSnapshot.split('\n');
  const importantLines: string[] = [];
  const otherLines: string[] = [];

  // 分离重要行和次要行
  for (const line of lines) {
    if (isImportantLine(line)) {
      importantLines.push(line);
    } else {
      otherLines.push(line);
    }
  }

  // 优先保留重要行
  let result = importantLines.join('\n');
  
  // 如果重要行已经超限，截断
  if (result.length > MAX_SNAPSHOT_LENGTH) {
    result = result.slice(0, MAX_SNAPSHOT_LENGTH) + '\n... [重要元素已截断]';
    return result;
  }

  // 还有空间，添加其他行
  const remainingSpace = MAX_SNAPSHOT_LENGTH - result.length;
  const otherContent = otherLines.join('\n');
  
  if (otherContent.length <= remainingSpace) {
    result += '\n' + otherContent;
  } else {
    // 截断其他内容
    result += '\n' + otherContent.slice(0, remainingSpace) + '\n... [页面内容已截断]';
  }

  return result;
}

/**
 * 判断是否为重要行（包含 ref 或可交互元素）
 */
function isImportantLine(line: string): boolean {
  // 包含 ref 属性的行
  if (/\[ref=\d+\]/.test(line)) {
    return true;
  }

  // 可交互元素
  const interactivePatterns = [
    /button/i,
    /link/i,
    /textbox/i,
    /input/i,
    /select/i,
    /checkbox/i,
    /radio/i,
    /combobox/i,
    /menuitem/i,
    /tab/i,
    /role=/i,
  ];

  return interactivePatterns.some(pattern => pattern.test(line));
}

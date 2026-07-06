# Token 优化实施计划

## 概述
实施 4 个优化方案以减少 LLM token 消耗：
1. 快照数据预处理
2. 智能快照缓存
3. 分层登录检测
4. 消息历史压缩

---

## 方案 1：快照数据预处理

### 目标
在发送给 LLM 前压缩浏览器快照数据，减少 60-80% 的 token 消耗

### 实现步骤

#### 1.1 创建快照预处理工具函数
**文件**: `app/utils/snapshotProcessor.ts`（新建）

**功能**:
- 提取可交互元素（按钮、链接、输入框）
- 提取关键文本内容（标题、标签、提示文字）
- 移除冗余信息（CSS 样式、JavaScript、隐藏元素、SVG）
- 保留元素的 ref 属性用于定位

**核心逻辑**:
```typescript
export function processSnapshot(rawSnapshot: string): string {
  // 1. 解析 HTML/DOM 结构
  // 2. 过滤不可见元素（display: none, visibility: hidden）
  // 3. 提取可交互元素：button, a, input, select, textarea
  // 4. 提取文本节点（去除空白符）
  // 5. 保留 ref 属性
  // 6. 生成结构化摘要
}
```

#### 1.2 集成到主流程
**文件**: `app/api/chat/route.ts`

**修改位置**: 第 359-368 行（工具结果处理）

**修改内容**:
```typescript
// 在获取 toolResultText 后，对快照进行预处理
let processedResult = toolResultText;
if (toolName === 'browser_snapshot') {
  processedResult = processSnapshot(toolResultText);
}

messages.push({
  role: "tool",
  tool_call_id: toolCall.id,
  content: processedResult,
});
```

---

## 方案 2：智能快照缓存

### 目标
避免重复分析相似的页面状态，减少 30-50% 的重复调用

### 实现步骤

#### 2.1 创建快照缓存管理器
**文件**: `app/utils/snapshotCache.ts`（新建）

**功能**:
- 对快照内容生成哈希指纹
- 存储快照的关键特征（可交互元素数量、主要文本内容）
- 判断两个快照是否相似（相似度阈值：80%）

**核心逻辑**:
```typescript
class SnapshotCache {
  private cache: Map<string, { hash: string; summary: string; timestamp: number }>;
  
  // 生成快照指纹
  generateHash(snapshot: string): string
  
  // 判断是否与缓存中的快照相似
  isSimilar(currentSnapshot: string): { similar: boolean; cachedSummary?: string }
  
  // 更新缓存
  updateCache(snapshot: string, summary: string): void
  
  // 清理过期缓存（超过 5 分钟）
  cleanup(): void
}
```

#### 2.2 集成到主流程
**文件**: `app/api/chat/route.ts`

**修改位置**: 第 377-411 行（快照处理逻辑）

**修改内容**:
```typescript
// 在处理快照前检查缓存
if (toolName === 'browser_snapshot') {
  const cacheCheck = snapshotCache.isSimilar(toolResultText);
  
  if (cacheCheck.similar && cacheCheck.cachedSummary) {
    // 使用缓存的摘要，跳过重复处理
    console.log('📋 使用快照缓存');
    // 跳过登录检测等重复分析
  } else {
    // 正常处理并更新缓存
    const processed = processSnapshot(toolResultText);
    snapshotCache.updateCache(toolResultText, processed);
  }
}
```

---

## 方案 3：分层登录检测

### 目标
减少登录检测的 LLM 调用，减少 70-90% 的登录检测 LLM 调用

### 实现步骤

#### 3.1 增强登录检测逻辑
**文件**: `app/api/chat/route.ts`

**修改位置**: 第 47-76 行（isLoginPage 函数）

**修改内容**:
```typescript
async function isLoginPage(pageContent: string, llmClient: any): Promise<boolean> {
  // 第一层：关键词匹配（已实现）
  const hasKeyword = LOGIN_KEYWORDS.some(keyword => 
    pageContent.toLowerCase().includes(keyword.toLowerCase())
  );
  
  if (!hasKeyword) {
    return false;
  }
  
  // 第二层：规则引擎（新增）
  const ruleEngineResult = detectLoginByRules(pageContent);
  if (ruleEngineResult === true) {
    return true; // 高置信度，直接返回
  }
  if (ruleEngineResult === false) {
    return false; // 高置信度，直接返回
  }
  // ruleEngineResult === null 表示不确定，继续第三层
  
  // 第三层：LLM 确认（仅在不确定时调用）
  try {
    const prompt = `判断以下页面快照是否为登录页面。只需回答"是"或"否"。
    
页面快照内容：
${pageContent.slice(0, 2000)}

回答：`;
    
    const response = await llmClient.chat(
      '你是一个页面识别助手，专门判断页面是否为登录界面。',
      prompt
    );
    
    return response?.trim().includes('是') || false;
  } catch (error) {
    console.error('LLM 登录页面检测失败:', error);
    return hasKeyword;
  }
}

// 新增：基于规则的登录页面检测
function detectLoginByRules(pageContent: string): boolean | null {
  const lowerContent = pageContent.toLowerCase();
  
  // 高置信度指标（直接返回 true）
  const highConfidenceIndicators = [
    'type="password"',
    'type=\'password\'',
    'name="password"',
    'id="password"',
  ];
  
  if (highConfidenceIndicators.some(indicator => lowerContent.includes(indicator))) {
    return true;
  }
  
  // 低置信度指标（需要多个组合）
  const lowConfidenceIndicators = [
    '登录', '登陆', 'login', 'signin',
    '用户名', 'username', '账号',
    '验证码', 'captcha'
  ];
  
  const matchCount = lowConfidenceIndicators.filter(indicator => 
    lowerContent.includes(indicator)
  ).length;
  
  if (matchCount >= 3) {
    return true; // 多个指标匹配，高置信度
  }
  
  if (matchCount === 0) {
    return false; // 无指标匹配，高置信度
  }
  
  return null; // 不确定，需要 LLM 判断
}
```

---

## 方案 4：消息历史压缩

### 目标
对历史消息进行摘要而非简单截断，减少 40-60% 的历史消息 token

### 实现步骤

#### 4.1 创建消息历史压缩器
**文件**: `app/utils/messageCompressor.ts`（新建）

**功能**:
- 将早期的工具调用结果压缩为摘要
- 保留最近 3-5 条详细消息
- 使用简单的规则生成摘要（不依赖 LLM）

**核心逻辑**:
```typescript
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
  
  // 返回压缩后的消息
  return [
    { role: 'user', content: compressedSummary },
    ...recentMessages
  ];
}

function compressEarlyMessages(messages: ChatCompletionMessageParam[]): string {
  const summary: string[] = ['以下是之前操作的摘要：'];
  
  for (const msg of messages) {
    if (msg.role === 'tool') {
      // 提取工具名称和关键结果
      const toolName = extractToolName(msg);
      const briefResult = extractBriefResult(msg.content);
      summary.push(`- 执行了 ${toolName}：${briefResult}`);
    } else if (msg.role === 'assistant' && msg.tool_calls) {
      // 提取工具调用意图
      const toolNames = msg.tool_calls.map(tc => tc.function.name);
      summary.push(`- 调用了工具：${toolNames.join(', ')}`);
    }
  }
  
  return summary.join('\n');
}
```

#### 4.2 集成到主流程
**文件**: `app/api/chat/route.ts`

**修改位置**: 第 311 行（消息截断调用）

**修改内容**:
```typescript
// 替换原有的 trimMessages 调用
const trimmedMessages = compressMessages(messages, 5);
```

---

## 实施顺序

### 第一阶段：基础优化（立即实施）
1. 创建 `app/utils/snapshotProcessor.ts` - 快照预处理
2. 创建 `app/utils/messageCompressor.ts` - 消息压缩
3. 修改 `app/api/chat/route.ts` - 集成方案 1、3、4

### 第二阶段：缓存优化（后续实施）
4. 创建 `app/utils/snapshotCache.ts` - 快照缓存
5. 修改 `app/api/chat/route.ts` - 集成方案 2

---

## 验证步骤

### 功能验证
1. 运行现有测试用例，确保功能正常
2. 测试登录拦截器是否正常工作
3. 验证消息历史是否正确压缩

### 性能验证
1. 对比优化前后的 token 使用量（通过 API 响应中的 usage 字段）
2. 记录优化前后的执行时间
3. 监控缓存命中率

### 预期效果
- 方案 1：减少 60-80% 的快照 token
- 方案 2：减少 30-50% 的重复调用
- 方案 3：减少 70-90% 的登录检测 LLM 调用
- 方案 4：减少 40-60% 的历史消息 token

---

## 文件清单

### 新建文件
- `app/utils/snapshotProcessor.ts`
- `app/utils/snapshotCache.ts`
- `app/utils/messageCompressor.ts`

### 修改文件
- `app/api/chat/route.ts`

---

## 风险与注意事项

1. **快照预处理可能丢失关键信息**
   - 缓解措施：保留所有可交互元素和关键文本
   - 测试：确保所有测试用例仍能正常执行

2. **缓存可能导致过期数据**
   - 缓解措施：设置 5 分钟过期时间
   - 测试：在页面变化后验证缓存是否正确更新

3. **消息压缩可能影响上下文理解**
   - 缓解措施：保留最近 5 条详细消息
   - 测试：验证多步骤测试任务仍能正常执行

4. **规则引擎可能误判登录页面**
   - 缓解措施：保留 LLM 作为兜底方案
   - 测试：验证各种登录页面的检测准确率

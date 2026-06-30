# 浏览器自动化测试系统设计文档

**日期**: 2026-06-22  
**项目**: my-first-agent  
**作者**: AI Assistant  

---

## 概述

本项目旨在实现一个基于自然语言的浏览器自动化测试系统，用户可以通过 Web 界面输入自然语言指令，系统自动解析并执行浏览器操作，实时展示测试过程和结果。

---

## 核心需求

### 用户需求
1. **输入方式**: Web 界面文本输入
2. **测试场景**: 
   - 表单填写和提交
   - 页面导航和点击
   - 内容验证和断言
   - 综合场景测试
3. **可视化**: 实时浏览器预览
4. **历史记录**: 保存测试历史和结果

### 技术需求
1. 基于 `@modelcontextprotocol/sdk` 实现 MCP 协议
2. 集成 Playwright MCP Server 进行浏览器控制
3. 使用 LLM API 解析自然语言指令
4. 实时预览通过 CDP Protocol + WebSocket 实现
5. 历史记录存储到 SQLite/JSON

---

## 技术栈

```
前端层:        Next.js 16 + React 19
MCP 协议层:    @modelcontextprotocol/sdk
浏览器控制:    Playwright MCP Server
LLM 解析:      OpenAI API / 其他 LLM API
实时预览:      WebSocket + CDP Protocol
历史记录:      SQLite / JSON 文件
```

---

## 系统架构

### 架构分层

```
┌─────────────────────────────────────────────────────────────┐
│                     Web Interface Layer                      │
│  TestInputPanel  │  BrowserPreview  │  ExecutionLog        │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────┐
│                    LLM Parsing Layer                        │
│  Natural Language → MCP Tool Calls Converter               │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────┐
│                    MCP Tool Layer                           │
│  MCP Client - Connect to Playwright MCP Server             │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────┐
│              Browser Control Layer                          │
│  Playwright Browser Instance (Remote Debugging)            │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────────────┐
│                Data Storage Layer                           │
│  History Database (SQLite)                                 │
└─────────────────────────────────────────────────────────────┘
```

### 关键设计决策

1. **为什么使用 MCP SDK**？
   - 标准化的工具调用协议
   - 未来可扩展到其他 MCP 工具（文件系统、数据库等）
   - 统一的错误处理和结果格式

2. **为什么分离 LLM 层和 MCP 层**？
   - 职责清晰：LLM 只负责语义理解，MCP 只负责工具执行
   - 可独立测试和优化
   - 降低耦合度，易于维护

3. **为什么使用 WebSocket + CDP**？
   - 实时性：无需等待请求响应，实时推送浏览器状态
   - 低延迟：直接从浏览器获取截图流
   - 可扩展：支持多人协作、远程控制

---

## 核心组件

### 1. TestInputPanel（测试输入面板）

**职责**: 接收用户自然语言指令

**接口定义**:
```typescript
interface TestInputPanel {
  inputType: 'text' | 'voice' | 'file';
  
  // 功能
  - 文本输入框（支持多行）
  - 快捷指令模板（预定义常用测试流程）
  - 指令历史记录（可重用）
  - 输入验证（基本语法检查）
  
  // 输出
  naturalLanguageInstruction: string;
}
```

### 2. LLMParser（自然语言解析器）

**职责**: 将自然语言转换为 MCP 工具调用序列

**接口定义**:
```typescript
interface LLMParser {
  async parseInstruction(instruction: string): MCPToolSequence {
    // 1. 语义分析
    //    - 识别意图（表单填写、导航、验证等）
    //    - 提取关键信息（URL、元素、文本等）
    
    // 2. 工具映射
    //    - 将意图映射到 MCP 工具
    //    - 生成工具调用参数
    
    // 3. 序列生成
    //    - 确定执行顺序
    //    - 添加等待和验证步骤
    
    return {
      tools: ['browser_navigate', 'browser_click', ...],
      parameters: [{ url: '...' }, { selector: '...' }],
      sequence: [step1, step2, step3]
    };
  }
  
  // 依赖
  llmClient: OpenAI_API;
  toolRegistry: MCPToolRegistry;
}
```

### 3. MCPClient（MCP 协议客户端）

**职责**: 与 Playwright MCP Server 通信

**接口定义**:
```typescript
interface MCPClient {
  async connectToPlaywrightServer(): void {
    // 启动 Playwright MCP Server
    // 建立 stdio/SSE/WebSocket 连接
    // 获取可用工具列表
  }
  
  async executeToolCall(tool: string, params: object): MCPToolResult {
    // 1. 参数验证
    // 2. 发送工具调用请求
    // 3. 接收执行结果
    // 4. 错误处理
    return { success: boolean, data: any, error?: string };
  }
  
  async executeSequence(sequence: MCPToolSequence): ExecutionResult[] {
    // 按顺序执行工具调用
    // 支持暂停、重试、跳过
    // 收集执行日志
  }
}
```

### 4. BrowserPreview（浏览器实时预览）

**职责**: 显示浏览器操作画面

**接口定义**:
```typescript
interface BrowserPreview {
  websocket: WebSocket;  // CDP Protocol
  
  async initializePreview(): void {
    // 1. 获取 Playwright 的 CDP endpoint
    // 2. 建立 WebSocket 连接
    // 3. 监听浏览器事件
  }
  
  onScreenshot(callback: (image: Buffer) => void): void {
    // 接收实时截图流
    // 更新预览画面
  }
  
  async enableUserInteraction(): void {
    // 允许用户在预览中手动操作
    // 同步用户操作到 Playwright
  }
  
  previewStream: React.Component;
}
```

### 5. ExecutionLogger（执行日志记录器）

**职责**: 记录和展示测试执行过程

**接口定义**:
```typescript
interface ExecutionLogger {
  logExecution(step: ExecutionStep): void {
    // 记录每个步骤
    // - 工具名称
    // - 参数
    // - 开始时间
    // - 结束时间
    // - 结果状态
  }
  
  displayFormat: 'timeline' | 'list' | 'table';
  
  // 功能
  - 实时滚动显示
  - 高亮错误步骤
  - 显示耗时统计
  - 支持筛选和搜索
  
  executionLog: ExecutionStep[];
}
```

### 6. HistoryManager（历史记录管理）

**职责**: 保存测试历史数据

**接口定义**:
```typescript
interface HistoryManager {
  database: SQLite | JSON_File;
  
  async saveTestSession(session: TestSession): void {
    // 保存测试指令
    // 保存执行序列
    // 保存执行结果
    // 保存截图
    // 保存时间戳
  }
  
  async queryHistory(filters: HistoryFilters): TestSession[] {
    // 支持按时间、关键词、结果筛选
    // 支持分页和排序
  }
  
  async exportHistory(format: 'json' | 'csv' | 'html'): ExportData {
    // 导出测试报告
    // 导出统计数据
  }
}
```

### 组件依赖关系

```
TestInputPanel → LLMParser → MCPClient → BrowserPreview
                 ↓           ↓            ↓
              ExecutionLogger ← ← ← ← ← ←
                 ↓
              HistoryManager
```

---

## 数据流设计

### 主数据流

```
用户输入自然语言指令
    ↓
[TestInputPanel] 接收并验证
    ↓
naturalLanguageInstruction: "打开登录页面，输入用户名admin..."
    ↓
[LLMParser] 语义解析
    ↓
MCPToolSequence {
  steps: [
    { tool: "browser_navigate", params: { url: "https://example.com/login" } },
    { tool: "browser_type", params: { selector: "#username", text: "admin" } },
    ...
  ]
}
    ↓
[MCPClient] 执行工具调用
    ↓
Playwright MCP Server (浏览器实际操作)
    ↓
MCPToolResult { success: true, screenshot: Buffer }
    ↓
[BrowserPreview] 显示实时画面
[ExecutionLogger] 记录执行步骤
    ↓
[HistoryManager] 保存测试会话
    ↓
最终结果展示给用户
```

### 实时预览流

```
Playwright Browser Instance
    ↓ 启动时配置 CDP
CDP WebSocket Server (Chrome DevTools Protocol)
    ↓ 监听浏览器事件
Page.screencastFrame 事件 (每秒 10-30 帧)
    ↓ 编码为 JPEG/PNG
WebSocket Data Stream
    ↓ 实时推送
[BrowserPreview] React 组件
    ↓ 解码并渲染
<canvas> 显示实时画面
```

### 日志流

```
[MCPClient] 执行每个步骤
    ↓
ExecutionStep {
  id: "step-1",
  tool: "browser_navigate",
  params: { url: "..." },
  startTime: Date,
  endTime: Date,
  status: "success",
  screenshot: Buffer,
  error?: string
}
    ↓ 实时推送
WebSocket/EventEmitter
    ↓ 前端监听
[ExecutionLogger] 状态更新
    ↓ React 状态变化
UI 实时滚动显示新日志
    ↓ 异步保存
[HistoryManager] 写入数据库
```

---

## 错误处理机制

### 错误分类

#### 类型 1: 用户输入错误
- 自然语言指令语法错误
- 缺少关键信息
- 逻辑矛盾

**处理**: TestInputPanel 实时验证，显示错误提示，禁止提交

#### 类型 2: LLM 解析错误
- LLM API 调用失败
- LLM 无法理解指令语义
- 生成的工具调用序列不合理

**处理**: 显示错误信息，提供降级方案（预设模板匹配）

#### 类型 3: MCP 工具执行错误
- Playwright MCP Server 未启动
- 工具调用超时
- 浏览器操作失败

**处理**: 
- 致命错误：立即停止，显示诊断信息
- 可恢复错误：提供选项（重试/跳过/手动干预）

#### 类型 4: 实时预览连接错误
- CDP WebSocket 连接断开
- 截图流中断

**处理**: 降级为定期静态截图更新

#### 类型 5: 历史记录保存错误
- 数据库连接失败
- 文件写入权限错误

**处理**: 显示警告，提供导出选项

### 错误恢复流程

```
错误发生
    ↓
错误分类器
    ├─ 致命错误 → 立即停止，显示诊断信息
    ├─ 可恢复错误 → 显示选项，等待用户决策
    └─ 非关键错误 → 记录日志，降级处理
    ↓
用户选择处理方式
    ├─ 重试 → 重新执行当前步骤
    ├─ 跳过 → 标记失败，继续下一步
    ├─ 手动干预 → 暂停执行，允许用户操作浏览器
    └─ 停止 → 中断测试流程，生成失败报告
    ↓
错误日志记录
    ↓
继续测试或结束
```

---

## 用户界面设计

### 整体布局

```
┌────────────────────────────────────────────────────────────┐
│  Header: Browser Automation Test System                    │
├──────────────────────┬─────────────────────────────────────┤
│  Test Input Panel    │         Browser Preview             │
│  (左侧 30%)          │         (右侧 70%)                  │
│                      │                                     │
│  - Instruction Input │  - Real-time Browser View           │
│  - Quick Templates   │  - Execution Log                   │
│  - Control Buttons   │  - Status & Metrics                │
│                      │                                     │
└──────────────────────┴─────────────────────────────────────┘
```

### 视觉设计风格

- 赛博朋克风格（与现有 ReactFlow 主题一致）
- 深色背景 (#0a0e1a)
- 霓虹边框和按钮（青色 #00f5ff、橙色 #ff6b35、粉色 #ff006e）
- JetBrains Mono 字体
- 微妙的动画效果（按钮悬停、输入验证、步骤执行）

### 关键交互

1. **实时画面流**: WebSocket 接收 CDP 截图流，实时渲染到 Canvas
2. **手动控制**: 用户点击预览区域，映射到浏览器坐标，执行实际操作
3. **错误处理对话框**: 显示错误信息、当前页面截图、处理选项按钮
4. **执行日志实时滚动**: 新日志自动滚动到底部，失败步骤高亮显示

---

## 数据库设计

### 数据表结构

```sql
-- 测试会话表
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  instruction TEXT NOT NULL,
  startTime DATETIME NOT NULL,
  endTime DATETIME,
  result TEXT CHECK(result IN ('success', 'failed', 'running')),
  metrics JSON
);

-- 执行步骤表
CREATE TABLE steps (
  id TEXT PRIMARY KEY,
  sessionId TEXT NOT NULL,
  tool TEXT NOT NULL,
  params JSON NOT NULL,
  startTime DATETIME NOT NULL,
  endTime DATETIME,
  status TEXT CHECK(status IN ('success', 'failed', 'running')),
  error TEXT,
  FOREIGN KEY (sessionId) REFERENCES sessions(id)
);

-- 截图表
CREATE TABLE screenshots (
  id TEXT PRIMARY KEY,
  stepId TEXT NOT NULL,
  imageData BLOB NOT NULL,
  timestamp DATETIME NOT NULL,
  FOREIGN KEY (stepId) REFERENCES steps(id)
);
```

---

## 测试策略

### 单元测试
- TestInputPanel 输入验证逻辑
- LLMParser 指令解析逻辑
- MCPClient 工具调用逻辑
- HistoryManager 数据存储逻辑

### 集成测试
- 从自然语言到浏览器操作的完整流程
- 实时预览连接和截图流
- 错误处理和恢复机制
- 历史记录保存和查询

### 用户测试
- 不同类型用户的自然语言输入
- 各种测试场景的执行效果
- 错误情况的用户体验
- 性能和响应速度

---

## 性能优化

### 关键性能指标
- 指令解析时间: < 2秒
- 浏览器操作延迟: < 500ms
- 实时预览帧率: > 10 FPS
- 页面加载时间: < 3秒

### 优化策略
1. **LLM 缓存**: 缓存常见指令的解析结果
2. **连接池**: 保持 Playwright 浏览器实例活跃
3. **截图压缩**: 使用 JPEG 格式，降低分辨率
4. **异步处理**: 并行执行多个独立步骤
5. **增量更新**: 只更新变化的页面区域

---

## 安全考虑

### 用户输入安全
- URL 白名单限制
- 禁止执行危险脚本（javascript:, data: 协议）
- 元素选择器格式验证

### 浏览器安全
- 使用无痕模式（Inognito）
- 禁止访问本地文件
- 限制浏览器权限

### 数据安全
- 用户敏感信息加密存储
- 定期清理历史记录
- 限制数据库访问权限

---

## 扩展性设计

### 未来可扩展功能
1. **更多 MCP 工具**: 文件操作、数据库操作、API 调用
2. **多人协作**: 支持多人同时查看和操作浏览器
3. **测试模板库**: 预定义常见测试场景
4. **智能优化**: 自动学习用户操作习惯
5. **云端部署**: 支持云端浏览器实例

### 扩展接口设计
- 插件化的 LLM 解析器（支持多种 LLM API）
- 插件化的 MCP 工具库
- 可配置的预览方式（实时/静态/无预览）
- 可扩展的存储后端（SQLite/MongoDB/云存储）

---

## 实施计划

### 开发阶段
1. **阶段一**: 核心架构搭建（MCP + LLM + Playwright）
2. **阶段二**: 用户界面开发（Web 界面 + 实时预览）
3. **阶段三**: 错误处理和优化
4. **阶段四**: 测试和文档完善

### 技术难点
1. **MCP 协议集成**: 需要深入理解 MCP SDK 和 Playwright MCP Server
2. **实时预览实现**: CDP Protocol 和 WebSocket 流需要细致处理
3. **LLM 解析质量**: 需要大量测试和优化提示词
4. **错误恢复机制**: 需要覆盖各种异常情况

---

## 总结

本设计文档详细描述了基于自然语言的浏览器自动化测试系统的架构、组件、数据流、错误处理和用户界面。系统采用 MCP + LLM 集成方案，职责清晰、易于扩展，能够满足用户对自然语言驱动、实时预览、历史记录的需求。

核心优势：
- 标准化的 MCP 协议，易于扩展
- 强大的 LLM 语义理解能力
- 实时的浏览器预览和交互
- 完善的错误处理和恢复机制
- 用户友好的赛博朋克风格界面

下一步：等待用户审查设计文档，确认后进入实施阶段。
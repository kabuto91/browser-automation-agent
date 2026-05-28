# Browser Automation Testing Agent

基于 Plan-and-Execute 模式的智能浏览器自动化测试 Agent，使用 Playwright 实现浏览器操作，集成大语言模型（LLM）进行智能决策，并引入 RAG（检索增强生成）技术从历史成功案例中学习。

## 📋 项目概述

本项目是一个智能化的浏览器自动化测试框架，采用 Plan-and-Execute 架构模式，能够根据自然语言描述的测试目标自动生成测试计划并执行。系统集成了大语言模型（支持千问、OpenAI、Anthropic 等），能够动态适应页面变化，实现智能化的测试流程。

### 核心特性

- ✅ **智能规划**：基于 LLM 自动生成测试步骤，支持静态和动态两种规划模式
- ✅ **动态执行**：实时获取页面状态，动态调整测试策略
- ✅ **可视化界面**：Next.js 驱动的现代化 Web 界面，实时监控测试过程
- ✅ **步骤复用**：支持保存和复用成功的测试步骤，提高测试效率
- ✅ **多模型支持**：支持千问、OpenAI、Anthropic 等多种 LLM 提供商
- ✅ **错误恢复**：智能的错误处理和重规划机制，自动恢复测试流程
- ✅ **RAG 学习**：从历史成功案例中学习，提高测试成功率
- ✅ **登录检测**：自动检测登录需求，暂停等待手动登录
- ✅ **Docker 支持**：完整的容器化部署方案，支持沙箱隔离
- ✅ **安全防护**：URL 白名单、危险协议拦截、网络隔离等安全机制

## 🏗️ 架构设计

### Plan-and-Execute 模式

```
┌─────────────┐
│   Planner   │ ──生成测试计划──> ┌─────────────┐
└─────────────┘                   │  Executor   │
                                  └─────────────┘
                                        │
                                        ▼
                                  ┌─────────────┐
                                  │  Observer   │ ──获取页面状态──┐
                                  └─────────────┘                 │
                                        │                         │
                                        ▼                         │
                                  ┌─────────────┐                 │
                                  │  Replanner  │ <───────────────┘
                                  └─────────────┘    (状态反馈)
                                        │
                                        ▼
                                  ┌─────────────┐
                                  │     RAG     │ ──历史案例学习──┐
                                  └─────────────┘                  │
                                        │                          │
                                        ▼                          │
                                  ┌─────────────┐                  │
                                  │ LoginDetector│ <───────────────┘
                                  └─────────────┘    (登录检测)
```

### 核心组件详解

#### 1. Planner（规划器）
- **文件位置**：[src/agent/planner.ts](file:///d:/frontProjects/agent/my-first-agent/src/agent/planner.ts), [src/agent/dynamicPlanner.ts](file:///d:/frontProjects/agent/my-first-agent/src/agent/dynamicPlanner.ts)
- **核心功能**：
  - 静态规划：一次性生成完整测试计划
  - 动态规划：实时根据页面状态生成下一步操作
  - 步骤优化：自动添加等待、截图等辅助步骤
- **技术实现**：
  - 使用 LLM 解析自然语言测试目标
  - 生成符合规范的 JSON 格式测试步骤
  - 支持最多 20 步的动态规划限制

#### 2. Executor（执行器）
- **文件位置**：[src/agent/executor.ts](file:///d:/frontProjects/agent/my-first-agent/src/agent/executor.ts), [src/agent/dynamicExecutor.ts](file:///d:/frontProjects/agent/my-first-agent/src/agent/dynamicExecutor.ts)
- **核心功能**：
  - 执行浏览器操作（点击、输入、导航等）
  - 页面状态稳定性检查
  - 断言验证和结果收集
  - 登录检测和暂停机制
- **技术实现**：
  - 集成 Playwright 浏览器自动化
  - 智能等待页面加载和网络空闲
  - 自动截图记录执行过程
  - 支持暂停/恢复执行流程

#### 3. Observer（观察器）
- **文件位置**：[src/agent/observer.ts](file:///d:/frontProjects/agent/my-first-agent/src/agent/observer.ts)
- **核心功能**：
  - 获取页面快照和状态
  - 提取交互元素信息
  - 元素定位和选择器生成
  - 页面变化监控
- **技术实现**：
  - 提取页面所有交互元素（按钮、链接、输入框等）
  - 生成元素详细信息（标签、文本、ID、类名、选择器等）
  - 支持缓存机制，避免重复提取
  - 提供页面状态的 JSON 格式输出

#### 4. Replanner（重规划器）
- **文件位置**：[src/agent/replanner.ts](file:///d:/frontProjects/agent/my-first-agent/src/agent/replanner.ts)
- **核心功能**：
  - 分析失败原因
  - 生成调整后的测试步骤
  - 决策是否继续执行
  - 历史案例匹配
- **技术实现**：
  - 使用 LLM 分析失败上下文
  - 从 RAG 系统检索相似成功案例
  - 支持跳过、重试、终止等决策
  - 最多支持 3 次重规划

#### 5. LoginDetector（登录检测器）
- **文件位置**：[src/agent/loginDetector.ts](file:///d:/frontProjects/agent/my-first-agent/src/agent/loginDetector.ts)
- **核心功能**：
  - 快速检测登录需求（关键词匹配）
  - LLM 精确判断登录状态
  - 自动暂停执行流程
  - 提供登录提示信息
- **技术实现**：
  - 两阶段检测：快速检测 + LLM 确认
  - 关键词库：登录、注册、验证码等
  - 置信度阈值判断
  - 支持手动登录后恢复执行

#### 6. RAG 系统（检索增强生成）
- **文件位置**：[src/rag/](file:///d:/frontProjects/agent/my-first-agent/src/rag/)
- **核心组件**：
  - `successCaseStorage.ts`：成功案例存储
  - `caseCollector.ts`：案例收集器
  - `hybridRetriever.ts`：混合检索器
- **核心功能**：
  - 保存历史成功测试案例
  - 根据失败上下文检索相似案例
  - 提供解决方案建议
  - 提高测试成功率
- **技术实现**：
  - IndexedDB 存储成功案例
  - 多维度索引（错误类型、时间、成功率等）
  - 相似度匹配算法
  - 案例使用统计和成功率追踪

#### 7. BrowserManager（浏览器管理器）
- **文件位置**：[src/browser/browserManager.ts](file:///d:/frontProjects/agent/my-first-agent/src/browser/browserManager.ts), [src/browser/globalBrowserManager.ts](file:///d:/frontProjects/agent/my-first-agent/src/browser/globalBrowserManager.ts)
- **核心功能**：
  - 浏览器实例管理
  - CDP（Chrome DevTools Protocol）连接
  - 页面生命周期管理
  - 资源清理和关闭
- **技术实现**：
  - 支持本地浏览器启动
  - 支持连接现有浏览器（通过 CDP）
  - 全局浏览器实例管理
  - 自动清理和资源释放

#### 8. LLMClient（大语言模型客户端）
- **文件位置**：[src/llm/llmClient.ts](file:///d:/frontProjects/agent/my-first-agent/src/llm/llmClient.ts)
- **核心功能**：
  - 多模型提供商支持（千问、OpenAI、Anthropic）
  - 请求队列管理
  - 缓存机制
  - 重试机制
- **技术实现**：
  - 统一的 OpenAI SDK 接口
  - 请求队列（最多 3 个并发）
  - 响应缓存（TTL 1小时，最多 100 条）
  - 自动重试（最多 3 次）

## 📁 项目结构

```
my-first-agent/
├── src/
│   ├── agent/              # Agent 核心逻辑
│   │   ├── planner.ts           # 静态规划器
│   │   ├── dynamicPlanner.ts    # 动态规划器
│   │   ├── executor.ts          # 静态执行器
│   │   ├── dynamicExecutor.ts   # 动态执行器（含登录检测）
│   │   ├── observer.ts          # 页面观察器
│   │   ├── replanner.ts         # 重规划器
│   │   └── loginDetector.ts     # 登录检测器
│   ├── app/                # Next.js 应用
│   │   ├── api/                 # API 路由
│   │   │   ├── plan/           # 规划 API
│   │   │   ├── execute/        # 执行 API（静态模式）
│   │   │   │   └── stream/     # 流式执行 API
│   │   │   ├── dynamic/        # 动态执行 API
│   │   │   │   └── stream/     # 流式动态执行 API
│   │   │   └── steps/          # 步骤管理 API
│   │   ├── components/         # React 组件
│   │   │   └── StepLibrary.tsx # 步骤库组件
│   │   ├── globals.css         # 全局样式
│   │   ├── layout.tsx          # 应用布局
│   │   └── page.tsx            # 主页面（测试界面）
│   ├── browser/            # 浏览器操作
│   │   ├── actions.ts          # 浏览器动作定义
│   │   ├── browserManager.ts   # 浏览器管理器
│   │   └── globalBrowserManager.ts # 全局浏览器管理器
│   ├── llm/                # LLM 集成
│   │   └── llmClient.ts        # LLM 客户端（多模型支持）
│   ├── rag/                # RAG 系统
│   │   ├── index.ts            # RAG 导出
│   │   ├── successCaseStorage.ts # 成功案例存储
│   │   ├── caseCollector.ts    # 案例收集器
│   │   └── hybridRetriever.ts  # 混合检索器
│   ├── report/             # 测试报告
│   │   └── reporter.ts         # 报告生成器
│   ├── storage/            # 数据存储
│   │   ├── indexedDBStorage.ts # IndexedDB 存储
│   │   └── stepStorage.ts      # 步骤存储
│   ├── types/              # 类型定义
│   │   └── index.ts            # TypeScript 类型定义
│   ├── utils/              # 工具函数
│   │   ├── validation.ts       # 验证工具
│   │   └── systemResourceMonitor.ts # 系统资源监控
│   ├── config.ts           # 配置文件
│   ├── example.ts          # 示例代码
│   └── index.ts            # 入口文件
├── scripts/                # 辅助脚本
│   ├── start-chrome-debug.bat  # Windows 启动 Chrome 调试
│   └── start-chrome-debug.ps1  # PowerShell 启动脚本
├── .trae/                  # Trae 配置
│   └── skills/             # 技能库
│       └── saved-test-steps/   # 保存的测试步骤技能
│           ├── SKILL.md        # 技能说明
│           └── steps.json      # 步骤数据
├── .env.example            # 环境变量示例
├── .gitignore              # Git 忽略文件
├── Dockerfile              # Docker 构建文件
├── docker-compose.yml      # Docker Compose 配置
├── seccomp-profile.json    # Docker 安全配置
├── package.json            # 项目配置
├── tsconfig.json           # TypeScript 配置
├── next.config.js          # Next.js 配置
├── next-env.d.ts           # Next.js 类型声明
├── README.md               # 项目说明文档
└── agent.md                # Agent 详细文档（本文件）
```

## 🚀 快速开始

### 1. 环境准备

```bash
# 克隆项目
git clone <repository-url>
cd my-first-agent

# 安装依赖
npm install

# 安装 Playwright 浏览器
npx playwright install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env` 并配置：

```env
# LLM Provider Configuration
# 选择提供商: "anthropic", "openai", 或 "qwen"
LLM_PROVIDER=qwen

# Qwen (DashScope) Configuration
DASHSCOPE_API_KEY=your_dashscope_api_key
DASHSCOPE_MODEL=qwen-plus

# OpenAI Configuration (可选)
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o

# Anthropic Configuration (可选)
ANTHROPIC_API_KEY=your_anthropic_api_key
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022

# Model Configuration
LLM_MAX_TOKENS=4096
LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1

# Browser Configuration
HEADLESS=false
BROWSER_TIMEOUT=30000

# Screenshot Configuration
SCREENSHOT_DIR=./screenshots
SCREENSHOT_ON_FAILURE=true
SCREENSHOT_ON_SUCCESS=false

# Report Configuration
REPORT_DIR=./reports
REPORT_FORMAT=html

# Security Configuration
URL_WHITELIST_ENABLED=false
BLOCK_DANGEROUS_PROTOCOLS=true
NETWORK_ISOLATION=false
```

### 3. 启动应用

```bash
# 开发模式
npm run dev

# 生产模式
npm run build
npm start

# 命令行模式
npm run agent
```

访问 `http://localhost:3000` 打开 Web 界面。

### 4. 连接现有浏览器（可选）

如果需要使用现有浏览器进行测试：

```bash
# Windows: 启动 Chrome 调试模式
scripts\start-chrome-debug.bat

# 或使用 PowerShell
scripts\start-chrome-debug.ps1
```

然后在 Web 界面中：
1. 勾选"使用现有浏览器"
2. 输入 CDP Endpoint：`http://localhost:9222`
3. 开始测试

## 💡 使用指南

### 测试目标示例

```
# 简单导航
打开 GitHub 首页

# 搜索操作
打开百度并搜索 Playwright 自动化测试

# 表单填写
打开登录页面，输入用户名 admin 和密码 123456

# 复杂流程
打开淘宝，搜索 iPhone，按价格排序，查看第一个商品详情
```

### 执行模式详解

#### 静态模式（Static）
**适用场景**：
- 测试流程固定且明确
- 页面结构稳定不变
- 需要完整的测试计划预览

**执行流程**：
1. 输入测试目标
2. LLM 生成完整测试计划
3. 用户可以预览和调整计划
4. 按计划顺序执行所有步骤
5. 生成测试报告

**特点**：
- 可预览完整计划
- 步骤顺序固定
- 适合回归测试

#### 动态模式（Dynamic）
**适用场景**：
- 页面变化较大
- 测试流程不确定
- 需要智能适应页面状态

**执行流程**：
1. 输入测试目标
2. 获取当前页面状态
3. LLM 实时生成下一步操作
4. 执行操作并观察结果
5. 根据结果继续生成下一步
6. 循环直到目标完成或失败

**特点**：
- 实时适应页面变化
- 智能决策下一步
- 支持登录检测和暂停
- 最多执行 20 步

### 步骤库功能

#### 保存单个步骤
1. 测试完成后，查看步骤详情
2. 找到成功的步骤
3. 点击"💾 保存"按钮
4. 输入步骤名称和标签
5. 确认保存到 IndexedDB

#### 保存整个流程
1. 测试完成后，点击"保存整个测试流程"按钮
2. 输入流程名称（如："百度搜索流程"）
3. 添加标签（如："search, baidu, e2e"）
4. 所有成功步骤将被保存为一个完整流程
5. 下次可直接加载使用

#### 使用保存的步骤
1. 点击页面上的"步骤库"标签
2. 浏览已保存的步骤和流程
3. 使用搜索功能快速查找
4. 点击"使用"按钮加载步骤
5. 点击"开始测试"执行

### 登录检测功能

当系统检测到需要登录时：
1. 自动暂停执行
2. 显示登录提示信息
3. 用户在浏览器中手动完成登录
4. 点击"继续测试"按钮
5. 系统恢复执行流程

**检测机制**：
- 快速检测：关键词匹配（登录、注册、验证码等）
- LLM 确认：精确判断页面状态
- 置信度阈值：> 0.6 则暂停

## 🔧 核心功能详解

### 1. 浏览器操作类型

| 操作类型 | 参数 | 说明 | 示例 |
|---------|------|------|------|
| navigate | url | 页面导航 | `{"type": "navigate", "url": "https://example.com"}` |
| click | selector | 点击元素 | `{"type": "click", "selector": "#submit-btn"}` |
| type | selector, text | 输入文本 | `{"type": "type", "selector": "#username", "text": "admin"}` |
| select | selector, value | 选择下拉选项 | `{"type": "select", "selector": "#country", "value": "CN"}` |
| hover | selector | 鼠标悬停 | `{"type": "hover", "selector": "#menu"}` |
| scroll | selector?, x?, y? | 滚动页面 | `{"type": "scroll", "y": 500}` |
| wait | selector?, ms? | 等待元素或时间 | `{"type": "wait", "selector": "#result"}` |
| screenshot | name | 截图 | `{"type": "screenshot", "name": "step1"}` |
| press | key, selector? | 按键操作 | `{"type": "press", "key": "Enter"}` |
| evaluate | script | 执行 JavaScript | `{"type": "evaluate", "script": "window.scrollTo(0, 1000)"}` |

### 2. 断言类型

| 断言类型 | 参数 | 说明 | 示例 |
|---------|------|------|------|
| visible | selector | 元素可见 | `{"type": "visible", "selector": "#result"}` |
| hidden | selector | 元素隐藏 | `{"type": "hidden", "selector": "#loading"}` |
| text | selector, expected | 文本内容匹配 | `{"type": "text", "selector": "#title", "expected": "Success"}` |
| url | expected | URL 匹配 | `{"type": "url", "expected": "/dashboard"}` |
| title | expected | 页面标题匹配 | `{"type": "title", "expected": "Dashboard"}` |
| count | selector, expected | 元素数量匹配 | `{"type": "count", "selector": ".item", "expected": 5}` |
| value | selector, expected | 输入值匹配 | `{"type": "value", "selector": "#input", "expected": "test"}` |

### 3. 页面观察功能

**提取的元素信息**：
- 标签类型（tag）
- 文本内容（text）
- ID 属性（id）
- 类名（className）
- 可见性（visible）
- 类型属性（type）
- 名称属性（name）
- 占位符（placeholder）
- 链接地址（href）
- 测试 ID（dataTestId）
- ARIA 标签（ariaLabel）
- 标题（title）
- 值（value）
- CSS 选择器（selector）
- 边界框（boundingBox）

**页面快照包含**：
- 当前 URL
- 页面标题
- 所有交互元素
- 表单信息
- 链接列表
- 按钮列表
- 输入框列表

### 4. 智能等待机制

**页面稳定性检查**：
1. 导航/点击操作后：
   - 等待 `load` 事件（最多 10秒）
   - 等待 `networkidle` 状态（最多 8秒）
   - 固定等待 1秒
   - 再次等待 `networkidle`（最多 5秒）

2. 其他操作后：
   - 等待 `domcontentloaded`（最多 3秒）
   - 等待 `networkidle`（最多 2秒）

### 5. 错误处理机制

**失败处理流程**：
1. 自动截图记录错误现场
2. 获取当前页面状态
3. Replanner 分析失败原因
4. 从 RAG 系统检索相似成功案例
5. 决策：跳过、重试、调整步骤、终止
6. 最多支持 3 次重规划

**错误类型**：
- 元素定位失败
- 断言验证失败
- 页面加载超时
- 网络请求失败
- JavaScript 执行错误

### 6. RAG 学习机制

**成功案例存储**：
- 失败上下文：目标、失败步骤、原因、页面状态、错误类型
- 成功方案：重试步骤、成功操作、恢复策略、总耗时
- 元数据：创建时间、使用次数、成功率、标签

**检索机制**：
- 根据错误类型匹配
- 根据页面状态相似度匹配
- 根据失败原因匹配
- 返回最相似的成功案例

**应用场景**：
- Replanner 重规划时参考
- 提高测试成功率
- 减少重复失败
- 智能恢复策略

## 📊 API 接口文档

### POST /api/plan
生成测试计划（静态模式）

**请求体**：
```json
{
  "goal": "打开百度并搜索 Playwright"
}
```

**响应**：
```json
{
  "id": "plan-xxx",
  "goal": "打开百度并搜索 Playwright",
  "steps": [
    {
      "id": "step-1",
      "description": "打开百度首页",
      "action": {"type": "navigate", "url": "https://www.baidu.com"},
      "expectedResult": "百度首页加载完成",
      "assertions": [{"type": "url", "expected": "baidu.com"}]
    },
    ...
  ],
  "createdAt": 1234567890
}
```

### POST /api/execute/stream
流式执行测试计划（静态模式）

**请求体**：
```json
{
  "planId": "plan-xxx",
  "headless": false,
  "cdpEndpoint": "http://localhost:9222",
  "useExistingBrowser": false
}
```

**响应（Server-Sent Events）**：
```
data: {"type": "start", "sessionId": "xxx", "totalSteps": 5}
data: {"type": "step_start", "stepIndex": 0, "stepDescription": "打开百度首页"}
data: {"type": "step_complete", "stepIndex": 0, "status": "passed", "duration": 1234}
data: {"type": "complete", "report": {...}}
```

### POST /api/dynamic/stream
流式动态执行测试

**请求体**：
```json
{
  "goal": "打开百度并搜索 Playwright",
  "headless": false,
  "cdpEndpoint": "http://localhost:9222",
  "useExistingBrowser": false,
  "predefinedSteps": [] // 可选：预定义步骤
}
```

**响应（Server-Sent Events）**：
```
data: {"type": "start", "sessionId": "xxx"}
data: {"type": "step_start", "stepIndex": 0, "stepDescription": "导航到百度"}
data: {"type": "step_complete", "stepIndex": 0, "status": "passed", "duration": 1234}
data: {"type": "login_required", "loginReason": "检测到登录页面"}
data: {"type": "complete", "report": {...}}
```

### GET /api/steps
获取步骤库列表

**响应**：
```json
{
  "steps": [
    {
      "id": "step-xxx",
      "name": "百度搜索",
      "description": "在百度搜索指定内容",
      "steps": [...],
      "tags": ["search", "baidu"],
      "createdAt": 1234567890
    },
    ...
  ]
}
```

### POST /api/steps
保存步骤到步骤库

**请求体**：
```json
{
  "action": "save",
  "step": {
    "name": "百度搜索流程",
    "description": "完整的百度搜索流程",
    "steps": [...],
    "tags": ["search", "baidu", "e2e"]
  }
}
```

**响应**：
```json
{
  "success": true,
  "id": "step-xxx"
}
```

## 🔍 高级特性

### 1. 连接现有浏览器

**优势**：
- 使用已登录的浏览器会话
- 避免重复登录操作
- 保持 cookies 和 session
- 调试更方便

**使用方法**：
1. 启动 Chrome 调试模式：
   ```bash
   # Windows
   scripts\start-chrome-debug.bat
   
   # 或手动启动
   chrome.exe --remote-debugging-port=9222 --user-data-dir="C:\chrome-debug-profile"
   ```

2. 在 Web 界面配置：
   - 勾选"使用现有浏览器"
   - 输入 CDP Endpoint：`http://localhost:9222`

3. 开始测试

### 2. Docker 容器化部署

**构建镜像**：
```bash
docker build -t browser-automation-agent .
```

**运行容器**：
```bash
docker run -d \
  -p 3000:3000 \
  -e LLM_PROVIDER=qwen \
  -e DASHSCOPE_API_KEY=your_key \
  --security-opt seccomp=seccomp-profile.json \
  browser-automation-agent
```

**使用 Docker Compose**：
```bash
docker-compose up -d
```

**安全配置**：
- 使用非 root 用户运行
- 启用 seccomp 安全策略
- 禁止危险协议
- 网络隔离选项

### 3. 安全防护机制

**URL 白名单**：
```env
URL_WHITELIST_ENABLED=true
URL_WHITELIST=example.com,test.example.com
```

**危险协议拦截**：
- 自动拦截：`javascript:`, `data:`, `vbscript:`, `file:`
- 防止 XSS 和本地文件访问

**网络隔离**：
```env
NETWORK_ISOLATION=true
```

**代理配置**：
```env
PROXY_SERVER=http://proxy.example.com:8080
PROXY_BYPASS_LIST=localhost,127.0.0.1
```

### 4. 性能优化建议

**使用 Headless 模式**：
```env
HEADLESS=true
```

**调整超时时间**：
```env
BROWSER_TIMEOUT=15000
```

**减少截图**：
```env
SCREENSHOT_ON_SUCCESS=false
SCREENSHOT_ON_FAILURE=true
```

**使用更快的模型**：
```env
LLM_MODEL=qwen-turbo
```

**批量执行**：
- 使用预定义步骤
- 复用已保存的测试流程

## 🐛 常见问题与解决方案

### 1. API Key 配置问题

**问题**：`DASHSCOPE_API_KEY` 显示为 `undefined`

**原因**：
- `.env` 文件不存在或未配置
- 环境变量加载失败

**解决方案**：
```bash
# 1. 确保 .env 文件存在
cp .env.example .env

# 2. 编辑 .env 文件，填入正确的 API Key
# DASHSCOPE_API_KEY=sk-xxxxx

# 3. 重启开发服务器
npm run dev
```

### 2. 浏览器启动失败

**问题**：`Error: Executable doesn't exist`

**原因**：Playwright 浏览器未安装

**解决方案**：
```bash
# 安装 Chromium 浏览器
npx playwright install chromium

# 或安装所有浏览器
npx playwright install
```

### 3. 元素定位失败

**问题**：`Error: locator.waitFor: Timeout exceeded`

**原因**：
- 选择器不正确
- 元素未加载完成
- 页面结构变化

**解决方案**：
1. 使用动态模式，让 LLM 自动适应
2. 增加等待时间：
   ```json
   {"type": "wait", "ms": 3000}
   ```
3. 使用更稳定的选择器：
   - 优先使用 `data-testid`
   - 使用 ID 或唯一属性
   - 避免使用易变的类名

### 4. 登录检测误判

**问题**：正常页面被误判为需要登录

**原因**：
- 页面包含登录相关关键词
- 置信度阈值设置不当

**解决方案**：
- 系统会使用 LLM 进行二次确认
- 如果确认不需要登录，会继续执行
- 可以手动点击"继续测试"恢复

### 5. LLM 响应超时

**问题**：请求长时间无响应

**原因**：
- 网络连接问题
- API 服务繁忙
- 模型响应慢

**解决方案**：
1. 检查网络连接
2. 使用更快的模型：
   ```env
   LLM_MODEL=qwen-turbo
   ```
3. 系统会自动重试最多 3 次

### 6. Docker 容器权限问题

**问题**：容器内无法启动浏览器

**原因**：缺少必要的系统依赖

**解决方案**：
```bash
# 使用完整的 Dockerfile（已包含所有依赖）
docker build -t browser-automation-agent .

# 或手动安装依赖
docker run -it browser-automation-agent bash
apt-get update && apt-get install -y chromium
```

## 🔐 安全最佳实践

### 1. API Key 管理

- ❌ 不要将 `.env` 文件提交到版本控制
- ✅ 使用 `.env.example` 作为模板
- ✅ 定期更换 API Key
- ✅ 使用环境变量或密钥管理服务

### 2. 浏览器安全

- ✅ 启用危险协议拦截
- ✅ 配置 URL 白名单
- ✅ 使用网络隔离
- ✅ 定期清理浏览器数据

### 3. 数据安全

- ✅ 测试数据不要包含敏感信息
- ✅ 截图和报告定期清理
- ✅ 使用 HTTPS 连接
- ✅ 限制文件访问权限

### 4. 生产环境部署

- ✅ 使用 Docker 容器化
- ✅ 启用 seccomp 安全策略
- ✅ 使用非 root 用户
- ✅ 配置资源限制

## 📈 性能监控

### 系统资源监控

**监控指标**：
- CPU 使用率
- 内存使用量
- 浏览器进程数
- 网络请求统计

**实现位置**：[src/utils/systemResourceMonitor.ts](file:///d:/frontProjects/agent/my-first-agent/src/utils/systemResourceMonitor.ts)

### 测试性能指标

**关键指标**：
- 总执行时间
- 步骤平均耗时
- 成功/失败率
- 重规划次数
- LLM 响应时间

**查看方式**：
- Web 界面的测试报告
- 控制台日志输出
- 生成的 HTML 报告

## 🤝 开发指南

### 代码规范

- 使用 TypeScript 严格模式
- 遵循 ESLint 规则
- 函数添加类型注释
- 保持代码简洁清晰

### 添加新功能

1. 在 `src/types/index.ts` 中定义类型
2. 实现核心逻辑
3. 创建 API 路由（如需要）
4. 更新 Web 界面（如需要）
5. 编写测试和文档

### 调试技巧

**查看详细日志**：
```bash
# 启动开发服务器，查看控制台输出
npm run dev
```

**查看页面状态**：
- 在 Web 界面点击"View Page State"
- 查看每个步骤的详细页面信息

**分析截图**：
- 查看 `./screenshots` 目录
- 每个步骤都有对应的截图

**使用 Chrome DevTools**：
- 连接现有浏览器
- 使用 DevTools 调试

### 测试建议

**单元测试**：
- 测试核心组件功能
- 测试 LLM 响应解析
- 测试断言验证逻辑

**集成测试**：
- 测试完整执行流程
- 测试错误恢复机制
- 测试登录检测功能

**端到端测试**：
- 使用本系统测试自己
- 测试各种复杂场景
- 验证用户界面功能

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](file:///d:/frontProjects/agent/my-first-agent/LICENSE) 文件了解详情

## 🙏 致谢

- [Playwright](https://playwright.dev/) - 强大的浏览器自动化框架
- [Next.js](https://nextjs.org/) - 现代化的 React 框架
- [OpenAI](https://openai.com/) - GPT 系列大语言模型
- [千问](https://tongyi.aliyun.com/) - 阿里云通义千问大语言模型
- [Anthropic](https://www.anthropic.com/) - Claude 系列大语言模型

## 📞 支持与反馈

如有问题、建议或功能需求，请：
- 提交 GitHub Issue
- 发送 Pull Request
- 查看项目文档

---

**重要提示**：
- 本项目仅供学习和研究使用
- 请遵守目标网站的使用条款
- 不要用于非法用途或恶意测试
- 注意保护个人隐私和数据安全
# Browser Automation Testing Agent

基于 Plan-and-Execute 模式的智能浏览器自动化测试 Agent，使用 Playwright 实现浏览器操作，集成大语言模型（LLM）进行智能决策。

## 📋 项目概述

本项目是一个智能化的浏览器自动化测试框架，采用 Plan-and-Execute 架构模式，能够根据自然语言描述的测试目标自动生成测试计划并执行。系统集成了大语言模型（支持千问、OpenAI、Anthropic 等），能够动态适应页面变化，实现智能化的测试流程。

### 核心特性

- ✅ **智能规划**：基于 LLM 自动生成测试步骤
- ✅ **动态执行**：实时获取页面状态，动态调整测试策略
- ✅ **可视化界面**：Next.js 驱动的现代化 Web 界面
- ✅ **步骤复用**：支持保存和复用成功的测试步骤
- ✅ **多模型支持**：支持千问、OpenAI、Anthropic 等多种 LLM
- ✅ **错误恢复**：智能的错误处理和重规划机制

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
```

### 核心组件

#### 1. **Planner（规划器）**
- 文件：`src/agent/planner.ts`, `src/agent/dynamicPlanner.ts`
- 功能：根据测试目标生成测试步骤
- 特点：支持静态规划和动态规划两种模式

#### 2. **Executor（执行器）**
- 文件：`src/agent/executor.ts`, `src/agent/dynamicExecutor.ts`
- 功能：执行测试步骤，与浏览器交互
- 特点：支持点击、导航、输入等多种操作

#### 3. **Observer（观察器）**
- 文件：`src/agent/observer.ts`
- 功能：获取页面状态和元素信息
- 特点：提供页面快照、元素定位等功能

#### 4. **Replanner（重规划器）**
- 文件：`src/agent/replanner.ts`
- 功能：根据执行结果调整测试计划
- 特点：智能错误恢复和策略调整

## 📁 项目结构

```
my-first-agent/
├── src/
│   ├── agent/              # Agent 核心逻辑
│   │   ├── planner.ts           # 静态规划器
│   │   ├── dynamicPlanner.ts    # 动态规划器
│   │   ├── executor.ts          # 静态执行器
│   │   ├── dynamicExecutor.ts   # 动态执行器
│   │   ├── observer.ts          # 页面观察器
│   │   └── replanner.ts         # 重规划器
│   ├── app/                # Next.js 应用
│   │   ├── api/                 # API 路由
│   │   │   ├── plan/           # 规划 API
│   │   │   ├── execute/        # 执行 API
│   │   │   ├── dynamic/        # 动态执行 API
│   │   │   └── steps/          # 步骤管理 API
│   │   ├── components/         # React 组件
│   │   │   └── StepLibrary.tsx # 步骤库组件
│   │   ├── page.tsx           # 主页面
│   │   └── layout.tsx         # 布局
│   ├── browser/            # 浏览器操作
│   │   ├── actions.ts          # 浏览器动作
│   │   └── browserManager.ts   # 浏览器管理
│   ├── llm/                # LLM 集成
│   │   └── llmClient.ts        # LLM 客户端
│   ├── report/             # 测试报告
│   │   └── reporter.ts         # 报告生成器
│   ├── storage/            # 数据存储
│   │   └── stepStorage.ts      # 步骤存储
│   ├── types/              # 类型定义
│   │   └── index.ts            # TypeScript 类型
│   ├── config.ts           # 配置文件
│   └── index.ts            # 入口文件
├── .trae/                  # Trae 配置
│   └── skills/             # 技能库
│       └── saved-test-steps/   # 保存的测试步骤
├── .env.example            # 环境变量示例
├── package.json            # 项目配置
└── tsconfig.json           # TypeScript 配置
```

## 🚀 快速开始

### 1. 环境准备

```bash
# 安装依赖
npm install

# 安装 Playwright 浏览器
npx playwright install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env` 并配置：

```env
# LLM Provider Configuration
LLM_PROVIDER=qwen

# Qwen (DashScope) Configuration
DASHSCOPE_API_KEY=your_dashscope_api_key
DASHSCOPE_MODEL=qwen-plus

# OpenAI Configuration (可选)
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4

# Anthropic Configuration (可选)
ANTHROPIC_API_KEY=your_anthropic_api_key
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022

# Browser Configuration
HEADLESS=false
```

### 3. 启动应用

```bash
# 开发模式
npm run dev

# 生产模式
npm run build
npm start
```

访问 `http://localhost:3000` 打开 Web 界面。

### 4. 运行测试

#### 方式一：Web 界面
1. 在输入框中输入测试目标（例如："打开百度并搜索 Playwright"）
2. 选择执行模式（动态/静态）
3. 点击"开始测试"按钮

#### 方式二：命令行
```bash
npm run agent
```

## 💡 使用指南

### 测试目标示例

```
# 简单导航
打开 GitHub 首页

# 搜索操作
打开百度并搜索 Playwright 自动化测试

# 表单填写
打开登录页面，输入用户名和密码

# 复杂流程
打开电商网站，搜索商品，添加到购物车，查看购物车
```

### 执行模式

#### 静态模式（Static）
- 先生成完整测试计划
- 按计划顺序执行
- 适用于流程固定的测试

#### 动态模式（Dynamic）
- 实时获取页面状态
- 动态生成下一步操作
- 适用于页面变化较大的测试

### 步骤库功能

#### 保存单个步骤
1. 测试完成后，查看步骤详情
2. 点击成功步骤旁边的"💾 保存"按钮
3. 输入步骤名称和标签
4. 确认保存

#### 保存整个流程
1. 测试完成后，点击"保存整个测试流程"按钮
2. 输入流程名称和标签
3. 确认保存

#### 使用保存的步骤
1. 点击"步骤库"标签
2. 浏览或搜索已保存的步骤
3. 点击"使用"按钮加载步骤

## 🔧 核心功能

### 1. 浏览器操作

支持的操作类型：
- **navigate**: 页面导航
- **click**: 点击元素
- **type**: 输入文本
- **select**: 选择下拉选项
- **hover**: 鼠标悬停
- **scroll**: 滚动页面
- **wait**: 等待元素或时间
- **screenshot**: 截图
- **press**: 按键操作
- **evaluate**: 执行 JavaScript

### 2. 页面观察

- 获取页面快照
- 提取交互元素
- 获取页面状态
- 元素定位和验证

### 3. 智能决策

- 基于 LLM 的步骤生成
- 动态页面适应
- 错误恢复机制
- 测试结果验证

### 4. 测试报告

- 步骤执行详情
- 截图记录
- 错误信息
- 执行时间统计

## 🎯 高级特性

### 1. 动态元素获取

在导航和点击操作后，系统会：
1. 等待页面完全加载
2. 等待网络空闲
3. 重新获取页面元素
4. 基于最新状态继续执行

### 2. 错误处理

- 自动截图记录错误
- 智能判断是否继续执行
- 提供详细的错误信息
- 支持重试机制

### 3. 步骤复用

- 保存成功的测试步骤
- 支持标签分类
- 快速搜索和加载
- 变量提取和参数化

## 📊 API 接口

### POST /api/plan
生成测试计划

```json
{
  "goal": "打开百度并搜索 Playwright"
}
```

### POST /api/execute
执行测试计划

```json
{
  "planId": "plan-xxx",
  "headless": false
}
```

### POST /api/dynamic
动态执行测试

```json
{
  "goal": "打开百度并搜索 Playwright",
  "headless": false
}
```

### GET /api/steps
获取步骤库

### POST /api/steps
保存步骤

```json
{
  "action": "save",
  "step": {
    "name": "百度搜索",
    "description": "在百度搜索指定内容",
    "steps": [...],
    "tags": ["search", "baidu"]
  }
}
```

## 🔍 调试技巧

### 1. 查看执行日志
在 Web 界面的"执行日志"区域查看实时日志

### 2. 检查页面状态
点击"View Page State"查看每个步骤的页面状态

### 3. 分析截图
查看成功和失败步骤的截图

### 4. 控制台日志
```bash
# 启动时查看详细日志
npm run dev
```

## 🐛 常见问题

### 1. API Key 未配置
**问题**：`DASHSCOPE_API_KEY` 打印为 `undefined`

**解决**：
- 确保 `.env` 文件存在
- 检查 API Key 是否正确配置
- 重启开发服务器

### 2. 浏览器启动失败
**问题**：Playwright 浏览器未安装

**解决**：
```bash
npx playwright install
```

### 3. 步骤执行失败
**问题**：元素定位失败

**解决**：
- 检查选择器是否正确
- 增加等待时间
- 使用动态模式

### 4. LLM 响应慢
**问题**：模型响应时间过长

**解决**：
- 使用更快的模型（如 qwen-turbo）
- 检查网络连接
- 优化提示词

## 📈 性能优化

### 1. 使用 Headless 模式
```env
HEADLESS=true
```

### 2. 减少等待时间
调整 `waitForPageStability` 的超时时间

### 3. 批量操作
合并多个操作为一个步骤

### 4. 缓存机制
复用已保存的测试步骤

## 🔐 安全建议

1. **不要提交 `.env` 文件**到版本控制
2. **定期更换 API Key**
3. **限制浏览器权限**
4. **验证输入数据**

## 🤝 贡献指南

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

## 🙏 致谢

- [Playwright](https://playwright.dev/) - 浏览器自动化框架
- [Next.js](https://nextjs.org/) - React 框架
- [OpenAI](https://openai.com/) - LLM API
- [千问](https://tongyi.aliyun.com/) - 阿里云大语言模型

## 📞 联系方式

如有问题或建议，请提交 Issue 或 Pull Request。

---

**注意**：本项目仅供学习和研究使用，请遵守相关网站的使用条款和法律法规。

# Browser Automation Testing Agent

<div align="center">

**基于 LLM 的智能浏览器自动化测试框架**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14.2-black)](https://nextjs.org/)
[![Playwright](https://img.shields.io/badge/Playwright-1.48-green)](https://playwright.dev/)

[快速开始](#-快速开始) • [功能特性](#-功能特性) • [使用指南](#-使用指南) • [API文档](#-api-文档)

</div>

---

## 📖 简介

Browser Automation Testing Agent 是一个智能化的浏览器自动化测试框架，采用 **Plan-and-Execute** 架构模式，集成大语言模型（LLM）实现自然语言驱动的测试自动化。

只需用自然语言描述测试目标，Agent 就能自动生成测试计划并执行，无需编写复杂的测试脚本。

### ✨ 核心亮点

- 🤖 **自然语言驱动** - 用中文/英文描述测试目标即可
- 🧠 **智能决策** - 基于 LLM 动态生成和调整测试步骤
- 🔄 **自适应执行** - 实时获取页面状态，智能应对页面变化
- 💾 **步骤复用** - 保存成功的测试流程，一键复用
- 🎨 **可视化界面** - 现代化 Web UI，实时监控测试过程
- 🔌 **多模型支持** - 支持千问、OpenAI、Claude 等多种 LLM

## 🚀 快速开始

### 前置要求

- Node.js 18+ 
- npm 或 yarn
- LLM API Key（千问/OpenAI/Claude）

### 安装步骤

```bash
# 1. 克隆项目
git clone <repository-url>
cd my-first-agent

# 2. 安装依赖
npm install

# 3. 安装浏览器
npx playwright install

# 4. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填入你的 API Key

# 5. 启动应用
npm run dev
```

访问 http://localhost:3000 开始使用！

### 环境变量配置

```env
# 必需：选择 LLM 提供商
LLM_PROVIDER=qwen

# 必需：千问 API Key
DASHSCOPE_API_KEY=your_api_key_here
DASHSCOPE_MODEL=qwen-plus

# 可选：OpenAI
# OPENAI_API_KEY=your_openai_key
# OPENAI_MODEL=gpt-4

# 可选：Anthropic
# ANTHROPIC_API_KEY=your_anthropic_key
# ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
```

## 🎯 功能特性

### 1. 智能测试规划

```
输入: "打开百度搜索 Playwright 自动化测试"
输出: 自动生成导航→输入→搜索的完整测试流程
```

### 2. 动态执行模式

- **静态模式**：先生成完整计划，再按计划执行
- **动态模式**：实时获取页面状态，智能生成下一步操作

### 3. 丰富的浏览器操作

| 操作类型 | 说明 | 示例 |
|---------|------|------|
| navigate | 页面导航 | 打开网页 |
| click | 点击元素 | 点击按钮 |
| type | 输入文本 | 填写表单 |
| select | 选择选项 | 下拉菜单 |
| hover | 鼠标悬停 | 触发菜单 |
| scroll | 滚动页面 | 滚动到底部 |
| wait | 等待 | 等待元素加载 |
| screenshot | 截图 | 记录页面状态 |

### 4. 步骤库管理

- ✅ 保存单个测试步骤
- ✅ 保存完整测试流程
- ✅ 标签分类管理
- ✅ 快速搜索加载
- ✅ 一键复用执行

### 5. 智能错误处理

- 自动截图记录错误现场
- 智能判断是否继续执行
- 提供详细的错误诊断信息
- 支持自动重试机制

## 📖 使用指南

### 基本使用流程

1. **输入测试目标**
   ```
   例如：打开 GitHub 首页并搜索 "playwright"
   ```

2. **选择执行模式**
   - 动态模式：适合页面变化较大的场景
   - 静态模式：适合流程固定的场景

3. **开始测试**
   - 点击"开始测试"按钮
   - 实时查看执行日志
   - 查看步骤详情和截图

4. **保存测试流程**
   - 点击"保存整个测试流程"
   - 输入名称和标签
   - 下次可直接复用

### 测试目标示例

```javascript
// 简单导航
"打开 GitHub 首页"

// 搜索操作
"打开百度并搜索 Playwright"

// 表单填写
"打开登录页面，输入用户名 admin 和密码 123456"

// 复杂流程
"打开淘宝，搜索 iPhone，按价格排序，查看第一个商品"
```

### 高级功能

#### 保存单个步骤
```typescript
// 1. 测试完成后，找到成功的步骤
// 2. 点击"💾 保存"按钮
// 3. 输入步骤名称和标签
// 4. 确认保存到步骤库
```

#### 保存整个流程
```typescript
// 1. 测试完成后，点击"保存整个测试流程"
// 2. 输入流程名称
// 3. 添加标签（如：e2e, smoke-test）
// 4. 所有成功步骤将被保存为一个完整流程
```

## 🏗️ 项目架构

```
Plan-and-Execute 模式
┌─────────────┐
│   Planner   │ ──生成计划──> ┌─────────────┐
└─────────────┘               │  Executor   │
                              └─────────────┘
                                    │
                                    ▼
                              ┌─────────────┐
                              │  Observer   │ ──页面状态──┐
                              └─────────────┘             │
                                    │                     │
                                    ▼                     │
                              ┌─────────────┐             │
                              │  Replanner  │ <───────────┘
                              └─────────────┘
```

### 核心模块

- **Planner**: 智能规划器，生成测试步骤
- **Executor**: 执行器，控制浏览器操作
- **Observer**: 观察器，获取页面状态
- **Replanner**: 重规划器，动态调整策略

详细架构说明请查看 [agent.md](./agent.md)

## 🔌 API 文档

### POST /api/dynamic
动态执行测试

**请求体：**
```json
{
  "goal": "打开百度并搜索 Playwright",
  "headless": false
}
```

**响应：**
```json
{
  "success": true,
  "totalSteps": 3,
  "passedSteps": 3,
  "failedSteps": 0,
  "duration": 5234,
  "stepResults": [...]
}
```

### POST /api/plan
生成测试计划

### POST /api/execute
执行测试计划

### GET /api/steps
获取步骤库

### POST /api/steps
保存测试步骤

完整 API 文档请查看 [agent.md](./agent.md#-api-接口)

## 🛠️ 开发指南

### 项目结构

```
src/
├── agent/          # Agent 核心逻辑
├── app/            # Next.js 应用
├── browser/        # 浏览器操作
├── llm/            # LLM 集成
├── report/         # 测试报告
├── storage/        # 数据存储
└── types/          # 类型定义
```

### 开发命令

```bash
# 开发模式
npm run dev

# 构建生产版本
npm run build

# 启动生产服务
npm start

# 代码检查
npm run lint

# 命令行运行
npm run agent
```

### 扩展开发

#### 添加新的浏览器操作

1. 在 `src/types/index.ts` 中定义操作类型
2. 在 `src/browser/actions.ts` 中实现操作逻辑
3. 在 LLM prompt 中添加操作说明

#### 集成新的 LLM

1. 在 `src/llm/llmClient.ts` 中添加提供商配置
2. 实现对应的 API 调用逻辑
3. 更新环境变量配置

## 🐛 常见问题

<details>
<summary><b>API Key 配置问题</b></summary>

**问题**：`DASHSCOPE_API_KEY` 为 `undefined`

**解决方案**：
1. 确保 `.env` 文件存在
2. 检查 API Key 是否正确
3. 重启开发服务器

</details>

<details>
<summary><b>浏览器启动失败</b></summary>

**问题**：Playwright 浏览器未安装

**解决方案**：
```bash
npx playwright install
```

</details>

<details>
<summary><b>元素定位失败</b></summary>

**问题**：找不到页面元素

**解决方案**：
1. 使用动态执行模式
2. 增加等待时间
3. 检查选择器是否正确

</details>

<details>
<summary><b>LLM 响应慢</b></summary>

**问题**：模型响应时间过长

**解决方案**：
1. 使用更快的模型（qwen-turbo）
2. 检查网络连接
3. 优化提示词

</details>

更多问题请查看 [agent.md](./agent.md#-常见问题) 或提交 Issue

## 📊 性能优化

- ✅ 使用 Headless 模式提升速度
- ✅ 调整等待时间优化性能
- ✅ 复用已保存的测试步骤
- ✅ 批量执行测试用例

## 🤝 贡献指南

我们欢迎所有形式的贡献！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

### 贡献类型

- 🐛 Bug 修复
- ✨ 新功能开发
- 📝 文档改进
- 🎨 UI/UX 优化
- ⚡ 性能优化

## 📄 许可证

本项目采用 [MIT](LICENSE) 许可证

## 🙏 致谢

感谢以下开源项目：

- [Playwright](https://playwright.dev/) - 强大的浏览器自动化框架
- [Next.js](https://nextjs.org/) - React 应用框架
- [OpenAI](https://openai.com/) - GPT 系列模型
- [千问](https://tongyi.aliyun.com/) - 阿里云大语言模型

## 📞 联系方式

- 📧 Email: [your-email]
- 💬 Issue: [GitHub Issues](your-repo/issues)
- 📖 文档: [agent.md](./agent.md)

---

<div align="center">

**如果这个项目对你有帮助，请给一个 ⭐️ Star！**

Made with ❤️ by Browser Automation Team

</div>

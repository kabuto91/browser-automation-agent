# Browser Automation Testing Agent

<div align="center">

**基于 LLM 的智能浏览器自动化测试框架**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14.2-black)](https://nextjs.org/)
[![Playwright](https://img.shields.io/badge/Playwright-1.48-green)](https://playwright.dev/)

[快速开始](#-快速开始) • [功能特性](#-功能特性) • [使用指南](#-使用指南) • [API文档](#-api文档)

</div>

---

## 📖 简介

Browser Automation Testing Agent 是一个智能化的浏览器自动化测试框架，采用 **Plan-and-Execute** 架构模式，集成大语言模型（LLM）实现自然语言驱动的测试自动化。

只需用自然语言描述测试目标，Agent 就能自动生成测试计划并执行，无需编写复杂的测试脚本。

### ✨ 核心亮点

- 🤖 **自然语言驱动** - 用中文/英文描述测试目标即可，无需编写代码
- 🧠 **智能决策** - 基于 LLM 动态生成和调整测试步骤，适应页面变化
- 🔄 **自适应执行** - 实时获取页面状态，智能应对各种异常情况
- 💾 **步骤复用** - 保存成功的测试流程，一键复用，提高效率
- 🎨 **可视化界面** - 现代化 Web UI，实时监控测试过程和结果
- 🔌 **多模型支持** - 支持千问、OpenAI、Claude 等多种 LLM 提供商
- 🛡️ **安全防护** - URL 白名单、危险协议拦截、网络隔离等安全机制
- 🐳 **容器化部署** - 完整的 Docker 支持，支持沙箱隔离环境

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
# OPENAI_MODEL=gpt-4o

# 可选：Anthropic
# ANTHROPIC_API_KEY=your_anthropic_key
# ANTHROPIC_MODEL=claude-3-5-sonnet-20241022

# 浏览器配置
HEADLESS=false
BROWSER_TIMEOUT=30000
```

## 🎯 功能特性

### 1. 智能测试规划

```
输入: "打开百度搜索 Playwright 自动化测试"
输出: 自动生成导航→输入→搜索的完整测试流程
```

**两种执行模式**：
- **静态模式**：一次性生成完整测试计划，适合流程固定的测试
- **动态模式**：实时根据页面状态生成下一步操作，适合页面变化较大的测试

### 2. 丰富的浏览器操作

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
| press | 按键 | 按下 Enter |
| evaluate | 执行 JS | 自定义脚本 |

### 3. 步骤库管理

- ✅ 保存单个测试步骤
- ✅ 保存完整测试流程
- ✅ 标签分类管理
- ✅ 快速搜索加载
- ✅ 一键复用执行

### 4. 智能错误处理

- 自动截图记录错误现场
- 智能判断是否继续执行
- 提供详细的错误诊断信息
- 支持自动重试机制（最多 3 次）
- 从历史成功案例中学习（RAG）

### 5. 登录检测功能

- 自动检测登录需求
- 暂停等待手动登录
- 登录完成后恢复执行
- 支持已登录浏览器连接

### 6. 安全防护机制

- **URL 白名单**：限制可访问的域名
- **危险协议拦截**：阻止 javascript:, data:, file: 等协议
- **网络隔离**：可选的网络访问控制
- **代理支持**：通过代理路由所有流量

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

#### 连接现有浏览器

```bash
# Windows: 启动 Chrome 调试模式
scripts\start-chrome-debug.bat

# 或手动启动
chrome.exe --remote-debugging-port=9222 --user-data-dir="C:\chrome-debug-profile"
```

在 Web 界面中：
1. 勾选"使用现有浏览器"
2. 输入 CDP Endpoint：`http://localhost:9222`
3. 开始测试

**优势**：
- 使用已登录的浏览器会话
- 避免重复登录操作
- 保持 cookies 和 session
- 调试更方便

#### 保存测试流程

```typescript
// 1. 测试完成后，点击"保存整个测试流程"
// 2. 输入流程名称（如："百度搜索流程"）
// 3. 添加标签（如：e2e, smoke-test）
// 4. 所有成功步骤将被保存为一个完整流程
// 5. 下次可直接加载使用
```

## 🏗️ 项目架构

### Plan-and-Execute 模式

```
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
                                    │
                                    ▼
                              ┌─────────────┐
                              │     RAG     │ ──历史案例学习
                              └─────────────┘
```

### 核心组件

| 组件 | 文件 | 功能 |
|------|------|------|
| Planner | [src/agent/planner.ts](file:///d:/frontProjects/agent/my-first-agent/src/agent/planner.ts) | 根据目标生成测试步骤 |
| Executor | [src/agent/executor.ts](file:///d:/frontProjects/agent/my-first-agent/src/agent/executor.ts) | 执行浏览器操作 |
| Observer | [src/agent/observer.ts](file:///d:/frontProjects/agent/my-first-agent/src/agent/observer.ts) | 获取页面状态 |
| Replanner | [src/agent/replanner.ts](file:///d:/frontProjects/agent/my-first-agent/src/agent/replanner.ts) | 错误恢复和重规划 |
| LoginDetector | [src/agent/loginDetector.ts](file:///d:/frontProjects/agent/my-first-agent/src/agent/loginDetector.ts) | 登录需求检测 |
| RAG System | [src/rag/](file:///d:/frontProjects/agent/my-first-agent/src/rag/) | 历史案例学习 |

详细架构说明请查看 [agent.md](file:///d:/frontProjects/agent/my-first-agent/agent.md)。

## 📊 API 文档

### POST /api/plan
生成测试计划

```json
{
  "goal": "打开百度并搜索 Playwright"
}
```

### POST /api/execute/stream
流式执行测试计划

```json
{
  "planId": "plan-xxx",
  "headless": false
}
```

### POST /api/dynamic/stream
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

完整 API 文档请查看 [agent.md](file:///d:/frontProjects/agent/my-first-agent/agent.md#📊-api-接口文档)。

## 🐳 Docker 部署

### 构建镜像

```bash
docker build -t browser-automation-agent .
```

### 运行容器

```bash
docker run -d \
  -p 3000:3000 \
  -e LLM_PROVIDER=qwen \
  -e DASHSCOPE_API_KEY=your_key \
  --security-opt seccomp=seccomp-profile.json \
  browser-automation-agent
```

### 使用 Docker Compose

```bash
docker-compose up -d
```

详细部署说明请查看 [agent.md](file:///d:/frontProjects/agent/my-first-agent/agent.md#🔍-高级特性)。

## 🐛 常见问题

### 1. API Key 未配置

**问题**：`DASHSCOPE_API_KEY` 显示为 `undefined`

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

### 3. 元素定位失败

**问题**：元素定位失败

**解决**：
- 使用动态模式，让 LLM 自动适应
- 增加等待时间
- 使用更稳定的选择器（data-testid, id）

更多问题请查看 [agent.md](file:///d:/frontProjects/agent/my-first-agent/agent.md#🐛-常见问题与解决方案)。

## 📈 性能优化

### 使用 Headless 模式
```env
HEADLESS=true
```

### 使用更快的模型
```env
LLM_MODEL=qwen-turbo
```

### 减少截图
```env
SCREENSHOT_ON_SUCCESS=false
```

### 复用测试流程
- 使用步骤库保存常用流程
- 一键加载复用

## 🔐 安全建议

1. **不要提交 `.env` 文件**到版本控制
2. **定期更换 API Key**
3. **启用 URL 白名单**限制访问域名
4. **启用危险协议拦截**防止 XSS
5. **使用 Docker 容器化**隔离运行环境

详细安全说明请查看 [agent.md](file:///d:/frontProjects/agent/my-first-agent/agent.md#🔐-安全最佳实践)。

## 🤝 贡献指南

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](file:///d:/frontProjects/agent/my-first-agent/LICENSE) 文件了解详情

## 🙏 致谢

- [Playwright](https://playwright.dev/) - 浏览器自动化框架
- [Next.js](https://nextjs.org/) - React 框架
- [OpenAI](https://openai.com/) - LLM API
- [千问](https://tongyi.aliyun.com/) - 阿里云大语言模型
- [Anthropic](https://www.anthropic.com/) - Claude 大语言模型

## 📞 联系方式

如有问题或建议，请提交 Issue 或 Pull Request。

---

**注意**：本项目仅供学习和研究使用，请遵守相关网站的使用条款和法律法规。
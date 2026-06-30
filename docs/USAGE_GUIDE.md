# 浏览器自动化测试系统使用指南

## 🚀 快速开始

### 1. 配置千问 LLM API Key

要使用真实的千问 LLM API 解析自然语言指令，需要先获取 API Key：

#### 步骤：
1. 访问阿里云 DashScope 控制台：https://dashscope.console.aliyun.com/apiKey
2. 登录并创建新的 API Key
3. 复制生成的 API Key

#### 配置环境变量：
编辑 `.env.local` 文件，替换 API Key：

```bash
# 千问 LLM API 配置
QWEN_API_KEY=your_real_api_key_here  # 替换为真实的 API Key
QWEN_MODEL=qwen-turbo                # 模型选择
QWEN_API_ENDPOINT=https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation
```

**注意**：如果不配置 API Key，系统会自动降级使用预设模板匹配。

---

### 2. 启动系统

系统已自动运行，访问以下地址：

- **主页（ReactFlow）**: http://localhost:3000
- **测试页面**: http://localhost:3000/test

---

### 3. 使用测试系统

#### 基本流程：

1. **打开测试页面**
   - 浏览器访问 http://localhost:3000/test

2. **输入测试指令**
   - 在左侧输入面板输入自然语言描述
   - 或使用快捷模板按钮

3. **开始测试**
   - 点击"🚀 开始测试"按钮
   - 系统会自动解析指令并执行浏览器操作

4. **查看结果**
   - 右侧执行日志会实时显示测试步骤
   - 查看成功/失败状态

---

## 📝 自然语言指令示例

### 登录测试
```
登录测试：
打开 https://example.com/login
输入用户名 admin
输入密码 password123
点击登录按钮
验证跳转到首页
```

### 表单填写
```
表单填写：
打开 https://example.com/form
输入姓名 张三
输入邮箱 zhangsan@example.com
输入电话 13800138000
点击提交按钮
```

### 页面导航
```
页面导航：
打开 https://example.com
点击产品按钮
点击详情链接
验证标题可见
```

### 内容验证
```
内容验证：
打开 https://example.com
验证文本 欢迎使用
验证元素 #header 可见
```

---

## 🤖 千问 LLM API 功能

### 工作原理：
1. 系统接收到自然语言指令后，首先尝试调用千问 API
2. 千问 LLM 分析指令语义，生成结构化的测试步骤
3. 如果 API 调用失败，自动降级到预设模板匹配

### 支持的测试工具：
- `browser_navigate` - 导航到指定 URL
- `browser_click` - 点击元素
- `browser_type` - 输入文本
- `browser_snapshot` - 获取页面截图
- `browser_wait_for` - 等待元素或时间
- `browser_evaluate` - 执行 JavaScript 验证

### LLM 解析优势：
- ✅ 理解复杂的自然语言描述
- ✅ 自动生成语义化的选择器
- ✅ 支持非标准化的测试流程
- ✅ 更智能的步骤序列生成

---

## ⚙️ 系统配置

### 可用的千问模型：
- `qwen-turbo` - 快速响应，成本低（推荐）
- `qwen-plus` - 平衡性能和成本
- `qwen-max` - 最高性能，成本较高

### 修改模型：
编辑 `.env.local` 文件：
```bash
QWEN_MODEL=qwen-plus  # 修改为其他模型
```

---

## 🔧 故障排查

### 问题1：API Key 无效
**症状**：提示 "API Key 无效"
**解决**：
1. 检查 `.env.local` 文件中的 `QWEN_API_KEY`
2. 确保 API Key 格式正确（以 `sk-` 开头）
3. 在阿里云控制台确认 API Key 状态

### 问题2：降级到模板匹配
**症状**：使用预设模板而非 LLM 解析
**解决**：
1. 检查 API Key 是否配置
2. 检查网络连接
3. 查看控制台日志中的错误信息

### 问题3：解析失败
**症状**：提示 "无法解析指令"
**解决**：
1. 提供更详细的指令描述
2. 使用快捷模板
3. 检查指令格式和语法

---

## 📊 性能优化建议

1. **使用 qwen-turbo 模型**
   - 成本最低，响应最快
   - 适合大多数测试场景

2. **优化指令描述**
   - 明确指定 URL、元素选择器
   - 使用简洁的语句
   - 避免复杂的嵌套逻辑

3. **利用快捷模板**
   - 对于常见场景，使用预设模板更快
   - 减少 API 调用次数

---

## 🎯 下一步功能

当前实现的功能：
- ✅ 千问 LLM API 集成
- ✅ 自然语言解析
- ✅ MCP 协议浏览器控制
- ✅ 实时执行日志
- ✅ 预设模板降级方案

待实现功能：
- 🔄 浏览器实时预览（CDP WebSocket）
- 🔄 历史记录数据库
- 🔄 错误恢复交互
- 🔄 用户手动干预
- 🔄 更多 MCP 工具集成

---

## 💡 最佳实践

### 1. 指令编写技巧
- **明确 URL**：使用完整的 URL 地址
- **描述元素**：使用元素的文本内容或ID
- **分步描述**：每个操作单独一行
- **添加验证**：最后添加验证步骤

### 2. API Key 管理
- **定期更新**：API Key 可能过期，需定期检查
- **安全存储**：不要在代码中硬编码 API Key
- **权限控制**：限制 API Key 的访问权限

### 3. 成本控制
- **选择合适模型**：根据需求选择模型
- **缓存结果**：相似指令可以缓存解析结果
- **使用模板**：常见场景优先使用模板

---

## 📞 获取帮助

遇到问题时：
1. 查看控制台日志（浏览器开发者工具）
2. 检查 `.env.local` 配置
3. 参考 `.env.example` 示例配置
4. 查看设计文档：`docs/superpowers/specs/2026-06-22-browser-automation-design.md`

---

**祝你测试愉快！** 🎊
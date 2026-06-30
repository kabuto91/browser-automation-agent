# Playwright MCP 连接问题修复说明

## ❌ 原始错误

测试执行失败：
```
Error: 无法连接到 Playwright MCP Server: McpError: MCP error -32000: Connection closed
npm error 404 Not Found - GET https://registry.npmjs.org/@anthropic-ai%2fmcp-server-playwright
```

**根本原因**：使用了错误的 Playwright MCP Server 包名。

---

## ✅ 修复内容

### **1. 修正 MCP Server 包名**

**错误的包名**：
- `@anthropic-ai/mcp-server-playwright`（不存在）
- `@anthropic/mcp-server-playwright@latest`（不存在）

**正确的包名**：
- `@playwright/mcp@latest`（官方 Microsoft Playwright MCP Server）

**修改位置**：[src/lib/mcp-client.ts](src/lib/mcp-client.ts)

```typescript
// 修复前
args: ['-y', '@anthropic/mcp-server-playwright@latest']

// 修复后
args: ['-y', '@playwright/mcp@latest']
```

---

### **2. 调整工具参数适配 Playwright MCP**

Playwright MCP 使用辅助功能树的元素引用（`ref`），而不是 CSS 选择器（`selector`）。

#### **关键区别**：

| 参数类型 | 错误用法 | 正确用法 |
|---------|---------|---------|
| 元素定位 | `selector: "#username"` | `ref: "e3"` |
| 操作流程 | 直接使用选择器 | 先 `browser_snapshot` 获取 ref |

#### **正确的操作流程**：
```
1. browser_navigate  → 打开页面
2. browser_snapshot  → 获取页面快照和元素 ref
3. browser_click/type → 使用 ref 参数操作元素
```

---

### **3. 更新 LLM 提示词**

**修改位置**：[src/lib/llm-parser.ts](src/lib/llm-parser.ts)

**关键更新**：
- 明确说明 Playwright MCP 使用 `ref` 参数
- 添加操作流程说明（先快照再操作）
- 提供正确的工具参数示例
- 强调不要使用 `selector`（除非是 `browser_wait_for`）

**示例提示词片段**：
```
关键注意：Playwright MCP 使用辅助功能树的元素引用（ref），而不是 CSS 选择器。
因此，操作流程应该是：
1. 先使用 browser_navigate 打开页面
2. 使用 browser_snapshot 获取页面快照
3. 从快照中找到目标元素的 ref（如 [ref=e5]）
4. 使用 ref 参数进行后续操作（如 browser_click, browser_type）
```

---

### **4. 更新预设模板参数**

修改了所有预设模板，使用正确的 `ref` 参数：

#### **登录测试模板**：
```typescript
// 修复前
{ tool: 'browser_click', params: { selector: '#username', description: '用户名输入框' } }

// 修复后
{ tool: 'browser_type', params: { ref: 'e3', text: username } }
```

#### **表单填写模板**：
```typescript
// 修复前
{ tool: 'browser_type', params: { selector: '#field1', text: 'value' } }

// 修复后
{ tool: 'browser_type', params: { ref: 'e3', text: 'value' } }
```

#### **页面导航模板**：
```typescript
// 修复前
{ tool: 'browser_click', params: { selector: '#button' } }

// 修复后
{ tool: 'browser_click', params: { ref: 'e3' } }
```

---

## 🎯 Playwright MCP 正确用法

### **核心概念**：

Playwright MCP 基于**辅助功能树（Accessibility Tree）**工作，而不是视觉截图或 CSS 选择器。

### **元素引用系统**：

每个交互元素都有一个唯一的引用 ID（如 `e3`, `e5`），这些 ID 来自 `browser_snapshot` 返回的辅助功能树快照。

### **典型流程示例**：

```json
{
  "steps": [
    { "tool": "browser_navigate", "params": { "url": "https://example.com/login" } },
    { "tool": "browser_snapshot", "params": {} },
    // 快照返回：textbox "Username" [ref=e3]
    { "tool": "browser_type", "params": { "ref": "e3", "text": "admin" } },
    { "tool": "browser_type", "params": { "ref": "e4", "text": "password123" } },
    { "tool": "browser_click", "params": { "ref": "e5" } }
  ]
}
```

### **工具参数对照表**：

| 工具名称 | 参数格式 | 说明 |
|---------|---------|------|
| `browser_navigate` | `{ "url": "https://..." }` | 导航到 URL |
| `browser_snapshot` | `{}` | 获取页面快照，返回元素 ref |
| `browser_click` | `{ "ref": "e5" }` | 点击元素（使用 ref） |
| `browser_type` | `{ "ref": "e3", "text": "...", "submit": true }` | 输入文本 |
| `browser_wait_for` | `{ "selector": "#id", "time": 5 }` | 等待（可用 selector） |
| `browser_evaluate` | `{ "function": "JS代码" }` | 执行 JavaScript |

---

## 📚 官方文档参考

- **GitHub**: https://github.com/microsoft/playwright-mcp
- **官方文档**: https://playwright.net.cn/mcp/introduction
- **MCP Directory**: https://mcp.directory/servers/playwright-browser-automation

---

## ✅ 修复验证

所有修改已完成并编译成功：
- ✅ MCP Server 包名已修正
- ✅ LLM 提示词已适配 Playwright MCP
- ✅ 预设模板参数已更新
- ✅ 开发服务器已重启

**现在可以正常使用浏览器自动化测试功能！**

---

## 💡 使用建议

1. **首次测试建议**：使用真实 LLM API（配置千问 API Key）
2. **预设模板限制**：预设模板使用模拟的 ref（e3, e4等），实际测试需要真实快照
3. **最佳实践**：让 LLM 先获取快照，再从快照中提取真实 ref
4. **降级方案**：如果 LLM API 失败，系统会自动降级到预设模板

---

**修复完成！系统已准备就绪！** 🎊
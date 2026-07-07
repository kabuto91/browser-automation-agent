# 步骤库 - 展示具体步骤 & 支持删改操作

## 总结

当前步骤库只展示步骤名称和基本信息，无法查看脚本内部的具体操作步骤，也不支持编辑。本次改动：
1. 在步骤卡片中展开显示脚本的每个具体操作步骤（toolName + description）
2. 新增编辑功能：打开编辑弹窗，展示所有脚本步骤，支持修改每个步骤的 toolName、arguments、description，支持增删和排序
3. 修改后需验证执行成功才能保存（复用现有 validateScript 逻辑）

## 当前状态分析

### 数据结构
- `ToolCall`：`{ toolName: string, arguments: any, description?: string }`
- `TestStep`：`{ id, name, originalTask, script: ToolCall[], createdAt, successCount, lastExecutedAt? }`

### 现有功能
- **StepLibraryDrawer.tsx**：Card 列表展示，只有"执行"和"删除"按钮，不展示具体脚本步骤
- **stepLibraryDB.ts**：有 addStep、getStep、deleteStep、updateStepStats，但缺少 `updateStep`（更新完整步骤数据）
- **scriptValidator.ts**：已有 `validateScript` 函数，执行 3 次验证稳定性
- **scriptExecutor.ts**：已有 `executeScript` 函数，按序执行 ToolCall 序列

## 变更方案

### 1. stepLibraryDB.ts — 新增 `updateStep` 方法

新增一个 `updateStep(step: TestStep): Promise<void>` 方法，用 `objectStore.put(step)` 覆盖写入完整步骤数据（包括修改后的 script）。

### 2. StepLibraryDrawer.tsx — 展示具体步骤 + 编辑功能

**2a. 展示具体步骤**
- 在每个 Card 的内容区域，新增一个可折叠的"脚本步骤"列表
- 使用 antd `Collapse` 或简单的展开/收起按钮
- 每个步骤显示序号、toolName、description（如有）
- 格式示例：`1. browser_navigate - 打开百度首页`

**2b. 新增编辑按钮**
- 在 Card 的 extra 区域（执行/删除按钮旁）新增"编辑"按钮

**2c. 编辑弹窗（Modal）**
- 使用 antd `Modal`，宽度 700px
- 顶部：步骤名称输入框
- 中间：脚本步骤列表，每个步骤一行，包含：
  - 序号
  - toolName（Input）
  - description（Input）
  - arguments（TextArea，JSON 格式编辑）
  - 删除按钮（Popconfirm）
  - 上移/下移按钮
- 底部：添加步骤按钮
- 确认按钮："验证并保存"

**2d. 验证并保存流程**
1. 用户点击"验证并保存"
2. 前端校验：每个步骤的 arguments 是否为合法 JSON
3. 调用 `/api/chat` 的 `validate` action，传入修改后的 script
4. 流式接收验证进度（3 次执行）
5. 验证全部通过 → 调用 `updateStep` 保存到 IndexedDB → 提示成功 → 刷新列表
6. 验证失败 → 提示失败原因，不保存

### 3. 后端 API — 无需改动

现有的 `validate` action 已支持传入任意 script 进行验证，无需修改。

## 涉及文件

| 文件 | 改动 |
|------|------|
| `app/utils/stepLibraryDB.ts` | 新增 `updateStep` 方法 |
| `app/components/StepLibraryDrawer.tsx` | 展示具体步骤列表 + 编辑弹窗 + 验证保存流程 |

## 验证步骤

1. 打开步骤库，确认每个步骤卡片下方能展开查看具体脚本步骤
2. 点击"编辑"按钮，确认弹窗正确展示所有脚本步骤
3. 修改某个步骤的 description，点击"验证并保存"，验证通过后确认保存成功
4. 修改某个步骤的 arguments 为非法 JSON，确认前端校验拦截
5. 删除/新增/排序步骤后验证保存，确认修改正确反映
6. 验证失败时确认不保存，提示错误信息

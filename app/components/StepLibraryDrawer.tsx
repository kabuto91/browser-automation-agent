"use client";

import { Drawer, Button, Card, Empty, Spin, Alert, Popconfirm, message, Modal, Input, Space, Checkbox, Progress } from 'antd';
import { useState, useEffect } from 'react';
import { getAllSteps, deleteStep, updateStepStats, updateStep, TestStep, ToolCall } from '../utils/stepLibraryDB';

interface ExecutionState {
  status: 'idle' | 'running' | 'success' | 'error';
  progress?: { step: number; total: number };
  error?: string;
}

interface StepLibraryDrawerProps {
  open: boolean;
  onClose: () => void;
}

export default function StepLibraryDrawer({ open, onClose }: StepLibraryDrawerProps) {
  const [steps, setSteps] = useState<TestStep[]>([]);
  const [loading, setLoading] = useState(false);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  // 批量执行相关状态
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchExecuting, setBatchExecuting] = useState(false);
  const [executionStates, setExecutionStates] = useState<Map<string, ExecutionState>>(new Map());

  // 编辑相关状态
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingStep, setEditingStep] = useState<TestStep | null>(null);
  const [editName, setEditName] = useState('');
  const [editScript, setEditScript] = useState<ToolCall[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [validationProgress, setValidationProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);

  useEffect(() => {
    if (open) {
      loadSteps();
    }
  }, [open]);

  const loadSteps = async () => {
    setLoading(true);
    setError('');
    try {
      const allSteps = await getAllSteps();
      setSteps(allSteps);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载步骤库失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteStep(id);
      message.success('删除成功');
      loadSteps();
    } catch (err) {
      message.error('删除失败');
    }
  };

  // 批量执行相关函数
  const handleSelect = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedIds(newSelected);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(steps.map(s => s.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleBatchExecute = async () => {
    if (selectedIds.size === 0) {
      message.warning('请至少选择一个步骤');
      return;
    }

    setBatchExecuting(true);
    setError('');

    // 初始化执行状态
    const initialStates = new Map<string, ExecutionState>();
    selectedIds.forEach(id => {
      initialStates.set(id, { status: 'idle' });
    });
    setExecutionStates(initialStates);

    const selectedSteps = steps.filter(s => selectedIds.has(s.id));

    console.log(`🚀 开始批量执行 ${selectedSteps.length} 个步骤`);

    // 并行执行所有选中的步骤
    const executionPromises = selectedSteps.map(async (step, index) => {
      try {
        console.log(`🚀 [${index + 1}/${selectedSteps.length}] 开始执行步骤: ${step.name}`);

        // 更新状态为运行中
        setExecutionStates(prev => {
          const next = new Map(prev);
          next.set(step.id, { status: 'running' });
          return next;
        });

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'execute-script',
            script: step.script,
          }),
        });

        console.log(`✅ [${index + 1}/${selectedSteps.length}] 收到响应: ${step.name}`);

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.substring(6));

                if (data.status === 'executing') {
                  setExecutionStates(prev => {
                    const next = new Map(prev);
                    next.set(step.id, {
                      status: 'running',
                      progress: { step: data.step, total: data.total }
                    });
                    return next;
                  });
                } else if (data.status === 'completed') {
                  await updateStepStats(step.id, true);
                  setExecutionStates(prev => {
                    const next = new Map(prev);
                    next.set(step.id, { status: 'success' });
                    return next;
                  });
                } else if (data.status === 'error') {
                  await updateStepStats(step.id, false);
                  setExecutionStates(prev => {
                    const next = new Map(prev);
                    next.set(step.id, { status: 'error', error: data.error });
                    return next;
                  });
                }
              } catch (parseError) {
                console.error('Failed to parse SSE data:', parseError);
              }
            }
          }
        }
      } catch (err) {
        await updateStepStats(step.id, false);
        setExecutionStates(prev => {
          const next = new Map(prev);
          next.set(step.id, {
            status: 'error',
            error: err instanceof Error ? err.message : 'Unknown error'
          });
          return next;
        });
      }
    });

    await Promise.all(executionPromises);

    setBatchExecuting(false);
    setSelectedIds(new Set());
    loadSteps();
    message.success('批量执行完成');
  };

  const handleExecute = async (step: TestStep) => {
    setExecutingId(step.id);
    setError('');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'execute-script',
          script: step.script,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));
              
              if (data.status === 'completed') {
                await updateStepStats(step.id, true);
                message.success(`执行成功：${data.result}`);
                loadSteps();
              } else if (data.status === 'error') {
                await updateStepStats(step.id, false);
                setError(data.error || '执行失败');
              }
            } catch (parseError) {
              console.error('Failed to parse SSE data:', parseError);
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '执行失败');
    } finally {
      setExecutingId(null);
    }
  };

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedSteps);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedSteps(newExpanded);
  };

  const handleEdit = (step: TestStep) => {
    setEditingStep(step);
    setEditName(step.name);
    setEditScript([...step.script]);
    setEditModalOpen(true);
  };

  const handleAddScriptStep = () => {
    setEditScript([...editScript, {
      toolName: '',
      arguments: {},
      description: '',
    }]);
  };

  const handleRemoveScriptStep = (index: number) => {
    const newScript = editScript.filter((_, i) => i !== index);
    setEditScript(newScript);
  };

  const handleMoveScriptStep = (index: number, direction: 'up' | 'down') => {
    const newScript = [...editScript];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (targetIndex < 0 || targetIndex >= newScript.length) return;
    
    [newScript[index], newScript[targetIndex]] = [newScript[targetIndex], newScript[index]];
    setEditScript(newScript);
  };

  const handleUpdateScriptStep = (index: number, field: keyof ToolCall, value: string) => {
    const newScript = [...editScript];
    if (field === 'arguments') {
      try {
        newScript[index].arguments = JSON.parse(value);
      } catch {
        // 保持原值，等待用户修正
      }
    } else {
      (newScript[index] as any)[field] = value;
    }
    setEditScript(newScript);
  };

  const handleSaveEdit = async () => {
    if (!editingStep) return;

    // 前端校验
    if (!editName.trim()) {
      message.warning('请输入步骤名称');
      return;
    }

    if (editScript.length === 0) {
      message.warning('至少需要一个脚本步骤');
      return;
    }

    // 校验每个步骤的 toolName 和 arguments
    for (let i = 0; i < editScript.length; i++) {
      const step = editScript[i];
      if (!step.toolName.trim()) {
        message.warning(`第 ${i + 1} 步的工具名称不能为空`);
        return;
      }
      try {
        JSON.stringify(step.arguments);
      } catch {
        message.warning(`第 ${i + 1} 步的参数不是有效的 JSON`);
        return;
      }
    }

    setIsSaving(true);
    setValidationProgress(null);

    try {
      // 调用验证 API
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'validate',
          script: editScript,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let validationResult: any = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));
              
              if (data.status === 'validation_progress') {
                setValidationProgress({
                  current: data.attempt,
                  total: data.total,
                });
              } else if (data.status === 'validation_complete') {
                validationResult = data;
              }
            } catch (parseError) {
              console.error('Failed to parse validation data:', parseError);
            }
          }
        }
      }

      if (!validationResult) {
        throw new Error('未收到验证结果');
      }

      if (!validationResult.valid) {
        message.error(`验证失败：成功 ${validationResult.successCount}/${validationResult.totalAttempts} 次`);
        return;
      }

      // 验证通过，保存到数据库
      const updatedStep: TestStep = {
        ...editingStep,
        name: editName,
        script: editScript,
      };

      await updateStep(updatedStep);
      message.success('步骤已更新');
      setEditModalOpen(false);
      loadSteps();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setIsSaving(false);
      setValidationProgress(null);
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN');
  };

  return (
    <Drawer
      title={
        <div className="flex items-center justify-between">
          <span>步骤库</span>
          {steps.length > 0 && (
            <div className="flex items-center gap-3">
              <Checkbox
                checked={selectedIds.size === steps.length && steps.length > 0}
                indeterminate={selectedIds.size > 0 && selectedIds.size < steps.length}
                onChange={(e) => handleSelectAll(e.target.checked)}
                disabled={batchExecuting}
              >
                全选
              </Checkbox>
              <Button
                type="primary"
                onClick={handleBatchExecute}
                loading={batchExecuting}
                disabled={selectedIds.size === 0}
              >
                批量执行 ({selectedIds.size})
              </Button>
            </div>
          )}
        </div>
      }
      placement="right"
      size="large"
      width={800}
      onClose={onClose}
      open={open}
    >
      {error && (
        <Alert
          message="错误"
          description={error}
          type="error"
          showIcon
          closable
          className="mb-4"
          onClose={() => setError('')}
        />
      )}

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <Spin size="large" />
        </div>
      ) : steps.length === 0 ? (
        <Empty description="步骤库为空" />
      ) : (
        <div className="space-y-4">
          {steps.map((step) => {
            const execState = executionStates.get(step.id);
            const isSelected = selectedIds.has(step.id);
            const isRunning = execState?.status === 'running';
            const isSuccess = execState?.status === 'success';
            const isError = execState?.status === 'error';

            return (
              <Card
                key={step.id}
                title={
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={isSelected}
                      onChange={(e) => handleSelect(step.id, e.target.checked)}
                      disabled={batchExecuting}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span>{step.name}</span>
                    {isRunning && (
                      <span className="text-blue-500 text-sm">执行中...</span>
                    )}
                    {isSuccess && (
                      <span className="text-green-500 text-sm">✓ 成功</span>
                    )}
                    {isError && (
                      <span className="text-red-500 text-sm">✗ 失败</span>
                    )}
                  </div>
                }
                extra={
                  <div className="flex gap-2">
                    <Button
                      type="primary"
                      onClick={() => handleExecute(step)}
                      loading={executingId === step.id}
                      disabled={executingId !== null || batchExecuting}
                    >
                      执行
                    </Button>
                    <Button onClick={() => handleEdit(step)} disabled={batchExecuting}>
                      编辑
                    </Button>
                    <Popconfirm
                      title="确定要删除这个步骤吗？"
                      onConfirm={() => handleDelete(step.id)}
                      okText="确定"
                      cancelText="取消"
                      disabled={batchExecuting}
                    >
                      <Button danger disabled={batchExecuting}>删除</Button>
                    </Popconfirm>
                  </div>
                }
              >
                <div className="space-y-2 text-sm">
                  {/* 执行进度条 */}
                  {execState?.progress && (
                    <div className="mb-3">
                      <Progress
                        percent={Math.round((execState.progress.step / execState.progress.total) * 100)}
                        status="active"
                        size="small"
                      />
                      <div className="text-xs text-gray-500 mt-1">
                        步骤 {execState.progress.step} / {execState.progress.total}
                      </div>
                    </div>
                  )}

                  {/* 错误信息 */}
                  {isError && execState.error && (
                    <Alert
                      message="执行失败"
                      description={execState.error}
                      type="error"
                      showIcon
                      className="mb-3"
                    />
                  )}

                  <div>
                    <span className="text-gray-500">原始任务：</span>
                    <span>{step.originalTask}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">创建时间：</span>
                    <span>{formatDate(step.createdAt)}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">脚本步骤数：</span>
                    <span>{step.script.length} 步</span>
                  </div>
                  <div>
                    <span className="text-gray-500">成功执行次数：</span>
                    <span className="text-green-600 font-medium">{step.successCount}</span>
                  </div>
                  {step.lastExecutedAt && (
                    <div>
                      <span className="text-gray-500">最后执行：</span>
                      <span>{formatDate(step.lastExecutedAt)}</span>
                    </div>
                  )}

                  {/* 脚本步骤列表 */}
                  <div className="mt-3">
                    <Button
                      type="link"
                      size="small"
                      onClick={() => toggleExpand(step.id)}
                      className="p-0"
                    >
                      {expandedSteps.has(step.id) ? '收起' : '展开'}脚本步骤
                    </Button>

                    {expandedSteps.has(step.id) && (
                      <div className="mt-2 bg-gray-50 rounded p-3">
                        {step.script.map((scriptStep, idx) => (
                          <div key={idx} className="text-xs mb-2 last:mb-0">
                            <span className="text-blue-600 font-medium">{idx + 1}.</span>
                            <span className="ml-2 font-mono">{scriptStep.toolName}</span>
                            {scriptStep.description && (
                              <span className="ml-2 text-gray-500">- {scriptStep.description}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* 编辑弹窗 */}
      <Modal
        title="编辑步骤"
        open={editModalOpen}
        onCancel={() => setEditModalOpen(false)}
        onOk={handleSaveEdit}
        confirmLoading={isSaving}
        okText="验证并保存"
        cancelText="取消"
        width={700}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">步骤名称</label>
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="请输入步骤名称"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium">脚本步骤</label>
              <Button type="dashed" size="small" onClick={handleAddScriptStep}>
                + 添加步骤
              </Button>
            </div>

            {validationProgress && (
              <div className="mb-3 p-2 bg-blue-50 rounded text-sm">
                验证中：{validationProgress.current}/{validationProgress.total}
              </div>
            )}

            <div className="space-y-3 max-h-96 overflow-y-auto">
              {editScript.map((scriptStep, idx) => (
                <div key={idx} className="border rounded p-3 bg-gray-50">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-sm font-medium">步骤 {idx + 1}</span>
                    <Space size="small">
                      <Button 
                        size="small" 
                        onClick={() => handleMoveScriptStep(idx, 'up')}
                        disabled={idx === 0}
                      >
                        ↑
                      </Button>
                      <Button 
                        size="small" 
                        onClick={() => handleMoveScriptStep(idx, 'down')}
                        disabled={idx === editScript.length - 1}
                      >
                        ↓
                      </Button>
                      <Popconfirm
                        title="确定删除此步骤？"
                        onConfirm={() => handleRemoveScriptStep(idx)}
                        okText="确定"
                        cancelText="取消"
                      >
                        <Button size="small" danger>
                          删除
                        </Button>
                      </Popconfirm>
                    </Space>
                  </div>

                  <div className="space-y-2">
                    <div>
                      <label className="text-xs text-gray-500">工具名称</label>
                      <Input
                        size="small"
                        value={scriptStep.toolName}
                        onChange={(e) => handleUpdateScriptStep(idx, 'toolName', e.target.value)}
                        placeholder="例如：browser_navigate"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">描述</label>
                      <Input
                        size="small"
                        value={scriptStep.description || ''}
                        onChange={(e) => handleUpdateScriptStep(idx, 'description', e.target.value)}
                        placeholder="步骤描述（可选）"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">参数 (JSON)</label>
                      <Input.TextArea
                        size="small"
                        rows={3}
                        value={JSON.stringify(scriptStep.arguments, null, 2)}
                        onChange={(e) => handleUpdateScriptStep(idx, 'arguments', e.target.value)}
                        placeholder='{"url": "https://example.com"}'
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </Drawer>
  );
}

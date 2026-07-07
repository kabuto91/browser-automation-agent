"use client";

import { Drawer, Button, Card, Empty, Spin, Alert, Popconfirm, message, Progress } from 'antd';
import { useState, useEffect } from 'react';
import { getAllSteps, deleteStep, updateStepStats, TestStep } from '../utils/stepLibraryDB';

interface StepLibraryDrawerProps {
  open: boolean;
  onClose: () => void;
}

export default function StepLibraryDrawer({ open, onClose }: StepLibraryDrawerProps) {
  const [steps, setSteps] = useState<TestStep[]>([]);
  const [loading, setLoading] = useState(false);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [executionProgress, setExecutionProgress] = useState<{
    current: number;
    total: number;
    tool: string;
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

  const handleExecute = async (step: TestStep) => {
    setExecutingId(step.id);
    setError('');
    setExecutionProgress(null);

    try {
      console.log('开始执行步骤:', step.name, '脚本步骤数:', step.script.length);
      
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
              console.log('收到执行消息:', data);
              
              if (data.status === 'executing') {
                setExecutionProgress({
                  current: data.step,
                  total: data.total,
                  tool: data.tool,
                });
              } else if (data.status === 'completed') {
                await updateStepStats(step.id, true);
                message.success(`执行成功：${data.result}`);
                setExecutionProgress(null);
                loadSteps();
              } else if (data.status === 'error') {
                await updateStepStats(step.id, false);
                setError(data.error || '执行失败');
                setExecutionProgress(null);
              }
            } catch (parseError) {
              console.error('Failed to parse SSE data:', parseError);
            }
          }
        }
      }
    } catch (err) {
      console.error('执行失败:', err);
      setError(err instanceof Error ? err.message : '执行失败');
      setExecutionProgress(null);
    } finally {
      setExecutingId(null);
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN');
  };

  return (
    <Drawer
      title="步骤库"
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
          {steps.map((step) => (
            <Card
              key={step.id}
              title={step.name}
              extra={
                <div className="flex gap-2">
                  <Button
                    type="primary"
                    onClick={() => handleExecute(step)}
                    loading={executingId === step.id}
                    disabled={executingId !== null}
                  >
                    执行
                  </Button>
                  <Popconfirm
                    title="确定要删除这个步骤吗？"
                    onConfirm={() => handleDelete(step.id)}
                    okText="确定"
                    cancelText="取消"
                  >
                    <Button danger>删除</Button>
                  </Popconfirm>
                </div>
              }
            >
              <div className="space-y-2 text-sm">
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
              </div>
            </Card>
          ))}
        </div>
      )}
    </Drawer>
  );
}

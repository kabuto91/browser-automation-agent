"use client";

import { Drawer, Input, Button, Spin, Alert, Timeline, Modal, message } from 'antd';
import { useState, useRef } from 'react';
import { addStep, ToolCall } from '../utils/stepLibraryDB';

interface ProgressStep {
  step: number;
  status: string;
  tool?: string;
  result?: string;
  error?: string;
  message?: string;
  taskId?: string;
  script?: ToolCall[];
}

interface ChatDrawerProps {
  open: boolean;
  onClose: () => void;
}

export default function ChatDrawer({ open, onClose }: ChatDrawerProps) {
  const { TextArea } = Input;
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<ProgressStep[]>([]);
  const [error, setError] = useState('');
  const [finalResult, setFinalResult] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [stepName, setStepName] = useState('');
  const [currentScript, setCurrentScript] = useState<ToolCall[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const currentTaskIdRef = useRef('');
  const streamReaderRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
  };

  const processSSEStream = async (reader: ReadableStreamDefaultReader<Uint8Array>) => {
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

            if (data.cached) {
              setFinalResult(data.output);
              setProgress([{ step: 1, status: 'completed', result: '命中缓存' }]);
              setIsLoading(false);
              return;
            }

            if (data.taskId) {
              currentTaskIdRef.current = data.taskId;
            }

            setProgress(prev => [...prev, data]);

            if (data.status === 'login_required') {
              setIsPaused(true);
            } else if (data.status === 'resumed') {
              setIsPaused(false);
            } else if (data.status === 'completed') {
              setFinalResult(data.result);
              if (data.script && data.script.length > 0) {
                setCurrentScript(data.script);
              }
              setIsLoading(false);
              return;
            } else if (data.status === 'error') {
              setError(data.error);
            }
          } catch (parseError) {
            console.error('Failed to parse SSE data:', parseError);
          }
        }
      }
    }

    setIsLoading(false);
    setIsPaused(false);
  };

  const handleSubmit = async () => {
    if (!inputValue.trim()) return;

    setIsLoading(true);
    setProgress([]);
    setError('');
    setFinalResult('');
    setIsPaused(false);
    currentTaskIdRef.current = '';

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ input: inputValue }),
      });

      if (!response.ok) {
        const text = await response.text();
        try {
          const data = JSON.parse(text);
          throw new Error(data.error || `HTTP error! status: ${response.status}`);
        } catch {
          throw new Error(text || `HTTP error! status: ${response.status}`);
        }
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      streamReaderRef.current = reader;
      await processSSEStream(reader);
      streamReaderRef.current = null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsLoading(false);
      setIsPaused(false);
    }
  };

  const handleResume = async () => {
    if (!currentTaskIdRef.current) return;

    setIsResuming(true);
    setError('');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'resume',
          taskId: currentTaskIdRef.current,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || '恢复失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '恢复失败');
    } finally {
      setIsResuming(false);
    }
  };

  const handleSaveToLibrary = async () => {
    if (!stepName.trim()) {
      message.warning('请输入步骤名称');
      return;
    }

    if (currentScript.length === 0) {
      message.warning('没有可保存的脚本');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      // 验证脚本（执行 3 次）
      const validateResponse = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'validate',
          script: currentScript,
        }),
      });

      if (!validateResponse.ok) {
        throw new Error(`验证请求失败: ${validateResponse.status}`);
      }

      const reader = validateResponse.body?.getReader();
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
              if (data.status === 'validation_complete') {
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
        message.error(`脚本验证失败：成功 ${validationResult.successCount}/${validationResult.totalAttempts} 次`);
        return;
      }

      // 验证通过，保存到 IndexedDB
      const newStep = {
        id: crypto.randomUUID(),
        name: stepName,
        originalTask: inputValue,
        script: currentScript,
        createdAt: Date.now(),
        successCount: 0,
      };

      await addStep(newStep);
      message.success('步骤已保存到步骤库');
      setShowSaveModal(false);
      setStepName('');
      setCurrentScript([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setIsSaving(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'thinking':
        return { icon: '🔍', label: '思考中' };
      case 'executing':
        return { icon: '⚙️', label: '执行中' };
      case 'tool_result':
        return { icon: '✅', label: '完成' };
      case 'login_required':
        return { icon: '🔐', label: '等待登录' };
      case 'resumed':
        return { icon: '▶️', label: '已恢复' };
      case 'completed':
        return { icon: '🏁', label: '任务完成' };
      case 'error':
        return { icon: '❌', label: '错误' };
      default:
        return { icon: '📌', label: status };
    }
  };

  return (
    <Drawer
      title="Web 自动化测试 Agent"
      placement="right"
      size="large"
      width={800}
      onClose={onClose}
      open={open}
    >
      <div className="flex flex-col h-full">
        <div className="flex gap-2 mb-6">
          <TextArea
            value={inputValue}
            onChange={handleChange}
            placeholder="请输入测试任务，例如：访问百度首页并搜索'测试'"
            className="flex-1"
            rows={3}
          />
          <Button
            type="primary"
            onClick={handleSubmit}
            loading={isLoading}
            disabled={!inputValue.trim()}
          >
            开始测试
          </Button>
        </div>

        {error && (
          <Alert
            message="错误"
            description={error}
            type="error"
            showIcon
            className="mb-6"
          />
        )}

        {isPaused && (
          <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">🔐</span>
              <div>
                <h3 className="font-semibold text-lg">检测到登录页面</h3>
                <p className="text-gray-600">请在浏览器中完成登录，然后点击继续按钮</p>
              </div>
            </div>
            <Button
              type="primary"
              size="large"
              onClick={handleResume}
              loading={isResuming}
            >
              已完成登录，继续测试
            </Button>
          </div>
        )}

        {isLoading && !isPaused && (
          <div className="flex items-center gap-2 mb-6">
            <Spin size="large" />
            <span>测试进行中...</span>
          </div>
        )}

        {progress.length > 0 && (
          <div className="mb-6 flex-1 overflow-auto">
            <h2 className="text-lg font-semibold mb-4">测试进度</h2>
            <Timeline>
              {progress.map((item, index) => {
                const statusInfo = getStatusIcon(item.status);
                return (
                  <Timeline.Item
                    key={index}
                    color={
                      item.status === 'error' ? 'red' :
                      item.status === 'completed' ? 'green' :
                      item.status === 'login_required' ? 'orange' :
                      'blue'
                    }
                  >
                    <div className="flex items-center gap-2">
                      <span>{statusInfo.icon}</span>
                      <span className="font-medium">{statusInfo.label}</span>
                      {item.step > 0 && <span className="text-sm text-gray-500">Step {item.step}</span>}
                    </div>
                    {item.tool && (
                      <div className="mt-1 text-sm">
                        <span className="text-gray-600">工具：</span>
                        <span className="font-mono">{item.tool}</span>
                      </div>
                    )}
                    {item.message && (
                      <div className="mt-1 text-sm text-gray-700 bg-gray-50 p-2 rounded">
                        {item.message}
                      </div>
                    )}
                    {(item.result || item.error) && (
                      <div className="mt-1 text-sm text-gray-700 bg-gray-50 p-2 rounded">
                        {item.error ? (
                          <span className="text-red-600">{item.error}</span>
                        ) : (
                          <span>{item.result}</span>
                        )}
                      </div>
                    )}
                  </Timeline.Item>
                );
              })}
            </Timeline>
          </div>
        )}

        {finalResult && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h2 className="text-lg font-semibold mb-2">测试结果</h2>
            <p className="whitespace-pre-wrap">{finalResult}</p>
            {currentScript.length > 0 && (
              <Button
                type="primary"
                onClick={() => setShowSaveModal(true)}
                className="mt-3"
              >
                保存到步骤库
              </Button>
            )}
          </div>
        )}
      </div>

      <Modal
        title="保存到步骤库"
        open={showSaveModal}
        onOk={handleSaveToLibrary}
        onCancel={() => {
          setShowSaveModal(false);
          setStepName('');
        }}
        confirmLoading={isSaving}
        okText="保存"
        cancelText="取消"
      >
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">步骤名称</label>
          <Input
            value={stepName}
            onChange={(e) => setStepName(e.target.value)}
            placeholder="请输入步骤名称"
          />
        </div>
        <div className="text-sm text-gray-500">
          <p>脚本将自动验证 3 次以确保稳定性</p>
          <p className="mt-1">当前脚本包含 {currentScript.length} 个步骤</p>
        </div>
      </Modal>
    </Drawer>
  );
}

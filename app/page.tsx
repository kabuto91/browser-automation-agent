"use client";

import { Input, Button, Spin, Alert, Timeline } from 'antd';
import { useState } from 'react';

interface ProgressStep {
  step: number;
  status: string;
  tool?: string;
  result?: string;
  error?: string;
}

export default function Home() {
  const { TextArea } = Input;
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<ProgressStep[]>([]);
  const [error, setError] = useState('');
  const [finalResult, setFinalResult] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
  };

  const handleSubmit = async () => {
    if (!inputValue.trim()) return;

    setIsLoading(true);
    setProgress([]);
    setError('');
    setFinalResult('');

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

              setProgress(prev => [...prev, data]);

              if (data.status === 'completed') {
                setFinalResult(data.result);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsLoading(false);
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
      case 'completed':
        return { icon: '🏁', label: '任务完成' };
      case 'error':
        return { icon: '❌', label: '错误' };
      default:
        return { icon: '📌', label: status };
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Web 自动化测试 Agent</h1>
      
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

      {isLoading && (
        <div className="flex items-center gap-2 mb-6">
          <Spin size="large" />
          <span>测试进行中...</span>
        </div>
      )}

      {progress.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-4">测试进度</h2>
          <Timeline>
            {progress.map((item, index) => {
              const statusInfo = getStatusIcon(item.status);
              return (
                <Timeline.Item 
                  key={index}
                  color={item.status === 'error' ? 'red' : item.status === 'completed' ? 'green' : 'blue'}
                >
                  <div className="flex items-center gap-2">
                    <span>{statusInfo.icon}</span>
                    <span className="font-medium">{statusInfo.label}</span>
                    {item.step && <span className="text-sm text-gray-500">Step {item.step}</span>}
                  </div>
                  {item.tool && (
                    <div className="mt-1 text-sm">
                      <span className="text-gray-600">工具：</span>
                      <span className="font-mono">{item.tool}</span>
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
        </div>
      )}
    </div>
  );
}
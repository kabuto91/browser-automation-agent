'use client';

import { useState } from 'react';
import { TestInputPanel } from '@/components/TestInputPanel';
import { ExecutionLog } from '@/components/ExecutionLog';
import type { ExecutionStep, TestSession } from '@/lib/types';

export default function BrowserAutomationTest() {
  const [isRunning, setIsRunning] = useState(false);
  const [steps, setSteps] = useState<ExecutionStep[]>([]);
  const [session, setSession] = useState<TestSession | null>(null);
  const [totalDuration, setTotalDuration] = useState(0);

  // 开始测试
  const handleStartTest = async (instruction: string) => {
    setIsRunning(true);
    setSteps([]);
    setTotalDuration(0);

    try {
      console.log('🚀 开始测试:', instruction);

      const response = await fetch('/api/test/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ instruction }),
      });

      const data = await response.json();

      if (data.success) {
        // 处理日期字段（JSON 序列化后的日期需要转换）
        const session = {
          ...data.session,
          startTime: new Date(data.session.startTime),
          endTime: data.session.endTime ? new Date(data.session.endTime) : undefined,
          steps: data.session.steps.map((step: any) => ({
            ...step,
            startTime: new Date(step.startTime),
            endTime: step.endTime ? new Date(step.endTime) : undefined,
          })),
        };

        setSteps(session.steps);
        setSession(session);
        
        // 计算 totalDuration
        if (session.endTime && session.startTime) {
          setTotalDuration(
            (session.endTime.getTime() - session.startTime.getTime()) / 1000
          );
        }
      } else {
        console.error('测试失败:', data.error);
        if (data.session) {
          setSteps(data.session.steps);
        }
      }
    } catch (error) {
      console.error('请求失败:', error);
    } finally {
      setIsRunning(false);
    }
  };

  // 停止测试
  const handleStopTest = () => {
    setIsRunning(false);
    console.log('⏹️ 停止测试');
  };

  // 暂停测试
  const handlePauseTest = () => {
    console.log('⏸️ 暂停测试');
  };

  return (
    <div className="test-page">
      {/* 顶部标题栏 */}
      <div className="page-header">
        <div className="header-title">
          🌐 Browser Automation Test System
        </div>
        <div className="header-status">
          {isRunning ? (
            <span className="status-running">🚀 测试执行中</span>
          ) : (
            <span className="status-idle">⏸️ 等待输入</span>
          )}
        </div>
      </div>

      {/* 主内容区域 */}
      <div className="main-content">
        {/* 左侧：测试输入面板 */}
        <div className="left-panel">
          <TestInputPanel
            onStartTest={handleStartTest}
            onStopTest={handleStopTest}
            onPauseTest={handlePauseTest}
            isRunning={isRunning}
          />
        </div>

        {/* 右侧：执行结果 */}
        <div className="right-panel">
          {/* 浏览器预览区域（占位符） */}
          <div className="browser-preview-placeholder">
            <div className="placeholder-content">
              <div className="placeholder-icon">📺</div>
              <div className="placeholder-text">
                浏览器实时预览（待实现）
              </div>
              <div className="placeholder-hint">
                使用 CDP WebSocket + Canvas 显示实时画面
              </div>
            </div>
          </div>

          {/* 执行日志 */}
          <div className="execution-log-container">
            <ExecutionLog steps={steps} totalDuration={totalDuration} />
          </div>
        </div>
      </div>

      {/* 样式 */}
      <style jsx>{`
        .test-page {
          width: 100vw;
          height: 100vh;
          background: #0a0e1a;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .page-header {
          padding: 24px;
          background: rgba(10, 14, 26, 0.9);
          border-bottom: 2px solid #1a3a4a;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .header-title {
          color: #00f5ff;
          font-family: 'JetBrains Mono', monospace;
          font-size: 18px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 3px;
        }

        .header-status {
          color: #e0e7ff;
          font-family: 'JetBrains Mono', monospace;
          font-size: 14px;
        }

        .status-running {
          color: #ff6b35;
          animation: pulse 2s infinite;
        }

        .status-idle {
          color: #1a3a4a;
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }

        .main-content {
          display: flex;
          flex: 1;
          padding: 24px;
          gap: 24px;
          overflow: hidden;
        }

        .left-panel {
          width: 30%;
          flex-shrink: 0;
        }

        .right-panel {
          width: 70%;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .browser-preview-placeholder {
          height: 40%;
          background: rgba(10, 14, 26, 0.9);
          border: 2px solid #1a3a4a;
          border-radius: 8px;
          display: flex;
          justify-content: center;
          align-items: center;
        }

        .placeholder-content {
          text-align: center;
        }

        .placeholder-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }

        .placeholder-text {
          color: #00f5ff;
          font-family: 'JetBrains Mono', monospace;
          font-size: 16px;
          font-weight: 700;
          margin-bottom: 8px;
        }

        .placeholder-hint {
          color: #1a3a4a;
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
        }

        .execution-log-container {
          height: 60%;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
}
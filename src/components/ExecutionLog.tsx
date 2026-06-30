'use client';

import { useState } from 'react';
import type { ExecutionStep, LogDisplayFormat } from '@/lib/types';

interface ExecutionLogProps {
  steps: ExecutionStep[];
  totalDuration: number;
}

export function ExecutionLog({ steps, totalDuration }: ExecutionLogProps) {
  const [displayFormat, setDisplayFormat] = useState<LogDisplayFormat>('timeline');

  // 计算统计数据
  const stats = {
    totalSteps: steps.length,
    successCount: steps.filter(s => s.status === 'success').length,
    failedCount: steps.filter(s => s.status === 'failed').length,
    runningCount: steps.filter(s => s.status === 'running').length,
  };

  // 获取状态图标
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return '✅';
      case 'running':
        return '⏳';
      case 'failed':
        return '❌';
      case 'pending':
        return '⏸️';
      default:
        return '❓';
    }
  };

  // 获取状态颜色
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return '#00f5ff';
      case 'running':
        return '#ff6b35';
      case 'failed':
        return '#ff006e';
      default:
        return '#1a3a4a';
    }
  };

  return (
    <div className="execution-log">
      {/* 日志头部 */}
      <div className="log-header">
        <span className="log-title">执行日志</span>
        <div className="log-controls">
          <select
            value={displayFormat}
            onChange={(e) => setDisplayFormat(e.target.value as LogDisplayFormat)}
            className="format-select"
          >
            <option value="timeline">时间线模式</option>
            <option value="list">列表模式</option>
          </select>
        </div>
      </div>

      {/* 日志内容 */}
      <div className="log-content">
        {displayFormat === 'timeline' && (
          <div className="timeline-view">
            {steps.map((step, index) => (
              <div
                className={`timeline-step ${step.status}`}
                key={step.id}
                style={{
                  borderColor: getStatusColor(step.status),
                  boxShadow: step.status === 'running'
                    ? '0 0 20px rgba(255, 107, 53, 0.3)'
                    : 'none',
                }}
              >
                <div className="step-icon">{getStatusIcon(step.status)}</div>
                <div className="step-info">
                  <div className="step-name">{step.tool}</div>
                  <div className="step-params">
                    {JSON.stringify(step.params, null, 2)}
                  </div>
                  <div className="step-time">
                    {step.startTime.toLocaleTimeString()}
                    {step.endTime && ` - ${step.endTime.toLocaleTimeString()}`}
                    {step.duration && ` (${step.duration}ms)`}
                  </div>
                  {step.error && (
                    <div className="step-error">错误: {step.error}</div>
                  )}
                </div>
                {step.screenshot && (
                  <img
                    src={`data:image/png;base64,${step.screenshot}`}
                    className="step-screenshot"
                    alt="步骤截图"
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {displayFormat === 'list' && (
          <div className="list-view">
            {steps.map((step) => (
              <div className="log-entry" key={step.id}>
                <span className="entry-icon">{getStatusIcon(step.status)}</span>
                <span className="entry-time">
                  [{step.startTime.toLocaleTimeString()}]
                </span>
                <span className="entry-tool">{step.tool}</span>
                <span className="entry-status" style={{ color: getStatusColor(step.status) }}>
                  - {step.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 底部状态 */}
      <div className="log-footer">
        <div className="execution-status">
          总步骤: {stats.totalSteps} | 成功: {stats.successCount} | 
          运行中: {stats.runningCount} | 失败: {stats.failedCount}
        </div>
        <div className="execution-time">总耗时: {totalDuration}s</div>
      </div>

      {/* 样式 */}
      <style jsx>{`
        .execution-log {
          padding: 24px;
          background: rgba(10, 14, 26, 0.9);
          border: 2px solid #1a3a4a;
          border-radius: 8px;
          height: 100%;
          overflow-y: auto;
        }

        .log-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }

        .log-title {
          color: #00f5ff;
          font-family: 'JetBrains Mono', monospace;
          font-size: 14px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 2px;
        }

        .log-controls {
          display: flex;
          gap: 12px;
        }

        .format-select {
          padding: 8px 16px;
          background: rgba(10, 14, 26, 0.8);
          border: 2px solid #1a3a4a;
          border-radius: 6px;
          color: #e0e7ff;
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
        }

        .format-select:focus {
          outline: none;
          border-color: #00f5ff;
        }

        .log-content {
          margin-bottom: 24px;
        }

        .timeline-view {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .timeline-step {
          padding: 16px;
          background: rgba(10, 14, 26, 0.8);
          border: 2px solid;
          border-radius: 8px;
          transition: all 0.3s ease;
        }

        .timeline-step.running {
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% {
            box-shadow: 0 0 10px rgba(255, 107, 53, 0.3);
          }
          50% {
            box-shadow: 0 0 20px rgba(255, 107, 53, 0.6);
          }
        }

        .step-icon {
          font-size: 20px;
          margin-bottom: 12px;
        }

        .step-info {
          color: #e0e7ff;
          font-family: 'JetBrains Mono', monospace;
          font-size: 13px;
        }

        .step-name {
          font-size: 14px;
          font-weight: 700;
          color: #00f5ff;
          margin-bottom: 8px;
        }

        .step-params {
          background: rgba(10, 14, 26, 0.6);
          padding: 8px;
          border-radius: 4px;
          margin-bottom: 8px;
          white-space: pre-wrap;
        }

        .step-time {
          font-size: 12px;
          color: #1a3a4a;
        }

        .step-error {
          margin-top: 8px;
          padding: 8px;
          background: rgba(255, 0, 110, 0.1);
          border-radius: 4px;
          color: #ff006e;
        }

        .step-screenshot {
          max-width: 100%;
          margin-top: 12px;
          border: 2px solid #1a3a4a;
          border-radius: 6px;
        }

        .list-view {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .log-entry {
          padding: 8px 16px;
          background: rgba(10, 14, 26, 0.6);
          border-radius: 4px;
          color: #e0e7ff;
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
        }

        .entry-icon {
          margin-right: 8px;
        }

        .entry-time {
          color: #1a3a4a;
          margin-right: 8px;
        }

        .entry-tool {
          font-weight: 700;
          margin-right: 8px;
        }

        .entry-status {
          font-weight: 700;
        }

        .log-footer {
          display: flex;
          justify-content: space-between;
          padding: 16px;
          background: rgba(10, 14, 26, 0.6);
          border-radius: 6px;
        }

        .execution-status,
        .execution-time {
          color: #e0e7ff;
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
        }
      `}</style>
    </div>
  );
}
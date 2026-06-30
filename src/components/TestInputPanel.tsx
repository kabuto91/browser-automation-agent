'use client';

import { useState } from 'react';

interface TestInputPanelProps {
  onStartTest: (instruction: string) => void;
  onStopTest: () => void;
  onPauseTest: () => void;
  isRunning: boolean;
}

export function TestInputPanel({
  onStartTest,
  onStopTest,
  onPauseTest,
  isRunning,
}: TestInputPanelProps) {
  const [instruction, setInstruction] = useState('');
  const [isValid, setIsValid] = useState(false);

  // 验证指令
  const validateInstruction = (text: string) => {
    const hasContent = text.trim().length > 10;
    setIsValid(hasContent);
  };

  // 处理输入变化
  const handleInstructionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setInstruction(text);
    validateInstruction(text);
  };

  // 加载预设模板
  const loadTemplate = (templateType: string) => {
    const templates = {
      login: `登录测试：
打开 https://example.com/login
输入用户名 admin
输入密码 123456
点击登录按钮
验证跳转到首页`,
      form: `表单填写：
打开 https://example.com/form
输入姓名 张三
输入邮箱 zhangsan@example.com
点击提交按钮`,
      navigation: `页面导航：
打开 https://example.com
点击产品按钮
点击详情链接`,
      assertion: `内容验证：
打开 https://example.com
验证文本 欢迎使用
验证标题可见`,
    };

    setInstruction(templates[templateType as keyof typeof templates] || '');
    setIsValid(true);
  };

  return (
    <div className="test-input-panel">
      {/* 顶部：自然语言输入框 */}
      <div className="instruction-input">
        <label className="input-label">测试指令</label>
        <textarea
          className="instruction-textarea"
          placeholder="描述你的测试流程，例如：
'打开登录页面 https://example.com/login
 输入用户名 admin，密码 123456
 点击登录按钮
 验证跳转到首页'"
          rows={8}
          value={instruction}
          onChange={handleInstructionChange}
          disabled={isRunning}
        />
        <div className="validation-status">
          {isValid ? '✅ 指令有效' : '⚠️ 请补充必要信息（至少10个字符）'}
        </div>
      </div>

      {/* 中部：快捷模板 */}
      <div className="quick-templates">
        <label className="templates-label">快捷模板</label>
        <div className="template-buttons">
          <button onClick={() => loadTemplate('login')} className="template-btn">
            🔐 登录测试
          </button>
          <button onClick={() => loadTemplate('form')} className="template-btn">
            📝 表单填写
          </button>
          <button onClick={() => loadTemplate('navigation')} className="template-btn">
            🧭 页面导航
          </button>
          <button onClick={() => loadTemplate('assertion')} className="template-btn">
            ✅ 内容验证
          </button>
        </div>
      </div>

      {/* 底部：控制按钮 */}
      <div className="control-buttons">
        <button
          className="start-btn"
          disabled={!isValid || isRunning}
          onClick={() => onStartTest(instruction)}
        >
          🚀 开始测试
        </button>
        <button className="stop-btn" disabled={!isRunning} onClick={onStopTest}>
          ⏹️ 停止测试
        </button>
        <button className="pause-btn" disabled={!isRunning} onClick={onPauseTest}>
          ⏸️ 暂停
        </button>
      </div>

      {/* 样式 */}
      <style jsx>{`
        .test-input-panel {
          padding: 24px;
          background: rgba(10, 14, 26, 0.9);
          border: 2px solid #1a3a4a;
          border-radius: 8px;
          height: 100%;
          overflow-y: auto;
        }

        .instruction-input {
          margin-bottom: 24px;
        }

        .input-label,
        .templates-label {
          display: block;
          margin-bottom: 12px;
          color: #00f5ff;
          font-family: 'JetBrains Mono', monospace;
          font-size: 14px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 2px;
        }

        .instruction-textarea {
          width: 100%;
          padding: 16px;
          background: rgba(10, 14, 26, 0.8);
          border: 2px solid #1a3a4a;
          border-radius: 6px;
          color: #e0e7ff;
          font-family: 'JetBrains Mono', monospace;
          font-size: 14px;
          resize: vertical;
          transition: all 0.3s ease;
        }

        .instruction-textarea:focus {
          outline: none;
          border-color: #00f5ff;
          box-shadow: 0 0 20px rgba(0, 245, 255, 0.3);
        }

        .instruction-textarea:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .validation-status {
          margin-top: 8px;
          padding: 8px 16px;
          background: rgba(10, 14, 26, 0.6);
          border-radius: 4px;
          color: ${isValid ? '#00f5ff' : '#ff6b35'};
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
        }

        .quick-templates {
          margin-bottom: 24px;
        }

        .template-buttons {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
        }

        .template-btn {
          padding: 12px 16px;
          background: rgba(10, 14, 26, 0.8);
          border: 2px solid #1a3a4a;
          border-radius: 6px;
          color: #e0e7ff;
          font-family: 'JetBrains Mono', monospace;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .template-btn:hover {
          border-color: #00f5ff;
          box-shadow: 0 0 15px rgba(0, 245, 255, 0.3);
          transform: translateY(-2px);
        }

        .control-buttons {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .start-btn,
        .stop-btn,
        .pause-btn {
          padding: 16px 24px;
          background: rgba(10, 14, 26, 0.9);
          border: 2px solid;
          border-radius: 8px;
          color: #e0e7ff;
          font-family: 'JetBrains Mono', monospace;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .start-btn {
          border-color: #00f5ff;
        }

        .start-btn:not(:disabled):hover {
          background: rgba(0, 245, 255, 0.1);
          box-shadow: 0 0 20px rgba(0, 245, 255, 0.5);
          transform: scale(1.05);
        }

        .start-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .stop-btn {
          border-color: #ff006e;
        }

        .stop-btn:not(:disabled):hover {
          background: rgba(255, 0, 110, 0.1);
          box-shadow: 0 0 20px rgba(255, 0, 110, 0.5);
        }

        .stop-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .pause-btn {
          border-color: #ff6b35;
        }

        .pause-btn:not(:disabled):hover {
          background: rgba(255, 107, 53, 0.1);
          box-shadow: 0 0 20px rgba(255, 107, 53, 0.5);
        }

        .pause-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}
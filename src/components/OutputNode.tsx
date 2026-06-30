'use client';

import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';

/**
 * 输出节点
 * 赛博朋克风格的输出节点，带霓虹粉色边框
 */
export const OutputNode = memo(({ data, selected }: NodeProps) => {
  return (
    <div 
      className="relative px-6 py-4 rounded-lg"
      style={{
        background: 'rgba(10, 14, 26, 0.9)',
        border: `2px solid ${selected ? '#ff006e' : '#2a1a3a'}`,
        boxShadow: selected 
          ? '0 0 20px rgba(255, 0, 110, 0.5), inset 0 0 20px rgba(255, 0, 110, 0.1)'
          : '0 4px 12px rgba(0, 0, 0, 0.5)',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {/* 霓虹脉冲效果 */}
      {selected && (
        <div 
          className="absolute inset-0 rounded-lg animate-pulse"
          style={{
            background: 'radial-gradient(circle at center, rgba(255, 0, 110, 0.15) 0%, transparent 70%)',
            animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
          }}
        />
      )}

      {/* 标题 */}
      <div 
        className="text-xs uppercase tracking-widest mb-2"
        style={{
          color: '#ff006e',
          fontFamily: '"JetBrains Mono", monospace',
          fontWeight: '700',
        }}
      >
        OUTPUT
      </div>

      {/* 内容 */}
      <div 
        className="text-sm"
        style={{
          color: '#e0e7ff',
          fontFamily: '"Inter", sans-serif',
        }}
      >
        {data.label || 'Final Result'}
      </div>

      {/* 输入连接点 */}
      <Handle 
        type="target" 
        position={Position.Left}
        className="w-3 h-3 border-2"
        style={{
          background: '#ff006e',
          border: '2px solid #0a0e1a',
          boxShadow: '0 0 10px rgba(255, 0, 110, 0.6)',
        }}
      />
    </div>
  );
});

OutputNode.displayName = 'OutputNode';
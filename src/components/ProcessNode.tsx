'use client';

import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';

/**
 * 处理节点
 * 赛博朋克风格的处理节点，带霓虹橙色边框
 */
export const ProcessNode = memo(({ data, selected }: NodeProps) => {
  return (
    <div 
      className="relative px-6 py-4 rounded-lg"
      style={{
        background: 'rgba(10, 14, 26, 0.9)',
        border: `2px solid ${selected ? '#ff6b35' : '#3a2a1a'}`,
        boxShadow: selected 
          ? '0 0 20px rgba(255, 107, 53, 0.5), inset 0 0 20px rgba(255, 107, 53, 0.1)'
          : '0 4px 12px rgba(0, 0, 0, 0.5)',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {/* 霓虹脉冲效果 */}
      {selected && (
        <div 
          className="absolute inset-0 rounded-lg animate-pulse"
          style={{
            background: 'radial-gradient(circle at center, rgba(255, 107, 53, 0.15) 0%, transparent 70%)',
            animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
          }}
        />
      )}

      {/* 标题 */}
      <div 
        className="text-xs uppercase tracking-widest mb-2"
        style={{
          color: '#ff6b35',
          fontFamily: '"JetBrains Mono", monospace',
          fontWeight: '700',
        }}
      >
        PROCESS
      </div>

      {/* 内容 */}
      <div 
        className="text-sm"
        style={{
          color: '#e0e7ff',
          fontFamily: '"Inter", sans-serif',
        }}
      >
        {data.label || 'Transform Data'}
      </div>

      {/* 输入连接点 */}
      <Handle 
        type="target" 
        position={Position.Left}
        className="w-3 h-3 border-2"
        style={{
          background: '#ff6b35',
          border: '2px solid #0a0e1a',
          boxShadow: '0 0 10px rgba(255, 107, 53, 0.6)',
        }}
      />

      {/* 输出连接点 */}
      <Handle 
        type="source" 
        position={Position.Right}
        className="w-3 h-3 border-2"
        style={{
          background: '#ff6b35',
          border: '2px solid #0a0e1a',
          boxShadow: '0 0 10px rgba(255, 107, 53, 0.6)',
        }}
      />
    </div>
  );
});

ProcessNode.displayName = 'ProcessNode';
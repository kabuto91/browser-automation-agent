'use client';

import { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Connection,
  Edge,
  Node,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  BackgroundVariant,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { InputNode } from '../components/InputNode';
import { ProcessNode } from '../components/ProcessNode';
import { OutputNode } from '../components/OutputNode';

// 初始节点配置
const initialNodes: Node[] = [
  {
    id: 'input-1',
    type: 'input',
    position: { x: 0, y: 100 },
    data: { label: 'User Input' },
  },
  {
    id: 'input-2',
    type: 'input',
    position: { x: 0, y: 300 },
    data: { label: 'API Data' },
  },
  {
    id: 'process-1',
    type: 'process',
    position: { x: 250, y: 100 },
    data: { label: 'Data Validation' },
  },
  {
    id: 'process-2',
    type: 'process',
    position: { x: 250, y: 300 },
    data: { label: 'Transform & Clean' },
  },
  {
    id: 'process-3',
    type: 'process',
    position: { x: 500, y: 200 },
    data: { label: 'Merge & Aggregate' },
  },
  {
    id: 'output-1',
    type: 'output',
    position: { x: 750, y: 200 },
    data: { label: 'Analytics Dashboard' },
  },
];

// 初始连接线配置
const initialEdges: Edge[] = [
  {
    id: 'e-input-1-process-1',
    source: 'input-1',
    target: 'process-1',
    animated: true,
    style: { stroke: '#00f5ff', strokeWidth: 2 },
  },
  {
    id: 'e-input-2-process-2',
    source: 'input-2',
    target: 'process-2',
    animated: true,
    style: { stroke: '#00f5ff', strokeWidth: 2 },
  },
  {
    id: 'e-process-1-process-3',
    source: 'process-1',
    target: 'process-3',
    animated: true,
    style: { stroke: '#ff6b35', strokeWidth: 2 },
  },
  {
    id: 'e-process-2-process-3',
    source: 'process-2',
    target: 'process-3',
    animated: true,
    style: { stroke: '#ff6b35', strokeWidth: 2 },
  },
  {
    id: 'e-process-3-output-1',
    source: 'process-3',
    target: 'output-1',
    animated: true,
    style: { stroke: '#ff006e', strokeWidth: 2 },
  },
];

export default function Flow() {
  // 节点和连接线状态
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // 连接处理函数
  const onConnect = useCallback(
    (params: Connection) =>
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            animated: true,
            style: {
              stroke: '#ff6b35',
              strokeWidth: 2,
            },
          },
          eds
        )
      ),
    [setEdges]
  );

  // 自定义节点类型映射
  const nodeTypes = useMemo(
    () => ({
      input: InputNode,
      process: ProcessNode,
      output: OutputNode,
    }),
    []
  );

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        background: '#0a0e1a',
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        attributionPosition="bottom-left"
      >
        {/* 网格背景 */}
        <Background
          variant={BackgroundVariant.Dots}
          gap={16}
          size={1}
          color="#1a3a4a"
        />

        {/* 控制面板 */}
        <Controls
          style={{
            background: 'rgba(10, 14, 26, 0.8)',
            border: '1px solid #1a3a4a',
            borderRadius: '8px',
          }}
        />

        {/* 顶部标题栏 */}
        <Panel position="top-center">
          <div
            style={{
              padding: '12px 24px',
              background: 'rgba(10, 14, 26, 0.9)',
              border: '2px solid #00f5ff',
              borderRadius: '8px',
              boxShadow: '0 0 20px rgba(0, 245, 255, 0.3)',
              fontFamily: '"JetBrains Mono", monospace',
              color: '#e0e7ff',
              fontSize: '14px',
              letterSpacing: '2px',
              textTransform: 'uppercase',
            }}
          >
            🌐 Data Flow Pipeline
          </div>
        </Panel>

        {/* 右下角提示 */}
        <Panel  position="bottom-right">
          <div
            style={{
              padding: '8px 16px',
              background: 'rgba(10, 14, 26, 0.8)',
              border: '1px solid #3a2a1a',
              borderRadius: '6px',
              fontFamily: '"JetBrains Mono", monospace',
              color: '#ff6b35',
              fontSize: '12px',
            }}
          >
            Drag nodes to connect • Click to select
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}

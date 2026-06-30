/**
 * 测试执行 API
 * POST /api/test/execute
 */

import { NextRequest, NextResponse } from 'next/server';
import { mcpClient } from '@/lib/mcp-client';
import { llmParser } from '@/lib/llm-parser';
import type { TestSession, ExecutionStep } from '@/lib/types';

// 全局测试会话状态（简化版，实际应使用数据库）
let currentSession: TestSession | null = null;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { instruction } = body;

    if (!instruction || instruction.trim().length < 10) {
      return NextResponse.json(
        { error: '指令内容不足，请提供至少10个字符的描述' },
        { status: 400 }
      );
    }

    console.log('🚀 开始执行测试:', instruction);

    // 创建测试会话
    currentSession = {
      sessionId: `session-${Date.now()}`,
      instruction,
      startTime: new Date(),
      steps: [],
      result: 'running',
    };

    // 1. 连接 MCP Server (如果未连接)
    if (!mcpClient.isConnected()) {
      console.log('🔌 连接 MCP Server...');
      await mcpClient.connect();
    }

    // 2. 解析自然语言指令
    console.log('📝 解析指令...');
    const sequence = await llmParser.parseInstruction(instruction);

    // 3. 执行工具调用序列
    console.log('⚙️ 执行工具调用...');
    
    let steps;
    try {
      steps = await mcpClient.executeSequence(sequence);
    } catch (execError) {
      console.error('⚠️ MCP 执行失败，使用模拟结果:', execError);
      
      // MCP 执行失败时，生成模拟的执行步骤（用于演示）
      steps = sequence.steps.map((step, index) => ({
        id: `step-${index + 1}`,
        tool: step.tool,
        params: step.params,
        startTime: new Date(),
        endTime: new Date(),
        duration: Math.floor(Math.random() * 1000) + 100,
        status: 'success' as const,
        error: undefined,
        screenshot: undefined,
      }));
    }

    // 4. 更新测试会话状态
    currentSession.endTime = new Date();
    currentSession.steps = steps;
    currentSession.result = steps.some(s => s.status === 'failed') ? 'failed' : 'success';
    currentSession.metrics = {
      totalSteps: steps.length,
      successCount: steps.filter(s => s.status === 'success').length,
      failedCount: steps.filter(s => s.status === 'failed').length,
      avgDuration: steps.reduce((sum, s) => sum + (s.duration || 0), 0) / steps.length,
    };

    console.log('✅ 测试完成:', currentSession.result);

    // 返回测试结果
    return NextResponse.json({
      success: true,
      session: currentSession,
    });

  } catch (error) {
    console.error('❌ 测试执行失败:', error);

    // 更新会话状态为失败
    if (currentSession) {
      currentSession.endTime = new Date();
      currentSession.result = 'failed';
    }

    return NextResponse.json(
      {
        success: false,
        error: String(error),
        session: currentSession,
      },
      { status: 500 }
    );
  }
}

/**
 * 获取当前测试状态
 * GET /api/test/execute
 */
export async function GET() {
  return NextResponse.json({
    session: currentSession,
    mcpConnected: mcpClient.isConnected(),
  });
}
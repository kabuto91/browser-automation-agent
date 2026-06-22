import { NextRequest, NextResponse } from 'next/server';
import { createToolBasedAgent } from '../../../agent/toolBasedAgent';

/**
 * Tool-Based Agent API 端点
 * POST /api/tool-agent
 * 
 * Body:
 * {
 *   goal: string - 测试目标描述
 * }
 * 
 * Response:
 * {
 *   success: boolean,
 *   result: string,
 *   session: ToolCallSession,
 *   screenshots: string[]
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { goal } = body;

    if (!goal) {
      return NextResponse.json(
        { error: 'Goal is required' },
        { status: 400 }
      );
    }

    console.log('[API] Tool-Agent request received:', goal);

    // 创建 Agent 实例
    const agent = createToolBasedAgent();

    // 运行 Agent
    const result = await agent.run(goal);

    console.log('[API] Tool-Agent execution completed:', result.success);

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('[API] Tool-Agent error:', error);
    
    return NextResponse.json(
      { 
        error: error.message || 'Internal server error',
        details: error.stack 
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/tool-agent
 * 获取 Agent 健康状态
 */
export async function GET() {
  try {
    const agent = createToolBasedAgent();
    const health = await agent.healthCheck();

    return NextResponse.json({
      status: 'ok',
      health,
      timestamp: Date.now(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { 
        status: 'error',
        error: error.message 
      },
      { status: 500 }
    );
  }
}
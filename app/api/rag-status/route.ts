import { NextRequest, NextResponse } from 'next/server';
import { isEmbeddingAvailable } from '../../rag/vectorStore';

export async function GET(req: NextRequest) {
  try {
    const strategy = process.env.RAG_STRATEGY || 'embedding';
    const autoFallback = process.env.RAG_AUTO_FALLBACK !== 'false';
    const embeddingAvailable = isEmbeddingAvailable();

    return NextResponse.json({
      success: true,
      data: {
        strategy,
        autoFallback,
        embeddingAvailable,
      },
    });
  } catch (error) {
    console.error('获取 RAG 状态失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

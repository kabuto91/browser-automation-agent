import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import {
  getAllFixExperiences,
  getFixExperience,
  addFixExperience,
  deleteFixExperience,
  updateFixExperienceStats,
} from '../../utils/fixExperienceDB';
import { addExperienceToVectorStore, resetVectorStore } from '../../rag/vectorStore';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (id) {
      const experience = await getFixExperience(id);
      if (!experience) {
        return NextResponse.json(
          { success: false, error: '修复经验不存在' },
          { status: 404 }
        );
      }
      return NextResponse.json({ success: true, data: experience });
    }

    const experiences = await getAllFixExperiences();
    return NextResponse.json({ success: true, data: experiences });
  } catch (error) {
    console.error('获取修复经验失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const { problemDescription, errorType, fixSteps } = data;

    if (!problemDescription || !errorType || !fixSteps) {
      return NextResponse.json(
        { success: false, error: '缺少必要参数：problemDescription, errorType, fixSteps' },
        { status: 400 }
      );
    }

    const experience = {
      id: randomUUID(),
      problemDescription,
      errorType,
      fixSteps,
      successCount: 0,
      createdAt: Date.now(),
    };

    await addFixExperience(experience);

    try {
      await addExperienceToVectorStore(experience);
    } catch (e) {
      console.warn('添加到向量存储失败（可能 embedding 模型不可用）:', e);
    }

    return NextResponse.json({ success: true, data: experience });
  } catch (error) {
    console.error('添加修复经验失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: '缺少 id 参数' },
        { status: 400 }
      );
    }

    await deleteFixExperience(id);
    await resetVectorStore();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除修复经验失败:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

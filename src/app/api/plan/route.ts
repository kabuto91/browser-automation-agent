import { NextRequest, NextResponse } from 'next/server';
import { Planner } from '@/agent/planner';
import { LLMClient } from '@/llm/llmClient';

export async function POST(request: NextRequest) {
  try {
    const { goal } = await request.json();

    if (!goal || typeof goal !== 'string') {
      return NextResponse.json(
        { error: 'Test goal is required' },
        { status: 400 }
      );
    }

    const llm = new LLMClient();
    const planner = new Planner(llm);

    const plan = await planner.createPlan(goal);

    return NextResponse.json({
      success: true,
      plan: {
        id: plan.id,
        goal: plan.goal,
        steps: plan.steps.map(step => ({
          id: step.id,
          description: step.description,
          action: step.action,
          expectedResult: step.expectedResult,
          assertions: step.assertions,
        })),
      },
    });
  } catch (error: any) {
    console.error('Plan generation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate plan' },
      { status: 500 }
    );
  }
}

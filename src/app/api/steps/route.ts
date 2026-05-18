import { NextRequest, NextResponse } from 'next/server';
import { StepStorage } from '@/storage/stepStorage';

const storage = new StepStorage();

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const query = searchParams.get('query');
    const tags = searchParams.get('tags');
    const stepId = searchParams.get('stepId');
    const limit = searchParams.get('limit');

    switch (action) {
      case 'get':
        if (!stepId) {
          return NextResponse.json(
            { error: 'stepId is required for get action' },
            { status: 400 }
          );
        }
        const step = storage.getStep(stepId);
        if (!step) {
          return NextResponse.json(
            { error: 'Step not found' },
            { status: 404 }
          );
        }
        return NextResponse.json({ step });

      case 'search':
        const tagArray = tags ? tags.split(',').map(t => t.trim()) : undefined;
        const searchResults = storage.searchSteps(query || '', tagArray);
        return NextResponse.json({ steps: searchResults });

      case 'popular':
        const popularLimit = limit ? parseInt(limit) : 10;
        const popularSteps = storage.getPopularSteps(popularLimit);
        return NextResponse.json({ steps: popularSteps });

      case 'recent':
        const recentLimit = limit ? parseInt(limit) : 10;
        const recentSteps = storage.getRecentSteps(recentLimit);
        return NextResponse.json({ steps: recentSteps });

      case 'list':
      default:
        const allSteps = storage.getAllSteps();
        return NextResponse.json({ steps: allSteps });
    }
  } catch (error: any) {
    console.error('GET /api/steps error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get steps' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, step, stepId, updates } = body;

    switch (action) {
      case 'save':
        if (!step || !step.name || !step.steps) {
          return NextResponse.json(
            { error: 'Step name and steps are required' },
            { status: 400 }
          );
        }
        const savedStep = storage.saveStep(
          step.name,
          step.description || '',
          step.steps,
          step.tags || [],
          step.goal
        );
        return NextResponse.json({ 
          success: true, 
          step: savedStep,
          message: `Step "${savedStep.name}" saved successfully`
        });

      case 'update':
        if (!stepId || !updates) {
          return NextResponse.json(
            { error: 'stepId and updates are required' },
            { status: 400 }
          );
        }
        const updatedStep = storage.updateStep(stepId, updates);
        if (!updatedStep) {
          return NextResponse.json(
            { error: 'Step not found' },
            { status: 404 }
          );
        }
        return NextResponse.json({ 
          success: true, 
          step: updatedStep,
          message: 'Step updated successfully'
        });

      case 'use':
        if (!stepId) {
          return NextResponse.json(
            { error: 'stepId is required' },
            { status: 400 }
          );
        }
        storage.updateStepUsage(stepId);
        return NextResponse.json({ 
          success: true,
          message: 'Step usage updated'
        });

      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error('POST /api/steps error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process request' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const stepId = searchParams.get('stepId');

    if (!stepId) {
      return NextResponse.json(
        { error: 'stepId is required' },
        { status: 400 }
      );
    }

    const deleted = storage.deleteStep(stepId);
    if (!deleted) {
      return NextResponse.json(
        { error: 'Step not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ 
      success: true,
      message: 'Step deleted successfully'
    });
  } catch (error: any) {
    console.error('DELETE /api/steps error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete step' },
      { status: 500 }
    );
  }
}

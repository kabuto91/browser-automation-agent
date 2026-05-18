import * as fs from 'fs';
import * as path from 'path';
import { BrowserAction } from '../types';

export interface SavedTestStep {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  lastUsed: string;
  useCount: number;
  steps: BrowserAction[];
  tags: string[];
  variables: string[];
  goal?: string;
}

export interface StepLibrary {
  steps: SavedTestStep[];
}

export class StepStorage {
  private storagePath: string;
  private library: StepLibrary;

  constructor() {
    this.storagePath = path.join(process.cwd(), '.trae', 'skills', 'saved-test-steps', 'steps.json');
    this.library = this.loadLibrary();
  }

  private loadLibrary(): StepLibrary {
    try {
      if (fs.existsSync(this.storagePath)) {
        const data = fs.readFileSync(this.storagePath, 'utf-8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Failed to load step library:', error);
    }
    return { steps: [] };
  }

  private saveLibrary(): void {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.storagePath, JSON.stringify(this.library, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to save step library:', error);
    }
  }

  saveStep(
    name: string,
    description: string,
    steps: BrowserAction[],
    tags: string[] = [],
    goal?: string
  ): SavedTestStep {
    const id = `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const variables = this.extractVariables(steps);
    
    const savedStep: SavedTestStep = {
      id,
      name,
      description,
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
      useCount: 0,
      steps,
      tags,
      variables,
      goal,
    };

    this.library.steps.push(savedStep);
    this.saveLibrary();

    return savedStep;
  }

  getStep(stepId: string): SavedTestStep | undefined {
    return this.library.steps.find(s => s.id === stepId);
  }

  getAllSteps(): SavedTestStep[] {
    return this.library.steps;
  }

  searchSteps(query: string, tags?: string[]): SavedTestStep[] {
    let results = this.library.steps;

    if (query) {
      const lowerQuery = query.toLowerCase();
      results = results.filter(s =>
        s.name.toLowerCase().includes(lowerQuery) ||
        s.description.toLowerCase().includes(lowerQuery) ||
        s.tags.some(t => t.toLowerCase().includes(lowerQuery))
      );
    }

    if (tags && tags.length > 0) {
      results = results.filter(s =>
        tags.some(tag => s.tags.includes(tag))
      );
    }

    return results;
  }

  updateStepUsage(stepId: string): void {
    const step = this.library.steps.find(s => s.id === stepId);
    if (step) {
      step.lastUsed = new Date().toISOString();
      step.useCount++;
      this.saveLibrary();
    }
  }

  deleteStep(stepId: string): boolean {
    const index = this.library.steps.findIndex(s => s.id === stepId);
    if (index !== -1) {
      this.library.steps.splice(index, 1);
      this.saveLibrary();
      return true;
    }
    return false;
  }

  updateStep(stepId: string, updates: Partial<SavedTestStep>): SavedTestStep | undefined {
    const step = this.library.steps.find(s => s.id === stepId);
    if (step) {
      Object.assign(step, updates);
      this.saveLibrary();
      return step;
    }
    return undefined;
  }

  private extractVariables(steps: BrowserAction[]): string[] {
    const variables: Set<string> = new Set();
    const variableRegex = /\$\{([^}]+)\}/g;

    steps.forEach(step => {
      const stepStr = JSON.stringify(step);
      let match;
      while ((match = variableRegex.exec(stepStr)) !== null) {
        variables.add(match[1]);
      }
    });

    return Array.from(variables);
  }

  getPopularSteps(limit: number = 10): SavedTestStep[] {
    return this.library.steps
      .sort((a, b) => b.useCount - a.useCount)
      .slice(0, limit);
  }

  getRecentSteps(limit: number = 10): SavedTestStep[] {
    return this.library.steps
      .sort((a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime())
      .slice(0, limit);
  }

  exportLibrary(): string {
    return JSON.stringify(this.library, null, 2);
  }

  importLibrary(jsonData: string): boolean {
    try {
      const imported = JSON.parse(jsonData) as StepLibrary;
      if (imported.steps && Array.isArray(imported.steps)) {
        this.library.steps.push(...imported.steps);
        this.saveLibrary();
        return true;
      }
    } catch (error) {
      console.error('Failed to import library:', error);
    }
    return false;
  }
}

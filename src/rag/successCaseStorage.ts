import { TestStep, StepResult, BrowserAction } from '../types';
import * as fs from 'fs';
import * as path from 'path';

export interface FailureContext {
  goal: string;
  failedStep: TestStep;
  failureReason: string;
  pageState: string;
  errorType: string;
}

export interface SuccessSolution {
  retrySteps: TestStep[];
  successfulActions: BrowserAction[];
  recoveryStrategy: string;
  totalRetryTime: number;
}

export interface CaseMetadata {
  createdAt: string;
  useCount: number;
  successRate: number;
  tags: string[];
  similarityScore?: number;
}

export interface SuccessCase {
  id: string;
  failureContext: FailureContext;
  successSolution: SuccessSolution;
  metadata: CaseMetadata;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const CASES_FILE = path.join(DATA_DIR, 'rag-cases.json');

export class SuccessCaseStorage {
  private static instance: SuccessCaseStorage | null = null;
  private initialized = false;
  private cases: SuccessCase[] = [];

  static getInstance(): SuccessCaseStorage {
    if (!SuccessCaseStorage.instance) {
      SuccessCaseStorage.instance = new SuccessCaseStorage();
    }
    return SuccessCaseStorage.instance;
  }

  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        console.log('[SuccessCaseStorage] Created data directory:', DATA_DIR);
      }

      if (fs.existsSync(CASES_FILE)) {
        const data = fs.readFileSync(CASES_FILE, 'utf-8');
        this.cases = JSON.parse(data);
        console.log('[SuccessCaseStorage] Loaded', this.cases.length, 'cases from file');
      } else {
        this.cases = [];
        this.saveToFile();
        console.log('[SuccessCaseStorage] Created new cases file');
      }

      this.initialized = true;
    } catch (error: any) {
      console.error('[SuccessCaseStorage] Failed to initialize:', error.message);
      this.cases = [];
      this.initialized = true;
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
  }

  private saveToFile(): void {
    try {
      fs.writeFileSync(CASES_FILE, JSON.stringify(this.cases, null, 2), 'utf-8');
    } catch (error: any) {
      console.error('[SuccessCaseStorage] Failed to save to file:', error.message);
    }
  }

  async saveSuccessCase(successCase: SuccessCase): Promise<void> {
    await this.ensureInitialized();

    const existingIndex = this.cases.findIndex(c => c.id === successCase.id);
    if (existingIndex >= 0) {
      this.cases[existingIndex] = successCase;
    } else {
      this.cases.push(successCase);
    }

    this.saveToFile();
    console.log('[SuccessCaseStorage] Case saved successfully:', successCase.id);
  }

  async getSimilarCases(
    failureContext: FailureContext,
    limit: number = 10
  ): Promise<SuccessCase[]> {
    await this.ensureInitialized();

    const matchingCases = this.cases.filter(
      c => c.failureContext.errorType === failureContext.errorType
    );

    console.log(`[SuccessCaseStorage] Found ${matchingCases.length} cases for error type: ${failureContext.errorType}`);
    return matchingCases.slice(0, limit);
  }

  async searchByKeywords(keywords: string[]): Promise<SuccessCase[]> {
    await this.ensureInitialized();

    const filteredCases = this.cases.filter(successCase => {
      const caseText = `${successCase.failureContext.failureReason} ${successCase.successSolution.recoveryStrategy}`;
      const lowerCaseText = caseText.toLowerCase();
      
      return keywords.some(keyword => 
        lowerCaseText.includes(keyword.toLowerCase())
      );
    });

    console.log(`[SuccessCaseStorage] Keyword search found ${filteredCases.length} cases`);
    return filteredCases;
  }

  async updateUseCount(caseId: string): Promise<void> {
    await this.ensureInitialized();

    const successCase = this.cases.find(c => c.id === caseId);
    if (successCase) {
      successCase.metadata.useCount += 1;
      this.saveToFile();
      console.log(`[SuccessCaseStorage] Updated use count for case: ${caseId}`);
    }
  }

  async updateSuccessRate(caseId: string, success: boolean): Promise<void> {
    await this.ensureInitialized();

    const successCase = this.cases.find(c => c.id === caseId);
    if (successCase) {
      const totalAttempts = successCase.metadata.useCount;
      const currentSuccesses = successCase.metadata.successRate * totalAttempts;
      const newSuccesses = success ? currentSuccesses + 1 : currentSuccesses;
      successCase.metadata.successRate = newSuccesses / (totalAttempts + 1);
      
      this.saveToFile();
      console.log(`[SuccessCaseStorage] Updated success rate for case: ${caseId}`);
    }
  }

  async getAllCases(): Promise<SuccessCase[]> {
    await this.ensureInitialized();
    return [...this.cases];
  }

  async deleteCase(caseId: string): Promise<void> {
    await this.ensureInitialized();

    const index = this.cases.findIndex(c => c.id === caseId);
    if (index >= 0) {
      this.cases.splice(index, 1);
      this.saveToFile();
      console.log(`[SuccessCaseStorage] Case deleted: ${caseId}`);
    }
  }

  async getStats(): Promise<{ totalCases: number; avgSuccessRate: number; avgUseCount: number }> {
    await this.ensureInitialized();
    
    if (this.cases.length === 0) {
      return { totalCases: 0, avgSuccessRate: 0, avgUseCount: 0 };
    }

    const avgSuccessRate = this.cases.reduce((sum, c) => sum + c.metadata.successRate, 0) / this.cases.length;
    const avgUseCount = this.cases.reduce((sum, c) => sum + c.metadata.useCount, 0) / this.cases.length;

    return {
      totalCases: this.cases.length,
      avgSuccessRate,
      avgUseCount
    };
  }

  async clearAll(): Promise<void> {
    await this.ensureInitialized();
    this.cases = [];
    this.saveToFile();
    console.log('[SuccessCaseStorage] All cases cleared');
  }
}
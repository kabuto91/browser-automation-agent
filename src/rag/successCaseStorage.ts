import { TestStep, StepResult, BrowserAction } from '../types';
import * as fs from 'fs';
import * as path from 'path';
import { VectorStore, getVectorStore } from './vectorStore';

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
  source?: 'vector' | 'keyword' | 'hybrid' | 'llm';
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
  private vectorStore: VectorStore;
  private syncEnabled: boolean = true;

  static getInstance(): SuccessCaseStorage {
    if (!SuccessCaseStorage.instance) {
      SuccessCaseStorage.instance = new SuccessCaseStorage();
    }
    return SuccessCaseStorage.instance;
  }

  constructor() {
    this.vectorStore = getVectorStore();
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

      // 初始化向量存储
      await this.vectorStore.init();
      console.log('[SuccessCaseStorage] Vector store initialized');

      // 如果有现有数据且向量库为空，同步到向量库
      if (this.syncEnabled && this.cases.length > 0) {
        const stats = await this.vectorStore.getStats();
        if (stats.count === 0) {
          console.log('[SuccessCaseStorage] Syncing existing cases to vector store...');
          await this.vectorStore.addCases(this.cases);
          console.log('[SuccessCaseStorage] Synced', this.cases.length, 'cases to vector store');
        }
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
      // 更新向量库
      if (this.syncEnabled) {
        await this.vectorStore.updateCase(successCase);
      }
    } else {
      this.cases.push(successCase);
      // 添加到向量库
      if (this.syncEnabled) {
        await this.vectorStore.addCase(successCase);
      }
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
      // 从向量库删除
      if (this.syncEnabled) {
        await this.vectorStore.deleteCase(caseId);
      }
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
    // 清空向量库
    if (this.syncEnabled) {
      await this.vectorStore.clear();
    }
    console.log('[SuccessCaseStorage] All cases cleared');
  }

  /**
   * 设置是否同步到向量库
   */
  setSyncEnabled(enabled: boolean): void {
    this.syncEnabled = enabled;
    console.log('[SuccessCaseStorage] Sync enabled:', enabled);
  }

  /**
   * 获取向量库统计
   */
  async getVectorStoreStats(): Promise<{ count: number }> {
    await this.ensureInitialized();
    return await this.vectorStore.getStats();
  }
}
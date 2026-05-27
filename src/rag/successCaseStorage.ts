import { TestStep, StepResult, BrowserAction } from '../types';

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
  createdAt: Date;
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

const DB_NAME = 'TestAgentRAG';
const CASE_STORE = 'success_cases';
const DB_VERSION = 1;

export class SuccessCaseStorage {
  private static instance: SuccessCaseStorage | null = null;
  private db: IDBDatabase | null = null;
  private initialized = false;

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

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('[SuccessCaseStorage] Failed to open database');
        reject(new Error('Failed to open database'));
      };

      request.onsuccess = (event: any) => {
        this.db = event.target.result;
        this.initialized = true;
        console.log('[SuccessCaseStorage] Database initialized successfully');
        resolve();
      };

      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;

        if (!db.objectStoreNames.contains(CASE_STORE)) {
          const store = db.createObjectStore(CASE_STORE, { keyPath: 'id' });
          
          store.createIndex('errorType', 'failureContext.errorType', { unique: false });
          store.createIndex('createdAt', 'metadata.createdAt', { unique: false });
          store.createIndex('successRate', 'metadata.successRate', { unique: false });
          store.createIndex('useCount', 'metadata.useCount', { unique: false });
          
          console.log('[SuccessCaseStorage] Object store created with indexes');
        }
      };
    });
  }

  private ensureDB(): IDBDatabase {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return this.db;
  }

  async saveSuccessCase(successCase: SuccessCase): Promise<void> {
    const db = this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([CASE_STORE], 'readwrite');
      const store = transaction.objectStore(CASE_STORE);
      const request = store.put(successCase);

      request.onsuccess = () => {
        console.log('[SuccessCaseStorage] Case saved successfully:', successCase.id);
        resolve();
      };

      request.onerror = () => {
        console.error('[SuccessCaseStorage] Failed to save case:', successCase.id);
        reject(new Error('Failed to save case'));
      };
    });
  }

  async getSimilarCases(
    failureContext: FailureContext,
    limit: number = 10
  ): Promise<SuccessCase[]> {
    const db = this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([CASE_STORE], 'readonly');
      const store = transaction.objectStore(CASE_STORE);
      const index = store.index('errorType');
      const range = IDBKeyRange.only(failureContext.errorType);
      const request = index.getAll(range);

      request.onsuccess = () => {
        const cases = request.result || [];
        console.log(`[SuccessCaseStorage] Found ${cases.length} cases for error type: ${failureContext.errorType}`);
        resolve(cases.slice(0, limit));
      };

      request.onerror = () => {
        console.error('[SuccessCaseStorage] Failed to retrieve cases');
        reject(new Error('Failed to retrieve cases'));
      };
    });
  }

  async searchByKeywords(keywords: string[]): Promise<SuccessCase[]> {
    const db = this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([CASE_STORE], 'readonly');
      const store = transaction.objectStore(CASE_STORE);
      const request = store.getAll();

      request.onsuccess = () => {
        const allCases = request.result || [];
        
        const filteredCases = allCases.filter(successCase => {
          const caseText = `${successCase.failureContext.failureReason} ${successCase.successSolution.recoveryStrategy}`;
          const lowerCaseText = caseText.toLowerCase();
          
          return keywords.some(keyword => 
            lowerCaseText.includes(keyword.toLowerCase())
          );
        });

        console.log(`[SuccessCaseStorage] Keyword search found ${filteredCases.length} cases`);
        resolve(filteredCases);
      };

      request.onerror = () => {
        console.error('[SuccessCaseStorage] Keyword search failed');
        reject(new Error('Keyword search failed'));
      };
    });
  }

  async updateUseCount(caseId: string): Promise<void> {
    const db = this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([CASE_STORE], 'readwrite');
      const store = transaction.objectStore(CASE_STORE);
      const getRequest = store.get(caseId);

      getRequest.onsuccess = () => {
        const successCase = getRequest.result;
        if (successCase) {
          successCase.metadata.useCount += 1;
          const putRequest = store.put(successCase);
          
          putRequest.onsuccess = () => {
            console.log(`[SuccessCaseStorage] Updated use count for case: ${caseId}`);
            resolve();
          };
          
          putRequest.onerror = () => {
            reject(new Error('Failed to update use count'));
          };
        } else {
          resolve();
        }
      };

      getRequest.onerror = () => {
        reject(new Error('Failed to get case'));
      };
    });
  }

  async updateSuccessRate(caseId: string, success: boolean): Promise<void> {
    const db = this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([CASE_STORE], 'readwrite');
      const store = transaction.objectStore(CASE_STORE);
      const getRequest = store.get(caseId);

      getRequest.onsuccess = () => {
        const successCase = getRequest.result;
        if (successCase) {
          const totalAttempts = successCase.metadata.useCount;
          const currentSuccesses = successCase.metadata.successRate * totalAttempts;
          const newSuccesses = success ? currentSuccesses + 1 : currentSuccesses;
          successCase.metadata.successRate = newSuccesses / (totalAttempts + 1);
          
          const putRequest = store.put(successCase);
          
          putRequest.onsuccess = () => {
            console.log(`[SuccessCaseStorage] Updated success rate for case: ${caseId}`);
            resolve();
          };
          
          putRequest.onerror = () => {
            reject(new Error('Failed to update success rate'));
          };
        } else {
          resolve();
        }
      };

      getRequest.onerror = () => {
        reject(new Error('Failed to get case'));
      };
    });
  }

  async getAllCases(): Promise<SuccessCase[]> {
    const db = this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([CASE_STORE], 'readonly');
      const store = transaction.objectStore(CASE_STORE);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        reject(new Error('Failed to get all cases'));
      };
    });
  }

  async deleteCase(caseId: string): Promise<void> {
    const db = this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([CASE_STORE], 'readwrite');
      const store = transaction.objectStore(CASE_STORE);
      const request = store.delete(caseId);

      request.onsuccess = () => {
        console.log(`[SuccessCaseStorage] Case deleted: ${caseId}`);
        resolve();
      };

      request.onerror = () => {
        reject(new Error('Failed to delete case'));
      };
    });
  }

  async getStats(): Promise<{ totalCases: number; avgSuccessRate: number; avgUseCount: number }> {
    const cases = await this.getAllCases();
    
    if (cases.length === 0) {
      return { totalCases: 0, avgSuccessRate: 0, avgUseCount: 0 };
    }

    const avgSuccessRate = cases.reduce((sum, c) => sum + c.metadata.successRate, 0) / cases.length;
    const avgUseCount = cases.reduce((sum, c) => sum + c.metadata.useCount, 0) / cases.length;

    return {
      totalCases: cases.length,
      avgSuccessRate,
      avgUseCount
    };
  }
}
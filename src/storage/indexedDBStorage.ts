import { BrowserAction } from '../types';

export interface SavedTestFlow {
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

const DB_NAME = 'BrowserAutomationDB';
const DB_VERSION = 1;
const STORE_NAME = 'testFlows';

class IndexedDBStorage {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        reject(new Error('Failed to open IndexedDB'));
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;
        
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('name', 'name', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
          store.createIndex('lastUsed', 'lastUsed', { unique: false });
          store.createIndex('useCount', 'useCount', { unique: false });
        }
      };
    });
  }

  private ensureDB(): IDBDatabase {
    if (!this.db) {
      throw new Error('Database not initialized. Call init() first.');
    }
    return this.db;
  }

  async saveFlow(flow: SavedTestFlow): Promise<SavedTestFlow> {
    const db = this.ensureDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(flow);

      request.onsuccess = () => {
        resolve(flow);
      };

      request.onerror = () => {
        reject(new Error('Failed to save flow'));
      };
    });
  }

  async getFlow(id: string): Promise<SavedTestFlow | undefined> {
    const db = this.ensureDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(new Error('Failed to get flow'));
      };
    });
  }

  async getAllFlows(): Promise<SavedTestFlow[]> {
    const db = this.ensureDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        reject(new Error('Failed to get all flows'));
      };
    });
  }

  async updateFlowUsage(id: string): Promise<void> {
    const flow = await this.getFlow(id);
    if (flow) {
      flow.lastUsed = new Date().toISOString();
      flow.useCount++;
      await this.saveFlow(flow);
    }
  }

  async deleteFlow(id: string): Promise<boolean> {
    const db = this.ensureDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => {
        resolve(true);
      };

      request.onerror = () => {
        reject(new Error('Failed to delete flow'));
      };
    });
  }

  async searchFlows(query: string, tags?: string[]): Promise<SavedTestFlow[]> {
    const flows = await this.getAllFlows();
    
    let results = flows;

    if (query) {
      const lowerQuery = query.toLowerCase();
      results = results.filter(f =>
        f.name.toLowerCase().includes(lowerQuery) ||
        f.description.toLowerCase().includes(lowerQuery) ||
        f.tags.some(t => t.toLowerCase().includes(lowerQuery))
      );
    }

    if (tags && tags.length > 0) {
      results = results.filter(f =>
        tags.some(tag => f.tags.includes(tag))
      );
    }

    return results;
  }

  async getPopularFlows(limit: number = 10): Promise<SavedTestFlow[]> {
    const flows = await this.getAllFlows();
    return flows
      .sort((a, b) => b.useCount - a.useCount)
      .slice(0, limit);
  }

  async getRecentFlows(limit: number = 10): Promise<SavedTestFlow[]> {
    const flows = await this.getAllFlows();
    return flows
      .sort((a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime())
      .slice(0, limit);
  }

  async exportFlows(): Promise<string> {
    const flows = await this.getAllFlows();
    return JSON.stringify({ flows }, null, 2);
  }

  async importFlows(jsonData: string): Promise<number> {
    try {
      const data = JSON.parse(jsonData);
      const flows = data.flows || data.steps || [];
      
      if (!Array.isArray(flows)) {
        throw new Error('Invalid data format');
      }

      let importedCount = 0;
      for (const flow of flows) {
        try {
          await this.saveFlow(flow);
          importedCount++;
        } catch (error) {
          console.error('Failed to import flow:', flow.id, error);
        }
      }

      return importedCount;
    } catch (error) {
      throw new Error('Failed to parse import data');
    }
  }

  async clearAll(): Promise<void> {
    const db = this.ensureDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(new Error('Failed to clear all flows'));
      };
    });
  }
}

export const indexedDBStorage = new IndexedDBStorage();

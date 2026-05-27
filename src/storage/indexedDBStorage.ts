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
const DB_VERSION = 2;
const STORE_NAME = 'testFlows';

class IndexedDBStorage {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        reject(new Error('Failed to open IndexedDB'));
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('[IndexedDB] Database initialized successfully');
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
          store.createIndex('name_desc', ['name', 'description'], { unique: false });
          console.log('[IndexedDB] Created object store and indexes');
        } else {
          const transaction = event.target.transaction;
          const store = transaction.objectStore(STORE_NAME);
          
          if (!store.indexNames.contains('name_desc')) {
            store.createIndex('name_desc', ['name', 'description'], { unique: false });
            console.log('[IndexedDB] Added compound index');
          }
        }
      };
    });

    return this.initPromise;
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
    const db = this.ensureDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      
      if (query) {
        const lowerQuery = query.toLowerCase();
        const upperQuery = query.toLowerCase() + '\uffff';
        
        const index = store.index('name');
        const range = IDBKeyRange.bound(lowerQuery, upperQuery);
        const request = index.getAll(range);
        
        request.onsuccess = () => {
          let results = request.result || [];
          
          results = results.filter(f =>
            f.name.toLowerCase().includes(query.toLowerCase()) ||
            f.description.toLowerCase().includes(query.toLowerCase()) ||
            f.tags.some((t: string) => t.toLowerCase().includes(query.toLowerCase()))
          );
          
          if (tags && tags.length > 0) {
            results = results.filter(f =>
              tags.some(tag => f.tags.includes(tag))
            );
          }
          
          resolve(results);
        };
        
        request.onerror = () => {
          reject(new Error('Failed to search flows'));
        };
      } else {
        const request = store.getAll();
        
        request.onsuccess = () => {
          let results = request.result || [];
          
          if (tags && tags.length > 0) {
            results = results.filter(f =>
              tags.some(tag => f.tags.includes(tag))
            );
          }
          
          resolve(results);
        };
        
        request.onerror = () => {
          reject(new Error('Failed to search flows'));
        };
      }
    });
  }

  async getPopularFlows(limit: number = 10): Promise<SavedTestFlow[]> {
    const db = this.ensureDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('useCount');
      
      const request = index.openCursor(null, 'prev');
      const results: SavedTestFlow[] = [];
      
      request.onsuccess = (event: any) => {
        const cursor = event.target.result;
        
        if (cursor && results.length < limit) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      
      request.onerror = () => {
        reject(new Error('Failed to get popular flows'));
      };
    });
  }

  async getRecentFlows(limit: number = 10): Promise<SavedTestFlow[]> {
    const db = this.ensureDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('lastUsed');
      
      const request = index.openCursor(null, 'prev');
      const results: SavedTestFlow[] = [];
      
      request.onsuccess = (event: any) => {
        const cursor = event.target.result;
        
        if (cursor && results.length < limit) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      
      request.onerror = () => {
        reject(new Error('Failed to get recent flows'));
      };
    });
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

      return await this.saveFlowsBatch(flows);
    } catch (error) {
      throw new Error('Failed to parse import data');
    }
  }

  async saveFlowsBatch(flows: SavedTestFlow[]): Promise<number> {
    const db = this.ensureDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      let importedCount = 0;
      let completed = 0;
      
      flows.forEach((flow, index) => {
        const request = store.put(flow);
        
        request.onsuccess = () => {
          importedCount++;
          completed++;
          
          if (completed === flows.length) {
            console.log(`[IndexedDB] Batch saved ${importedCount} flows`);
            resolve(importedCount);
          }
        };
        
        request.onerror = () => {
          console.error('[IndexedDB] Failed to save flow:', flow.id);
          completed++;
          
          if (completed === flows.length) {
            resolve(importedCount);
          }
        };
      });
      
      transaction.onerror = () => {
        reject(new Error('Batch transaction failed'));
      };
    });
  }

  async deleteFlowsBatch(ids: string[]): Promise<number> {
    const db = this.ensureDB();
    
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      let deletedCount = 0;
      let completed = 0;
      
      ids.forEach((id, index) => {
        const request = store.delete(id);
        
        request.onsuccess = () => {
          deletedCount++;
          completed++;
          
          if (completed === ids.length) {
            console.log(`[IndexedDB] Batch deleted ${deletedCount} flows`);
            resolve(deletedCount);
          }
        };
        
        request.onerror = () => {
          console.error('[IndexedDB] Failed to delete flow:', id);
          completed++;
          
          if (completed === ids.length) {
            resolve(deletedCount);
          }
        };
      });
      
      transaction.onerror = () => {
        reject(new Error('Batch delete transaction failed'));
      };
    });
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

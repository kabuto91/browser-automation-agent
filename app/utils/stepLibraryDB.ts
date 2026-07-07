// IndexedDB 存储层 - 步骤库数据管理

export interface ToolCall {
  toolName: string;
  arguments: any;
  description?: string;
}

export interface TestStep {
  id: string;
  name: string;
  originalTask: string;
  script: ToolCall[];
  createdAt: number;
  successCount: number;
  lastExecutedAt?: number;
}

const DB_NAME = 'StepLibraryDB';
const DB_VERSION = 1;
const STORE_NAME = 'steps';

let dbInstance: IDBDatabase | null = null;

async function getDB(): Promise<IDBDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error('Failed to open IndexedDB'));
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        objectStore.createIndex('createdAt', 'createdAt', { unique: false });
        objectStore.createIndex('name', 'name', { unique: false });
      }
    };
  });
}

export async function addStep(step: TestStep): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(STORE_NAME);
    const request = objectStore.add(step);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error('Failed to add step'));
  });
}

export async function getAllSteps(): Promise<TestStep[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const objectStore = transaction.objectStore(STORE_NAME);
    const request = objectStore.getAll();

    request.onsuccess = () => {
      const steps = request.result as TestStep[];
      steps.sort((a, b) => b.createdAt - a.createdAt);
      resolve(steps);
    };
    request.onerror = () => reject(new Error('Failed to get steps'));
  });
}

export async function getStep(id: string): Promise<TestStep | null> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const objectStore = transaction.objectStore(STORE_NAME);
    const request = objectStore.get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(new Error('Failed to get step'));
  });
}

export async function deleteStep(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(STORE_NAME);
    const request = objectStore.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error('Failed to delete step'));
  });
}

export async function updateStepStats(id: string, success: boolean): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(STORE_NAME);
    const getRequest = objectStore.get(id);

    getRequest.onsuccess = () => {
      const step = getRequest.result as TestStep;
      if (!step) {
        reject(new Error('Step not found'));
        return;
      }

      if (success) {
        step.successCount += 1;
      }
      step.lastExecutedAt = Date.now();

      const updateRequest = objectStore.put(step);
      updateRequest.onsuccess = () => resolve();
      updateRequest.onerror = () => reject(new Error('Failed to update step'));
    };

    getRequest.onerror = () => reject(new Error('Failed to get step for update'));
  });
}

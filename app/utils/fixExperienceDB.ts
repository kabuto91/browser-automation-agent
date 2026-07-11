// IndexedDB 存储层 - 修复经验数据管理

import { ToolCall } from './stepLibraryDB';

export interface FixExperience {
  id: string;
  problemDescription: string;      // 问题描述（原始任务 + 错误信息）
  errorType: string;               // 错误类型（如：元素未找到、超时、登录拦截等）
  fixSteps: ToolCall[];            // 修复步骤
  successCount: number;            // 复用成功次数
  createdAt: number;
  lastUsedAt?: number;
}

const DB_NAME = 'FixExperienceDB';
const DB_VERSION = 1;
const STORE_NAME = 'experiences';

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
        objectStore.createIndex('errorType', 'errorType', { unique: false });
      }
    };
  });
}

export async function addFixExperience(experience: FixExperience): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(STORE_NAME);
    const request = objectStore.add(experience);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error('Failed to add fix experience'));
  });
}

export async function getAllFixExperiences(): Promise<FixExperience[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const objectStore = transaction.objectStore(STORE_NAME);
    const request = objectStore.getAll();

    request.onsuccess = () => {
      const experiences = request.result as FixExperience[];
      experiences.sort((a, b) => b.createdAt - a.createdAt);
      resolve(experiences);
    };
    request.onerror = () => reject(new Error('Failed to get fix experiences'));
  });
}

export async function getFixExperience(id: string): Promise<FixExperience | null> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const objectStore = transaction.objectStore(STORE_NAME);
    const request = objectStore.get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(new Error('Failed to get fix experience'));
  });
}

export async function deleteFixExperience(id: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(STORE_NAME);
    const request = objectStore.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(new Error('Failed to delete fix experience'));
  });
}

export async function updateFixExperienceStats(id: string, success: boolean): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(STORE_NAME);
    const getRequest = objectStore.get(id);

    getRequest.onsuccess = () => {
      const experience = getRequest.result as FixExperience;
      if (!experience) {
        reject(new Error('Fix experience not found'));
        return;
      }

      if (success) {
        experience.successCount += 1;
      }
      experience.lastUsedAt = Date.now();

      const updateRequest = objectStore.put(experience);
      updateRequest.onsuccess = () => resolve();
      updateRequest.onerror = () => reject(new Error('Failed to update fix experience'));
    };

    getRequest.onerror = () => reject(new Error('Failed to get fix experience for update'));
  });
}

// 浏览器池管理器 - 支持多个浏览器实例并行执行

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { createMCPClient, destroyMCPClient, MCPClientInstance } from './mcpFactory';
import { randomUUID } from 'crypto';

interface PoolEntry {
  clientId: string;
  instance: MCPClientInstance;
  inUse: boolean;
}

export class BrowserPool {
  private pool: PoolEntry[] = [];
  private maxSize: number;
  private waitQueue: Array<(entry: PoolEntry) => void> = [];
  private creatingCount: number = 0;
  private mutexChain: Promise<void> = Promise.resolve();

  constructor(maxSize: number = 3) {
    this.maxSize = maxSize;
    console.log(`🌐 浏览器池初始化，最大容量: ${maxSize}`);
  }

  async acquire(): Promise<PoolEntry> {
    const acquireId = Math.random().toString(36).substring(7);
    console.log(`🌐 [${acquireId}] acquire 开始，当前池状态: 总数=${this.pool.length}, 使用中=${this.pool.filter(e => e.inUse).length}, 创建中=${this.creatingCount}`);

    // 查找空闲实例（无需加锁）
    const available = this.pool.find(entry => !entry.inUse);
    if (available) {
      available.inUse = true;
      console.log(`🌐 [${acquireId}] ✅ 从池中获取浏览器实例: ${available.clientId} (instanceId: ${available.instance.instanceId})`);
      return available;
    }

    // 通过互斥锁串行化 - 每个请求有自己的 releaseLock
    let releaseLock: () => void;
    const lockPromise = new Promise<void>(resolve => { releaseLock = resolve; });
    const prevLock = this.mutexChain;
    this.mutexChain = lockPromise;

    await prevLock;

    try {
      // 加锁后重新检查（可能在等锁期间已有空闲实例）
      const retryAvailable = this.pool.find(entry => !entry.inUse);
      if (retryAvailable) {
        retryAvailable.inUse = true;
        console.log(`🌐 [${acquireId}] ✅ 等锁后获取到空闲实例: ${retryAvailable.clientId} (instanceId: ${retryAvailable.instance.instanceId})`);
        return retryAvailable;
      }

      if (this.pool.length + this.creatingCount >= this.maxSize) {
        console.log(`⏳ [${acquireId}] 浏览器池已满，排队等待中...`);
        return new Promise<PoolEntry>((resolve) => {
          this.waitQueue.push(resolve);
        });
      }

      this.creatingCount++;
      console.log(`🌐 [${acquireId}] 🆕 开始创建新浏览器实例 (创建中: ${this.creatingCount}/${this.maxSize})`);

      try {
        const instance = await createMCPClient();
        const entry: PoolEntry = {
          clientId: randomUUID(),
          instance,
          inUse: true,
        };
        this.pool.push(entry);
        console.log(`🌐 [${acquireId}] ✅ 新浏览器实例创建完成: clientId=${entry.clientId}, instanceId=${instance.instanceId} (池大小: ${this.pool.length}/${this.maxSize})`);
        return entry;
      } finally {
        this.creatingCount--;
      }
    } finally {
      releaseLock!();
    }
  }

  /**
   * 归还浏览器实例到池中
   */
  async release(clientId: string): Promise<void> {
    const entry = this.pool.find(e => e.clientId === clientId);
    if (!entry) {
      console.warn(`⚠️ 尝试归还不存在的浏览器实例: ${clientId}`);
      return;
    }

    entry.inUse = false;
    console.log(`🌐 归还浏览器实例到池中: ${clientId}`);

    // 如果有等待的任务，立即分配
    if (this.waitQueue.length > 0) {
      const nextResolver = this.waitQueue.shift();
      if (nextResolver) {
        entry.inUse = true;
        console.log(`🌐 从等待队列中分配浏览器实例: ${clientId}`);
        nextResolver(entry);
      }
    }
  }

  /**
   * 销毁指定的浏览器实例（出错时使用）
   */
  async destroy(clientId: string): Promise<void> {
    const index = this.pool.findIndex(e => e.clientId === clientId);
    if (index === -1) {
      console.warn(`⚠️ 尝试销毁不存在的浏览器实例: ${clientId}`);
      return;
    }

    const entry = this.pool[index];
    await destroyMCPClient(entry.instance);
    this.pool.splice(index, 1);
    console.log(`🗑️ 销毁浏览器实例: ${clientId} (剩余池大小: ${this.pool.length})`);
  }

  /**
   * 销毁所有浏览器实例
   */
  async destroyAll(): Promise<void> {
    console.log(`🧹 开始销毁所有浏览器实例 (共 ${this.pool.length} 个)`);
    for (const entry of this.pool) {
      await destroyMCPClient(entry.instance);
    }
    this.pool = [];
    this.waitQueue = [];
  }

  /**
   * 获取池状态信息
   */
  getStatus(): { total: number; inUse: number; available: number; waiting: number } {
    const inUse = this.pool.filter(e => e.inUse).length;
    return {
      total: this.pool.length,
      inUse,
      available: this.pool.length - inUse,
      waiting: this.waitQueue.length,
    };
  }
}

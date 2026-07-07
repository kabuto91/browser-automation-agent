// 脚本收集器 - 在测试执行过程中收集 tool_calls

import { ToolCall } from './stepLibraryDB';

export class ScriptCollector {
  private toolCalls: ToolCall[] = [];
  private lastSnapshotTime: number = 0;
  private readonly SNAPSHOT_DEDUP_INTERVAL = 1000; // 1秒内的重复快照视为冗余

  addToolCall(toolName: string, args: any): void {
    // 过滤重复的快照查询
    if (toolName === 'browser_snapshot') {
      const now = Date.now();
      if (now - this.lastSnapshotTime < this.SNAPSHOT_DEDUP_INTERVAL) {
        return; // 跳过重复快照
      }
      this.lastSnapshotTime = now;
    }

    this.toolCalls.push({
      toolName,
      arguments: args,
    });
  }

  getScript(): ToolCall[] {
    return [...this.toolCalls];
  }

  clear(): void {
    this.toolCalls = [];
    this.lastSnapshotTime = 0;
  }

  getScriptLength(): number {
    return this.toolCalls.length;
  }
}

/**
 * 检查点管理器 - 支持确认/回滚机制
 * 
 * @module checkpoint
 * @version 1.0.0
 */

import { CheckpointInfo, BrowserSession, RollbackConfig } from '../types';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

export interface CheckpointData {
  /** 检查点元数据 */
  metadata: CheckpointInfo;
  /** 快照数据（可选） */
  snapshot?: any;
  /** 状态数据 */
  state?: any;
  /** 完整数据（可选） */
  full?: any;
}

export class CheckpointManager {
  private storagePath: string;
  private checkpoints: Map<string, CheckpointData> = new Map();

  constructor(storagePath?: string) {
    this.storagePath = storagePath || path.join(process.cwd(), '.edict', 'checkpoints');
    
    // 确保存储目录存在
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  /**
   * 创建检查点
   */
  async create(
    executionId: string,
    actionId: string,
    session: BrowserSession,
    type: 'snapshot' | 'state' | 'full' = 'snapshot'
  ): Promise<CheckpointInfo> {
    const checkpointId = uuidv4();
    const retentionMs = 3600000; // 默认 1 小时

    const checkpoint: CheckpointInfo = {
      checkpoint_id: checkpointId,
      type,
      created_at: Date.now(),
      expires_at: Date.now() + retentionMs,
      action_id: actionId,
    };

    const data: CheckpointData = {
      metadata: checkpoint,
    };

    // 根据类型收集数据
    if (type === 'snapshot' || type === 'full') {
      try {
        data.snapshot = await session.browser.snapshot({
          refs: 'aria',
          targetId: session.current_tab_id,
        });
      } catch (error) {
        data.snapshot = { error: 'Snapshot failed' };
      }
    }

    if (type === 'state' || type === 'full') {
      data.state = {
        tabs: session.tabs,
        current_tab_id: session.current_tab_id,
      };
    }

    if (type === 'full') {
      // 完整数据可能包括 screenshot 等
      try {
        data.full = {
          screenshot: await session.browser.screenshot({
            targetId: session.current_tab_id,
            fullPage: false,
          }),
        };
      } catch (error) {
        data.full = { error: 'Screenshot failed' };
      }
    }

    // 计算大小
    const serialized = JSON.stringify(data);
    checkpoint.size_bytes = Buffer.byteLength(serialized, 'utf8');

    // 存储
    this.checkpoints.set(checkpointId, data);
    this.persistCheckpoint(checkpointId, data);

    return checkpoint;
  }

  /**
   * 获取检查点
   */
  get(checkpointId: string): CheckpointData | undefined {
    const data = this.checkpoints.get(checkpointId);
    
    // 检查是否过期
    if (data && Date.now() > data.metadata.expires_at) {
      this.delete(checkpointId);
      return undefined;
    }

    return data;
  }

  /**
   * 恢复检查点
   */
  async restore(checkpoint: CheckpointInfo): Promise<boolean> {
    const data = this.get(checkpoint.checkpoint_id);
    if (!data) {
      return false;
    }

    // 恢复状态（简化实现，实际需要更复杂的恢复逻辑）
    if (data.state) {
      // 恢复 tab 状态等
      console.log(`[CheckpointManager] 恢复状态：${checkpoint.checkpoint_id}`);
    }

    return true;
  }

  /**
   * 列出执行的所有检查点
   */
  list(executionId: string): CheckpointInfo[] {
    const result: CheckpointInfo[] = [];

    for (const data of this.checkpoints.values()) {
      // 简化：实际应该通过 executionId 过滤
      result.push(data.metadata);
    }

    return result.sort((a, b) => a.created_at - b.created_at);
  }

  /**
   * 删除检查点
   */
  delete(checkpointId: string): void {
    this.checkpoints.delete(checkpointId);
    
    const filePath = path.join(this.storagePath, `${checkpointId}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  /**
   * 清理过期检查点
   */
  cleanup(): number {
    let deleted = 0;
    const now = Date.now();

    for (const [id, data] of this.checkpoints.entries()) {
      if (now > data.metadata.expires_at) {
        this.delete(id);
        deleted++;
      }
    }

    return deleted;
  }

  /**
   * 持久化检查点到磁盘
   */
  private persistCheckpoint(checkpointId: string, data: CheckpointData): void {
    const filePath = path.join(this.storagePath, `${checkpointId}.json`);
    
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
      console.error(`[CheckpointManager] 持久化失败：${checkpointId}`, error);
    }
  }

  /**
   * 从磁盘加载检查点
   */
  loadFromDisk(checkpointId: string): CheckpointData | undefined {
    const filePath = path.join(this.storagePath, `${checkpointId}.json`);
    
    if (!fs.existsSync(filePath)) {
      return undefined;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const data: CheckpointData = JSON.parse(content);
      this.checkpoints.set(checkpointId, data);
      return data;
    } catch (error) {
      console.error(`[CheckpointManager] 加载失败：${checkpointId}`, error);
      return undefined;
    }
  }

  /**
   * 加载所有检查点
   */
  loadAllFromDisk(): number {
    let loaded = 0;

    if (!fs.existsSync(this.storagePath)) {
      return 0;
    }

    const files = fs.readdirSync(this.storagePath);
    for (const file of files) {
      if (file.endsWith('.json')) {
        const checkpointId = file.slice(0, -5);
        if (this.loadFromDisk(checkpointId)) {
          loaded++;
        }
      }
    }

    return loaded;
  }
}

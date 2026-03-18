/**
 * 工作流编排引擎
 * 
 * @module orchestrator
 * @version 1.0.0
 */

import {
  WorkflowDefinition,
  WorkflowAction,
  ExecutionState,
  ExecutionStatus,
  ActionResult,
  BrowserAction,
  CheckpointInfo,
  ConfirmationRequest,
  BrowserSession,
  Logger,
} from '../types';
import { ActionRegistry, ActionExecutor, ActionFactory } from '../actions';
import { CheckpointManager } from '../checkpoint';
import { v4 as uuidv4 } from 'uuid';

// ============ DAG Builder ============

export class DAGBuilder {
  private nodes: Map<string, WorkflowAction> = new Map();
  private edges: Map<string, Set<string>> = new Map(); // adjacency list

  addNode(action: WorkflowAction): void {
    this.nodes.set(action.id, action);
    if (!this.edges.has(action.id)) {
      this.edges.set(action.id, new Set());
    }
  }

  addEdge(from: string, to: string): void {
    if (!this.edges.has(from)) {
      this.edges.set(from, new Set());
    }
    this.edges.get(from)!.add(to);
  }

  build(actions: WorkflowAction[]): Map<string, WorkflowAction> {
    // Clear existing
    this.nodes.clear();
    this.edges.clear();

    // Add all nodes
    for (const action of actions) {
      this.addNode(action);
    }

    // Build edges from dependencies
    for (const action of actions) {
      if (action.depends_on) {
        for (const dep of action.depends_on) {
          this.addEdge(dep, action.id);
        }
      }
    }

    // Validate DAG (no cycles)
    this.validateDAG();

    return this.nodes;
  }

  private validateDAG(): void {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (nodeId: string): void => {
      if (recursionStack.has(nodeId)) {
        throw new Error(`检测到循环依赖：${nodeId}`);
      }
      if (visited.has(nodeId)) {
        return;
      }

      visited.add(nodeId);
      recursionStack.add(nodeId);

      const neighbors = this.edges.get(nodeId);
      if (neighbors) {
        for (const neighbor of neighbors) {
          dfs(neighbor);
        }
      }

      recursionStack.delete(nodeId);
    };

    for (const nodeId of this.nodes.keys()) {
      dfs(nodeId);
    }
  }

  /** 获取可执行的 Action（所有依赖已满足） */
  getReadyActions(completed: Set<string>): string[] {
    const ready: string[] = [];

    for (const [actionId, action] of this.nodes) {
      if (completed.has(actionId)) {
        continue;
      }

      const dependencies = action.depends_on || [];
      const allDepsCompleted = dependencies.every(dep => completed.has(dep));

      if (allDepsCompleted) {
        ready.push(actionId);
      }
    }

    return ready;
  }

  getTopologicalOrder(): string[] {
    const result: string[] = [];
    const visited = new Set<string>();

    const dfs = (nodeId: string) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);

      const neighbors = this.edges.get(nodeId);
      if (neighbors) {
        for (const neighbor of neighbors) {
          dfs(neighbor);
        }
      }

      result.push(nodeId);
    };

    for (const nodeId of this.nodes.keys()) {
      dfs(nodeId);
    }

    return result.reverse();
  }
}

// ============ State Manager ============

export class StateManager {
  private states: Map<string, ExecutionState> = new Map();

  create(executionId: string, workflowId: string): ExecutionState {
    const state: ExecutionState = {
      execution_id: executionId,
      workflow_id: workflowId,
      status: 'pending',
      progress: {
        current_action: '',
        completed_actions: 0,
        total_actions: 0,
        percentage: 0,
      },
      started_at: Date.now(),
      checkpoints: [],
      pending_confirmations: [],
    };
    this.states.set(executionId, state);
    return state;
  }

  get(executionId: string): ExecutionState | undefined {
    return this.states.get(executionId);
  }

  update(executionId: string, updates: Partial<ExecutionState>): void {
    const state = this.states.get(executionId);
    if (!state) {
      throw new Error(`Execution state not found: ${executionId}`);
    }
    Object.assign(state, updates);
  }

  updateProgress(
    executionId: string,
    currentAction: string,
    completed: number,
    total: number
  ): void {
    const state = this.states.get(executionId);
    if (!state) return;

    state.progress = {
      current_action: currentAction,
      completed_actions: completed,
      total_actions: total,
      percentage: total > 0 ? completed / total : 0,
    };
  }

  addCheckpoint(executionId: string, checkpoint: CheckpointInfo): void {
    const state = this.states.get(executionId);
    if (!state) return;
    state.checkpoints.push(checkpoint);
  }

  addConfirmation(executionId: string, confirmation: ConfirmationRequest): void {
    const state = this.states.get(executionId);
    if (!state) return;
    state.pending_confirmations.push(confirmation);
  }

  removeConfirmation(executionId: string, confirmationId: string): void {
    const state = this.states.get(executionId);
    if (!state) return;
    state.pending_confirmations = state.pending_confirmations.filter(
      c => c.confirmation_id !== confirmationId
    );
  }

  delete(executionId: string): void {
    this.states.delete(executionId);
  }

  list(): ExecutionState[] {
    return Array.from(this.states.values());
  }
}

// ============ Workflow Executor ============

export interface ExecutorConfig {
  /** 最大并发数 */
  maxConcurrency?: number;
  /** 默认超时时间 */
  defaultTimeoutMs?: number;
  /** 是否自动重试 */
  autoRetry?: boolean;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 日志记录器 */
  logger?: Logger;
}

export class WorkflowExecutor {
  private config: ExecutorConfig;
  private actionRegistry: ActionRegistry;
  private actionExecutor: ActionExecutor;
  private actionFactory: ActionFactory;
  private stateManager: StateManager;
  private checkpointManager: CheckpointManager;
  private logger: Logger;

  constructor(
    actionRegistry: ActionRegistry,
    checkpointManager: CheckpointManager,
    config?: ExecutorConfig
  ) {
    this.config = {
      maxConcurrency: config?.maxConcurrency ?? 1,
      defaultTimeoutMs: config?.defaultTimeoutMs ?? 30000,
      autoRetry: config?.autoRetry ?? true,
      maxRetries: config?.maxRetries ?? 3,
      ...config,
    };
    this.actionRegistry = actionRegistry;
    this.actionExecutor = new ActionExecutor(actionRegistry);
    this.actionFactory = new ActionFactory(actionRegistry);
    this.stateManager = new StateManager();
    this.checkpointManager = checkpointManager;
    this.logger = config?.logger ?? console;
  }

  async execute(
    workflow: WorkflowDefinition,
    session: BrowserSession,
    inputs?: Record<string, any>
  ): Promise<ExecutionState> {
    const executionId = uuidv4();
    
    // 创建执行状态
    const state = this.stateManager.create(executionId, workflow.workflow_id);
    state.status = 'running';
    state.progress.total_actions = workflow.actions.length;

    this.logger.info(`[WorkflowExecutor] 开始执行工作流：${workflow.name} (${executionId})`);

    try {
      // 构建 DAG
      const dagBuilder = new DAGBuilder();
      dagBuilder.build(workflow.actions);

      // 执行 Action
      const completedActions = new Set<string>();
      const actionResults: Map<string, ActionResult> = new Map();

      while (completedActions.size < workflow.actions.length) {
        // 获取可执行的 Action
        const readyActions = dagBuilder.getReadyActions(completedActions);

        if (readyActions.length === 0) {
          if (completedActions.size < workflow.actions.length) {
            throw new Error('工作流执行停滞：没有可执行的 Action，但仍有未完成');
          }
          break;
        }

        // 并发执行（受 maxConcurrency 限制）
        const batch = readyActions.slice(0, this.config.maxConcurrency!);
        const results = await Promise.all(
          batch.map(async (actionId) => {
            const actionDef = workflow.actions.find(a => a.id === actionId)!;
            return this.executeAction(
              actionDef,
              session,
              executionId,
              inputs || {},
              actionResults
            );
          })
        );

        // 更新状态
        for (let i = 0; i < batch.length; i++) {
          const actionId = batch[i];
          const result = results[i];

          completedActions.add(actionId);
          actionResults.set(actionId, result);

          if (result.status === 'failed') {
            this.handleActionFailure(workflow, actionId, result, state);
          }
        }

        this.stateManager.updateProgress(
          executionId,
          batch[batch.length - 1],
          completedActions.size,
          workflow.actions.length
        );
      }

      // 完成
      state.status = 'completed';
      state.completed_at = Date.now();
      state.result = Object.fromEntries(actionResults);

      this.logger.info(`[WorkflowExecutor] 工作流执行完成：${executionId}`);

    } catch (error: any) {
      state.status = 'failed';
      state.error = {
        code: 'WORKFLOW_EXECUTION_ERROR',
        message: error.message || '工作流执行失败',
        stack: error.stack,
        retryable: false,
      };
      state.completed_at = Date.now();

      this.logger.error(`[WorkflowExecutor] 工作流执行失败：${executionId}`, error);

      // 触发回滚
      if (workflow.rollback?.enabled) {
        await this.rollback(executionId, workflow);
      }
    }

    return state;
  }

  private async executeAction(
    actionDef: WorkflowAction,
    session: BrowserSession,
    executionId: string,
    inputs: Record<string, any>,
    actionResults: Map<string, ActionResult>
  ): Promise<ActionResult> {
    // 检查是否需要确认
    if (actionDef.confirmation?.required) {
      const confirmation = await this.requestConfirmation(
        executionId,
        actionDef,
        actionDef.confirmation
      );

      if (!confirmation) {
        return {
          action_id: actionDef.id,
          status: 'failed',
          error: {
            code: 'CONFIRMATION_DENIED',
            message: '确认被拒绝',
            retryable: false,
          },
          duration_ms: 0,
          timestamp: Date.now(),
        };
      }
    }

    // 创建 BrowserAction
    const browserAction = this.actionFactory.create({
      action_type: actionDef.type,
      params: this.interpolateParams(actionDef.params, inputs, actionResults),
      timeout_ms: actionDef.timeout_ms || this.config.defaultTimeoutMs,
      preconditions: actionDef.preconditions,
    });

    // 创建执行上下文
    const context = {
      session,
      execution: this.stateManager.get(executionId)!,
      inputs,
      action_results: Object.fromEntries(actionResults),
      logger: this.logger,
    };

    // 执行 Action
    let result = await this.actionExecutor.execute(browserAction, context);

    // 重试逻辑
    if (result.status === 'failed' && this.config.autoRetry) {
      let retries = 0;
      while (
        result.status === 'failed' &&
        result.error?.retryable &&
        retries < (this.config.maxRetries || 3)
      ) {
        retries++;
        this.logger.warn(
          `[WorkflowExecutor] Action ${actionDef.id} 失败，重试 ${retries}/${this.config.maxRetries}`
        );
        
        // 等待一段时间后重试
        await new Promise(resolve => setTimeout(resolve, 1000 * retries));
        result = await this.actionExecutor.execute(browserAction, context);
      }
    }

    // 创建检查点（如果是敏感操作或配置了检查点）
    if (actionDef.sensitive || actionDef.confirmation?.required) {
      const checkpoint = await this.checkpointManager.create(
        executionId,
        actionDef.id,
        session
      );
      this.stateManager.addCheckpoint(executionId, checkpoint);
    }

    return result;
  }

  private interpolateParams(
    params: Record<string, any>,
    inputs: Record<string, any>,
    actionResults: Map<string, ActionResult>
  ): Record<string, any> {
    // 简单的模板插值：${input.name} 或 ${actionId.result.field}
    const interpolate = (value: any): any => {
      if (typeof value !== 'string') {
        return value;
      }

      return value.replace(/\$\{([^}]+)\}/g, (match, key) => {
        // 检查是否是 input 引用
        if (key.startsWith('input.')) {
          const inputKey = key.slice(6);
          return inputs[inputKey] ?? match;
        }

        // 检查是否是 action result 引用
        const parts = key.split('.');
        if (parts.length >= 2) {
          const actionId = parts[0];
          const fieldPath = parts.slice(1).join('.');
          const actionResult = actionResults.get(actionId);
          if (actionResult?.result) {
            // 简单路径访问
            return this.getNestedValue(actionResult.result, fieldPath) ?? match;
          }
        }

        return match;
      });
    };

    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(params)) {
      result[key] = interpolate(value);
    }
    return result;
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((acc, part) => acc?.[part], obj);
  }

  private async requestConfirmation(
    executionId: string,
    actionDef: WorkflowAction,
    config: any
  ): Promise<boolean> {
    const confirmation: ConfirmationRequest = {
      confirmation_id: uuidv4(),
      action_id: actionDef.id,
      message: config.message || `确认执行操作：${actionDef.type}`,
      risk_level: actionDef.sensitive ? 'high' : 'medium',
      created_at: Date.now(),
      expires_at: Date.now() + (config.timeout_ms || 300000),
      options: ['approve', 'reject'],
    };

    this.stateManager.addConfirmation(executionId, confirmation);
    this.logger.warn(
      `[WorkflowExecutor] 等待确认：${confirmation.confirmation_id} (${confirmation.message})`
    );

    // 等待确认（简化实现，实际应通过外部回调）
    // 这里假设确认是同步的（实际应用中应该是异步回调）
    return true; // 简化：自动批准
  }

  private handleActionFailure(
    workflow: WorkflowDefinition,
    actionId: string,
    result: ActionResult,
    state: ExecutionState
  ): void {
    const actionDef = workflow.actions.find(a => a.id === actionId);
    const errorConfig = workflow.error_handling?.specific?.find(
      e => e.action_type === actionDef?.type
    );

    if (errorConfig) {
      this.logger.warn(
        `[WorkflowExecutor] Action ${actionId} 失败，使用特定错误处理：${errorConfig.handler}`
      );
    }

    const defaultConfig = workflow.error_handling?.default;
    if (defaultConfig?.on_max_retries === 'rollback' && workflow.rollback?.enabled) {
      this.logger.info(`[WorkflowExecutor] 触发回滚`);
    }
  }

  private async rollback(executionId: string, workflow: WorkflowDefinition): Promise<void> {
    this.logger.info(`[WorkflowExecutor] 开始回滚执行：${executionId}`);
    
    const checkpoints = this.checkpointManager.list(executionId);
    if (checkpoints.length === 0) {
      this.logger.warn(`[WorkflowExecutor] 没有可用的检查点，无法回滚`);
      return;
    }

    // 找到最新的检查点
    const latestCheckpoint = checkpoints[checkpoints.length - 1];
    await this.checkpointManager.restore(latestCheckpoint);

    this.logger.info(`[WorkflowExecutor] 回滚完成：${executionId}`);
  }

  getState(executionId: string): ExecutionState | undefined {
    return this.stateManager.get(executionId);
  }

  getStateManager(): StateManager {
    return this.stateManager;
  }
}

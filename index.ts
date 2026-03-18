/**
 * Agent 优先网站转换引擎
 * 
 * @module conversion-engine
 * @version 1.0.0
 * 
 * 核心功能:
 * 1. 原子化 Browser Action 体系
 * 2. 统一 Action 接口规范
 * 3. 工作流编排引擎 (DAG + Executor + State Manager)
 * 4. 确认/回滚机制 (Checkpoint Manager)
 */

// Types
export * from './types';

// Actions
export {
  ActionRegistry,
  ActionFactory,
  ActionExecutor,
  initializeRegistry,
  // Navigation Actions
  navigateAction,
  goBackAction,
  goForwardAction,
  refreshAction,
  // Snapshot Actions
  snapshotAction,
  screenshotAction,
  consoleAction,
  // Interaction Actions
  clickAction,
  typeAction,
  pressAction,
  hoverAction,
  dragAction,
  selectAction,
  // Evaluation Actions
  evaluateAction,
  waitAction,
  // Tab Management Actions
  openAction,
  closeAction,
  focusAction,
  tabsAction,
  // Dialog & Upload Actions
  dialogAction,
  uploadAction,
} from './actions';

// Orchestrator
export {
  DAGBuilder,
  StateManager,
  WorkflowExecutor,
} from './orchestrator';

// Checkpoint
export {
  CheckpointManager,
} from './checkpoint';

// ============ 便捷工厂函数 ============

import { ActionRegistry, initializeRegistry, ActionExecutor } from './actions';
import { CheckpointManager } from './checkpoint';
import { WorkflowExecutor, ExecutorConfig } from './orchestrator';
import { WorkflowDefinition, BrowserSession, Logger } from './types';

export interface EngineConfig {
  executor?: ExecutorConfig;
  checkpointStorage?: string;
  logger?: Logger;
}

/**
 * 创建转换引擎实例
 */
export function createEngine(config?: EngineConfig): WorkflowExecutor {
  const registry = initializeRegistry();
  const checkpointManager = new CheckpointManager(config?.checkpointStorage);
  
  return new WorkflowExecutor(
    registry,
    checkpointManager,
    {
      ...config?.executor,
      logger: config?.logger,
    }
  );
}

/**
 * 创建简单工作流（线性序列）
 */
export function createSimpleWorkflow(
  name: string,
  actions: Array<{
    type: string;
    params: Record<string, any>;
    timeout_ms?: number;
  }>
): WorkflowDefinition {
  const workflowActions = actions.map((action, index) => ({
    id: `action_${index}`,
    type: action.type as any,
    params: action.params,
    timeout_ms: action.timeout_ms,
    depends_on: index > 0 ? [`action_${index - 1}`] : [],
  }));

  return {
    workflow_id: `wf_${Date.now()}`,
    name,
    version: '1.0.0',
    actions: workflowActions,
  };
}

/**
 * 默认导出
 */
export default {
  createEngine,
  createSimpleWorkflow,
};

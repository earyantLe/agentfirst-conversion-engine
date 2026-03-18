/**
 * Agent 优先网站转换引擎 - 类型定义
 * 
 * @module types
 * @version 1.0.0
 */

// ============ Action 类型体系 ============

export type ActionType = 
  | 'navigate'
  | 'go_back'
  | 'go_forward'
  | 'refresh'
  | 'snapshot'
  | 'screenshot'
  | 'console'
  | 'click'
  | 'type'
  | 'press'
  | 'hover'
  | 'drag'
  | 'select'
  | 'evaluate'
  | 'wait'
  | 'open'
  | 'close'
  | 'focus'
  | 'tabs'
  | 'upload'
  | 'dialog';

// ============ 核心接口 ============

export interface BrowserAction {
  /** 唯一标识符 (UUID) */
  action_id: string;
  /** 操作类型 */
  action_type: ActionType;
  /** Action 版本 */
  version: string;
  /** 输入参数 */
  params: ActionParams;
  /** 超时时间 (ms) */
  timeout_ms?: number;
  /** 重试次数 */
  retry_count?: number;
  /** 前置条件 (ARIA selector 列表) */
  preconditions?: string[];
  /** 幂等键 (用于去重) */
  idempotency_key?: string;
}

export interface ActionParams {
  /** 目标 Tab ID */
  targetId?: string;
  /** 元素引用 (aria-ref) */
  ref?: string;
  /** CSS selector (备用) */
  selector?: string;
  /** URL (navigate 用) */
  url?: string;
  /** 加载状态 */
  loadState?: 'domcontentloaded' | 'load' | 'networkidle';
  /** 引用类型 */
  refs?: 'aria' | 'role';
  /** DOM 深度限制 */
  depth?: number;
  /** 文本长度限制 */
  maxChars?: number;
  /** 包含标签信息 */
  labels?: boolean;
  /** 输入文本 */
  text?: string;
  /** 模拟人工输入 */
  slowly?: boolean;
  /** JS 函数代码 */
  fn?: string;
  /** 函数参数 */
  args?: any[];
  /** 按钮类型 */
  button?: 'left' | 'right' | 'middle';
  /** 双击 */
  doubleClick?: boolean;
  /** 修饰键 */
  modifiers?: ('Shift' | 'Control' | 'Alt' | 'Meta')[];
  /** 等待文本消失 */
  textGone?: string;
  /** 其他类型特定参数 */
  [key: string]: any;
}

// ============ Action 执行结果 ============

export interface ActionResult<T = any> {
  /** Action ID */
  action_id: string;
  /** 执行状态 */
  status: 'completed' | 'failed' | 'pending';
  /** 执行结果 */
  result?: T;
  /** 错误信息 */
  error?: ErrorDetail;
  /** 执行耗时 (ms) */
  duration_ms: number;
  /** 时间戳 */
  timestamp: number;
}

export interface ErrorDetail {
  /** 错误代码 */
  code: string;
  /** 错误消息 */
  message: string;
  /** 堆栈跟踪 */
  stack?: string;
  /** 可重试 */
  retryable: boolean;
}

// ============ 工作流定义 ============

export interface WorkflowDefinition {
  /** 工作流 ID */
  workflow_id: string;
  /** 工作流名称 */
  name: string;
  /** 版本号 */
  version: string;
  /** 描述 */
  description?: string;
  /** 输入参数定义 */
  inputs?: WorkflowInput[];
  /** Action 序列 (DAG 结构) */
  actions: WorkflowAction[];
  /** 错误处理配置 */
  error_handling?: ErrorHandlingConfig;
  /** 回滚配置 */
  rollback?: RollbackConfig;
}

export interface WorkflowInput {
  /** 参数名称 */
  name: string;
  /** 参数类型 */
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  /** 是否必需 */
  required?: boolean;
  /** 默认值 */
  default?: any;
}

export interface WorkflowAction {
  /** Action ID */
  id: string;
  /** Action 类型 */
  type: ActionType;
  /** 参数 */
  params: Record<string, any>;
  /** 依赖的 Action ID 列表 */
  depends_on?: string[];
  /** 超时时间 */
  timeout_ms?: number;
  /** 前置条件 */
  preconditions?: string[];
  /** 确认配置 */
  confirmation?: ConfirmationConfig;
  /** 是否敏感操作 */
  sensitive?: boolean;
}

// ============ 确认配置 ============

export interface ConfirmationConfig {
  /** 是否需要确认 */
  required: boolean;
  /** 确认消息 */
  message?: string;
  /** 确认级别 */
  level?: 'none' | 'auto' | 'human' | 'multi_party';
  /** 超时时间 */
  timeout_ms?: number;
}

// ============ 错误处理配置 ============

export interface ErrorHandlingConfig {
  /** 默认错误处理 */
  default: {
    retry_count: number;
    retry_delay_ms: number;
    on_max_retries: 'fail' | 'skip' | 'rollback';
  };
  /** 特定错误处理 */
  specific?: Array<{
    action_type: ActionType;
    error_pattern: string;
    handler: string;
  }>;
}

// ============ 回滚配置 ============

export interface RollbackConfig {
  /** 是否启用回滚 */
  enabled: boolean;
  /** 检查点配置 */
  checkpoints: Array<{
    after_action: string;
    type: 'snapshot' | 'state' | 'full';
    retention_ms: number;
  }>;
}

// ============ 执行状态 ============

export interface ExecutionState {
  /** 执行 ID */
  execution_id: string;
  /** 工作流 ID */
  workflow_id: string;
  /** 执行状态 */
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused';
  /** 进度信息 */
  progress: ProgressInfo;
  /** 执行结果 */
  result?: any;
  /** 错误信息 */
  error?: ErrorDetail;
  /** 开始时间 */
  started_at: number;
  /** 完成时间 */
  completed_at?: number;
  /** 检查点列表 */
  checkpoints: CheckpointInfo[];
  /** 待确认列表 */
  pending_confirmations: ConfirmationRequest[];
}

export interface ProgressInfo {
  /** 当前 Action ID */
  current_action: string;
  /** 已完成的 Action 数量 */
  completed_actions: number;
  /** 总 Action 数量 */
  total_actions: number;
  /** 进度百分比 (0-1) */
  percentage: number;
}

export interface CheckpointInfo {
  /** 检查点 ID */
  checkpoint_id: string;
  /** 类型 */
  type: 'snapshot' | 'state' | 'full';
  /** 创建时间 */
  created_at: number;
  /** 过期时间 */
  expires_at: number;
  /** 关联的 Action ID */
  action_id?: string;
  /** 数据大小 (bytes) */
  size_bytes?: number;
}

export interface ConfirmationRequest {
  /** 确认请求 ID */
  confirmation_id: string;
  /** 关联的 Action ID */
  action_id: string;
  /** 确认消息 */
  message: string;
  /** 风险级别 */
  risk_level: 'low' | 'medium' | 'high';
  /** 创建时间 */
  created_at: number;
  /** 过期时间 */
  expires_at: number;
  /** 选项 */
  options: string[];
}

// ============ Browser Session ============

export interface BrowserSession {
  /** Session ID */
  session_id: string;
  /** Browser instance reference */
  browser: any;
  /** Current Tab ID */
  current_tab_id?: string;
  /** Tab list */
  tabs: TabInfo[];
  /** Created at */
  created_at: number;
  /** Last used at */
  last_used_at: number;
}

export interface TabInfo {
  /** Tab ID */
  tab_id: string;
  /** Tab title */
  title: string;
  /** Current URL */
  url: string;
  /** Is active */
  active: boolean;
}

// ============ 工具类型 ============

export type ActionHandler<T = any> = (params: ActionParams, context: ExecutionContext) => Promise<ActionResult<T>>;

export interface ExecutionContext {
  /** Browser session */
  session: BrowserSession;
  /** Workflow execution state */
  execution: ExecutionState;
  /** Input parameters */
  inputs: Record<string, any>;
  /** Secrets */
  secrets?: Record<string, string>;
  /** Previous action results */
  action_results: Record<string, ActionResult>;
  /** Logger */
  logger: Logger;
}

export interface Logger {
  info: (message: string, ...args: any[]) => void;
  warn: (message: string, ...args: any[]) => void;
  error: (message: string, ...args: any[]) => void;
  debug: (message: string, ...args: any[]) => void;
}

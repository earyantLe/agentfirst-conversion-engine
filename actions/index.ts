/**
 * Browser Action 体系 - 原子化操作实现
 * 
 * @module actions
 * @version 1.0.0
 */

import { 
  BrowserAction, 
  ActionType, 
  ActionParams, 
  ActionResult, 
  ExecutionContext,
  ActionHandler 
} from '../types';
import { v4 as uuidv4 } from 'uuid';

// ============ Action Registry ============

export class ActionRegistry {
  private handlers: Map<ActionType, ActionHandler> = new Map();

  register(type: ActionType, handler: ActionHandler): void {
    this.handlers.set(type, handler);
  }

  get(type: ActionType): ActionHandler | undefined {
    return this.handlers.get(type);
  }

  has(type: ActionType): boolean {
    return this.handlers.has(type);
  }

  list(): ActionType[] {
    return Array.from(this.handlers.keys());
  }
}

// ============ Action Factory ============

export class ActionFactory {
  private registry: ActionRegistry;

  constructor(registry: ActionRegistry) {
    this.registry = registry;
  }

  create(params: {
    action_type: ActionType;
    params: ActionParams;
    timeout_ms?: number;
    retry_count?: number;
    preconditions?: string[];
  }): BrowserAction {
    const action_id = uuidv4();
    const idempotency_key = `${params.action_type}:${JSON.stringify(params.params)}`;

    return {
      action_id,
      action_type: params.action_type,
      version: '1.0.0',
      params: params.params,
      timeout_ms: params.timeout_ms ?? 30000,
      retry_count: params.retry_count ?? 0,
      preconditions: params.preconditions,
      idempotency_key,
    };
  }
}

// ============ Action Executor ============

export class ActionExecutor {
  private registry: ActionRegistry;

  constructor(registry: ActionRegistry) {
    this.registry = registry;
  }

  async execute(action: BrowserAction, context: ExecutionContext): Promise<ActionResult> {
    const startTime = Date.now();
    
    // 检查前置条件
    if (action.preconditions && action.preconditions.length > 0) {
      const snapshot = await context.session.browser.snapshot({
        refs: 'aria',
        targetId: context.session.current_tab_id,
      });
      
      for (const precondition of action.preconditions) {
        if (!snapshot.includes(precondition)) {
          return {
            action_id: action.action_id,
            status: 'failed',
            error: {
              code: 'PRECONDITION_FAILED',
              message: `前置条件未满足：${precondition}`,
              retryable: true,
            },
            duration_ms: Date.now() - startTime,
            timestamp: Date.now(),
          };
        }
      }
    }

    const handler = this.registry.get(action.action_type);
    if (!handler) {
      return {
        action_id: action.action_id,
        status: 'failed',
        error: {
          code: 'UNKNOWN_ACTION_TYPE',
          message: `未知的 Action 类型：${action.action_type}`,
          retryable: false,
        },
        duration_ms: Date.now() - startTime,
        timestamp: Date.now(),
      };
    }

    try {
      const result = await handler(action.params, context);
      return {
        ...result,
        duration_ms: Date.now() - startTime,
        timestamp: Date.now(),
      };
    } catch (error: any) {
      return {
        action_id: action.action_id,
        status: 'failed',
        error: {
          code: 'EXECUTION_ERROR',
          message: error.message || '执行失败',
          stack: error.stack,
          retryable: true,
        },
        duration_ms: Date.now() - startTime,
        timestamp: Date.now(),
      };
    }
  }
}

// ============ Navigation Actions ============

export const navigateAction: ActionHandler = async (params, context) => {
  const result = await context.session.browser.navigate({
    url: params.url!,
    targetId: params.targetId || context.session.current_tab_id,
    loadState: params.loadState || 'domcontentloaded',
  });

  return {
    action_id: '', // Will be set by executor
    status: 'completed',
    result,
    duration_ms: 0,
    timestamp: Date.now(),
  };
};

export const goBackAction: ActionHandler = async (params, context) => {
  await context.session.browser.act({
    kind: 'press',
    key: 'Back',
    targetId: params.targetId || context.session.current_tab_id,
  });

  return {
    action_id: '',
    status: 'completed',
    result: { navigated: true },
    duration_ms: 0,
    timestamp: Date.now(),
  };
};

export const goForwardAction: ActionHandler = async (params, context) => {
  await context.session.browser.act({
    kind: 'press',
    key: 'Forward',
    targetId: params.targetId || context.session.current_tab_id,
  });

  return {
    action_id: '',
    status: 'completed',
    result: { navigated: true },
    duration_ms: 0,
    timestamp: Date.now(),
  };
};

export const refreshAction: ActionHandler = async (params, context) => {
  await context.session.browser.navigate({
    url: params.url || '',
    targetId: params.targetId || context.session.current_tab_id,
    loadState: params.loadState || 'domcontentloaded',
  });

  return {
    action_id: '',
    status: 'completed',
    result: { refreshed: true },
    duration_ms: 0,
    timestamp: Date.now(),
  };
};

// ============ Snapshot Actions ============

export const snapshotAction: ActionHandler = async (params, context) => {
  const snapshot = await context.session.browser.snapshot({
    refs: params.refs || 'aria',
    targetId: params.targetId || context.session.current_tab_id,
    depth: params.depth,
    maxChars: params.maxChars,
    labels: params.labels,
  });

  return {
    action_id: '',
    status: 'completed',
    result: { snapshot },
    duration_ms: 0,
    timestamp: Date.now(),
  };
};

export const screenshotAction: ActionHandler = async (params, context) => {
  const screenshot = await context.session.browser.screenshot({
    targetId: params.targetId || context.session.current_tab_id,
    fullPage: params.fullPage || false,
    type: params.type || 'png',
  });

  return {
    action_id: '',
    status: 'completed',
    result: { screenshot },
    duration_ms: 0,
    timestamp: Date.now(),
  };
};

export const consoleAction: ActionHandler = async (params, context) => {
  const logs = await context.session.browser.console({
    targetId: params.targetId || context.session.current_tab_id,
    level: params.level || 'info',
  });

  return {
    action_id: '',
    status: 'completed',
    result: { logs },
    duration_ms: 0,
    timestamp: Date.now(),
  };
};

// ============ Interaction Actions ============

export const clickAction: ActionHandler = async (params, context) => {
  await context.session.browser.act({
    kind: 'click',
    ref: params.ref,
    selector: params.selector,
    targetId: params.targetId || context.session.current_tab_id,
    button: params.button || 'left',
    doubleClick: params.doubleClick || false,
    modifiers: params.modifiers,
  });

  return {
    action_id: '',
    status: 'completed',
    result: { clicked: true },
    duration_ms: 0,
    timestamp: Date.now(),
  };
};

export const typeAction: ActionHandler = async (params, context) => {
  await context.session.browser.act({
    kind: 'type',
    ref: params.ref,
    selector: params.selector,
    text: params.text!,
    targetId: params.targetId || context.session.current_tab_id,
    slowly: params.slowly || false,
  });

  return {
    action_id: '',
    status: 'completed',
    result: { typed: true },
    duration_ms: 0,
    timestamp: Date.now(),
  };
};

export const pressAction: ActionHandler = async (params, context) => {
  await context.session.browser.act({
    kind: 'press',
    key: params.key!,
    targetId: params.targetId || context.session.current_tab_id,
    modifiers: params.modifiers,
  });

  return {
    action_id: '',
    status: 'completed',
    result: { pressed: true },
    duration_ms: 0,
    timestamp: Date.now(),
  };
};

export const hoverAction: ActionHandler = async (params, context) => {
  await context.session.browser.act({
    kind: 'hover',
    ref: params.ref,
    selector: params.selector,
    targetId: params.targetId || context.session.current_tab_id,
  });

  return {
    action_id: '',
    status: 'completed',
    result: { hovered: true },
    duration_ms: 0,
    timestamp: Date.now(),
  };
};

export const dragAction: ActionHandler = async (params, context) => {
  await context.session.browser.act({
    kind: 'drag',
    startRef: params.startRef!,
    endRef: params.endRef!,
    targetId: params.targetId || context.session.current_tab_id,
  });

  return {
    action_id: '',
    status: 'completed',
    result: { dragged: true },
    duration_ms: 0,
    timestamp: Date.now(),
  };
};

export const selectAction: ActionHandler = async (params, context) => {
  await context.session.browser.act({
    kind: 'select',
    ref: params.ref,
    selector: params.selector,
    values: params.values!,
    targetId: params.targetId || context.session.current_tab_id,
  });

  return {
    action_id: '',
    status: 'completed',
    result: { selected: true },
    duration_ms: 0,
    timestamp: Date.now(),
  };
};

// ============ Evaluation Actions ============

export const evaluateAction: ActionHandler = async (params, context) => {
  const result = await context.session.browser.act({
    kind: 'evaluate',
    fn: params.fn!,
    args: params.args,
    targetId: params.targetId || context.session.current_tab_id,
  });

  return {
    action_id: '',
    status: 'completed',
    result: { evaluated: true, value: result },
    duration_ms: 0,
    timestamp: Date.now(),
  };
};

export const waitAction: ActionHandler = async (params, context) => {
  await context.session.browser.act({
    kind: 'wait',
    text: params.text,
    textGone: params.textGone,
    timeoutMs: params.timeoutMs || 30000,
    targetId: params.targetId || context.session.current_tab_id,
  });

  return {
    action_id: '',
    status: 'completed',
    result: { waited: true },
    duration_ms: 0,
    timestamp: Date.now(),
  };
};

// ============ Tab Management Actions ============

export const openAction: ActionHandler = async (params, context) => {
  const result = await context.session.browser.open({
    url: params.url!,
    targetId: params.targetId,
  });

  return {
    action_id: '',
    status: 'completed',
    result: { opened: true, tabId: result.tabId },
    duration_ms: 0,
    timestamp: Date.now(),
  };
};

export const closeAction: ActionHandler = async (params, context) => {
  await context.session.browser.act({
    kind: 'close',
    targetId: params.targetId || context.session.current_tab_id,
  });

  return {
    action_id: '',
    status: 'completed',
    result: { closed: true },
    duration_ms: 0,
    timestamp: Date.now(),
  };
};

export const focusAction: ActionHandler = async (params, context) => {
  await context.session.browser.focus({
    targetId: params.targetId!,
  });

  return {
    action_id: '',
    status: 'completed',
    result: { focused: true },
    duration_ms: 0,
    timestamp: Date.now(),
  };
};

export const tabsAction: ActionHandler = async (params, context) => {
  const tabs = await context.session.browser.tabs();
  return {
    action_id: '',
    status: 'completed',
    result: { tabs },
    duration_ms: 0,
    timestamp: Date.now(),
  };
};

// ============ Dialog & Upload Actions ============

export const dialogAction: ActionHandler = async (params, context) => {
  await context.session.browser.dialog({
    accept: params.accept ?? true,
    promptText: params.promptText,
  });

  return {
    action_id: '',
    status: 'completed',
    result: { handled: true },
    duration_ms: 0,
    timestamp: Date.now(),
  };
};

export const uploadAction: ActionHandler = async (params, context) => {
  await context.session.browser.upload({
    paths: params.paths!,
    inputRef: params.inputRef,
  });

  return {
    action_id: '',
    status: 'completed',
    result: { uploaded: true },
    duration_ms: 0,
    timestamp: Date.now(),
  };
};

// ============ Registry Initialization ============

export function initializeRegistry(): ActionRegistry {
  const registry = new ActionRegistry();

  // Navigation
  registry.register('navigate', navigateAction);
  registry.register('go_back', goBackAction);
  registry.register('go_forward', goForwardAction);
  registry.register('refresh', refreshAction);

  // Snapshot
  registry.register('snapshot', snapshotAction);
  registry.register('screenshot', screenshotAction);
  registry.register('console', consoleAction);

  // Interaction
  registry.register('click', clickAction);
  registry.register('type', typeAction);
  registry.register('press', pressAction);
  registry.register('hover', hoverAction);
  registry.register('drag', dragAction);
  registry.register('select', selectAction);

  // Evaluation
  registry.register('evaluate', evaluateAction);
  registry.register('wait', waitAction);

  // Tab Management
  registry.register('open', openAction);
  registry.register('close', closeAction);
  registry.register('focus', focusAction);
  registry.register('tabs', tabsAction);

  // Dialog & Upload
  registry.register('dialog', dialogAction);
  registry.register('upload', uploadAction);

  return registry;
}

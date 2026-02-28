import type {
  ActionSchema,
  ComponentSchema,
  ExpressionContext,
} from '../schema/types';
import { resolveExpression } from './expression';

interface ActionContext {
  baseUrl: string;
  expressionContext: ExpressionContext;
  triggerReload: (target: string) => void;
  openDialog: (entry: {
    id: string;
    title: string;
    body: ComponentSchema;
    width?: number | string;
    expressionContext?: Partial<ExpressionContext>;
  }) => void;
  closeDialog: () => void;
  navigate?: (url: string) => void;
  requestConfirm?: (message: string) => Promise<boolean>;
}

let dialogCounter = 0;

export async function dispatchAction(
  action: ActionSchema | ActionSchema[],
  ctx: ActionContext,
): Promise<void> {
  const actions = Array.isArray(action) ? action : [action];

  for (const act of actions) {
    await dispatchSingle(act, ctx);
  }
}

async function dispatchSingle(
  action: ActionSchema,
  ctx: ActionContext,
): Promise<void> {
  switch (action.type) {
    case 'api':
      return handleApiAction(action, ctx);
    case 'reload':
      ctx.triggerReload(action.target);
      return;
    case 'dialog':
      ctx.openDialog({
        id: `dialog-${++dialogCounter}`,
        title: String(
          resolveExpression(action.title, ctx.expressionContext) ??
            action.title,
        ),
        body: action.body,
        width: action.width,
        expressionContext: ctx.expressionContext,
      });
      return;
    case 'link':
      return handleLinkAction(action, ctx);
    case 'close':
      ctx.closeDialog();
      return;
    case 'confirm':
      return handleConfirmAction(action, ctx);
  }
}

async function handleApiAction(
  action: Extract<ActionSchema, { type: 'api' }>,
  ctx: ActionContext,
): Promise<void> {
  const url = resolveUrl(
    String(resolveExpression(action.url, ctx.expressionContext) ?? action.url),
    ctx.baseUrl,
  );

  const body = action.body
    ? resolveBody(action.body, ctx.expressionContext)
    : undefined;

  try {
    const response = await fetch(url, {
      method: action.method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      if (action.onError) {
        const errorCtx: ActionContext = {
          ...ctx,
          expressionContext: {
            ...ctx.expressionContext,
            response: errorData,
          },
        };
        await dispatchAction(action.onError, errorCtx);
      }
      return;
    }

    const data = await response.json().catch(() => null);

    if (action.onSuccess) {
      const successCtx: ActionContext = {
        ...ctx,
        expressionContext: {
          ...ctx.expressionContext,
          response: data,
        },
      };
      await dispatchAction(action.onSuccess, successCtx);
    }
  } catch {
    if (action.onError) {
      await dispatchAction(action.onError, ctx);
    }
  }
}

function handleLinkAction(
  action: Extract<ActionSchema, { type: 'link' }>,
  ctx: ActionContext,
): void {
  const url = String(
    resolveExpression(action.url, ctx.expressionContext) ?? action.url,
  );
  if (ctx.navigate) {
    ctx.navigate(url);
  } else {
    window.location.href = url;
  }
}

async function handleConfirmAction(
  action: Extract<ActionSchema, { type: 'confirm' }>,
  ctx: ActionContext,
): Promise<void> {
  const message = String(
    resolveExpression(action.message, ctx.expressionContext) ?? action.message,
  );

  const confirmed = ctx.requestConfirm
    ? await ctx.requestConfirm(message)
    : window.confirm(message);

  if (confirmed) {
    await dispatchAction(action.onConfirm, ctx);
  } else if (action.onCancel) {
    await dispatchAction(action.onCancel, ctx);
  }
}

// ---- Helpers ----

function resolveUrl(url: string, baseUrl: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  // Relative URL like "/db/todo" → baseUrl + url
  return baseUrl + url;
}

function resolveBody(
  body: Record<string, unknown>,
  exprCtx: ExpressionContext,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    result[key] = resolveExpression(value, exprCtx);
  }
  return result;
}

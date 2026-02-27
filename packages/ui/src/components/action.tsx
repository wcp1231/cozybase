import { useState } from 'react';
import { clsx } from 'clsx';
import { registerBuiltinComponent, type SchemaComponentProps } from '../engine/registry';
import { usePageContext } from '../engine/context';
import { resolveExpression } from '../engine/expression';
import { dispatchAction } from '../engine/action';
import type {
  ButtonComponent,
  LinkComponent,
  DialogComponent,
  AlertComponent,
  EmptyComponent,
} from '../schema/types';

// ============================================================
// Shared helpers
// ============================================================

function useActionContext() {
  const ctx = usePageContext();
  return {
    baseUrl: ctx.baseUrl,
    triggerReload: ctx.triggerReload,
    openDialog: ctx.openDialog,
    closeDialog: ctx.closeDialog,
    requestConfirm: ctx.requestConfirm,
  };
}

// ============================================================
// button
// ============================================================

const variantClasses: Record<string, string> = {
  primary: 'bg-primary text-white border-0',
  secondary: 'bg-secondary text-white border-0',
  danger: 'bg-danger text-white border-0',
  ghost: 'bg-transparent text-text-secondary border border-border-strong',
};

function ButtonRenderer({ schema, exprContext }: SchemaComponentProps) {
  const s = schema as ButtonComponent;
  const actionCtx = useActionContext();
  const [busy, setBusy] = useState(false);

  // Evaluate disabled and loading from expressions
  const isDisabledExpr = s.disabled !== undefined
    ? resolveExpression(s.disabled, exprContext)
    : false;
  const isLoadingExpr = s.loading !== undefined
    ? resolveExpression(s.loading, exprContext)
    : false;

  const isDisabled = !!isDisabledExpr || busy;
  const isLoading = !!isLoadingExpr || busy;

  const variant = s.variant ?? 'primary';

  const handleClick = async () => {
    if (isDisabled) return;
    setBusy(true);
    try {
      await dispatchAction(s.action, { ...actionCtx, expressionContext: exprContext });
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      disabled={isDisabled}
      onClick={handleClick}
      className={clsx(
        'px-4 py-2 text-sm font-medium rounded-sm inline-flex items-center gap-1.5 transition-opacity',
        variantClasses[variant] ?? variantClasses.primary,
        isDisabled && 'opacity-60 cursor-not-allowed',
        !isDisabled && 'cursor-pointer',
        s.className,
      )}
      style={s.style}
    >
      {isLoading && (
        <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
      )}
      {isLoading ? '...' : s.label}
    </button>
  );
}

// ============================================================
// link
// ============================================================

function LinkRenderer({ schema, exprContext }: SchemaComponentProps) {
  const s = schema as LinkComponent;
  const actionCtx = useActionContext();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    dispatchAction(s.action, { ...actionCtx, expressionContext: exprContext });
  };

  return (
    <a
      href="#"
      onClick={handleClick}
      className={clsx('text-primary no-underline text-sm cursor-pointer hover:underline', s.className)}
      style={s.style}
    >
      {s.text}
    </a>
  );
}

// ============================================================
// dialog (in-body placement)
// ============================================================

function DialogRenderer({ schema, renderChild }: SchemaComponentProps) {
  const s = schema as DialogComponent;
  const ctx = usePageContext();

  return (
    <div
      className="fixed inset-0 bg-overlay flex items-center justify-center z-[1000]"
      onClick={(e) => {
        if (e.target === e.currentTarget) ctx.closeDialog();
      }}
    >
      <div
        className={clsx('bg-bg rounded-md p-6 max-h-[80vh] overflow-auto', s.className)}
        style={{ width: s.width ?? 480, ...s.style }}
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h3 className="m-0 text-lg font-semibold text-text">
            {s.title}
          </h3>
          <button
            onClick={() => ctx.closeDialog()}
            className="border-0 bg-transparent text-lg cursor-pointer text-text-muted p-1"
          >
            &#x2715;
          </button>
        </div>
        {/* Children */}
        {s.children.map((child, i) =>
          renderChild(child, (child as { id?: string }).id ?? i),
        )}
      </div>
    </div>
  );
}

// ============================================================
// alert
// ============================================================

const alertTypeClasses: Record<string, { classes: string; icon: string }> = {
  info: {
    classes: 'bg-info-bg border-info-border text-info-text',
    icon: '\u2139',
  },
  success: {
    classes: 'bg-success-bg border-success-border text-success-text',
    icon: '\u2713',
  },
  warning: {
    classes: 'bg-warning-bg border-warning-border text-warning-text',
    icon: '\u26A0',
  },
  error: {
    classes: 'bg-error-bg border-error-border text-error-text',
    icon: '\u2717',
  },
};

function AlertRenderer({ schema }: SchemaComponentProps) {
  const s = schema as AlertComponent;
  const alertType = s.alertType ?? 'info';
  const config = alertTypeClasses[alertType] ?? alertTypeClasses.info;

  return (
    <div
      className={clsx(
        'flex items-start gap-2.5 px-3.5 py-2.5 rounded-sm border text-sm leading-relaxed',
        config.classes,
        s.className,
      )}
      style={s.style}
    >
      <span className="text-base leading-snug shrink-0">
        {config.icon}
      </span>
      <span>{s.message}</span>
    </div>
  );
}

// ============================================================
// empty
// ============================================================

function EmptyRenderer({ schema }: SchemaComponentProps) {
  const s = schema as EmptyComponent;

  return (
    <div
      className={clsx('flex flex-col items-center justify-center py-10 px-5 text-text-placeholder text-sm', s.className)}
      style={s.style}
    >
      <div className="text-[32px] mb-2 opacity-50">
        &#x1F4AD;
      </div>
      <span>{s.message ?? '\u6682\u65E0\u6570\u636E'}</span>
    </div>
  );
}

// ============================================================
// Register all components
// ============================================================

registerBuiltinComponent('button', ButtonRenderer);
registerBuiltinComponent('link', LinkRenderer);
registerBuiltinComponent('dialog', DialogRenderer);
registerBuiltinComponent('alert', AlertRenderer);
registerBuiltinComponent('empty', EmptyRenderer);

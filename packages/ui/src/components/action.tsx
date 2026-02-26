import { useState } from 'react';
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
  };
}

// ============================================================
// button
// ============================================================

const variantStyles: Record<string, React.CSSProperties> = {
  primary: {
    backgroundColor: '#2563EB',
    color: '#fff',
    border: 'none',
  },
  secondary: {
    backgroundColor: '#6B7280',
    color: '#fff',
    border: 'none',
  },
  danger: {
    backgroundColor: '#DC2626',
    color: '#fff',
    border: 'none',
  },
  ghost: {
    backgroundColor: 'transparent',
    color: '#374151',
    border: '1px solid #D1D5DB',
  },
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
  const vstyle = variantStyles[variant] ?? variantStyles.primary;

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
      style={{
        padding: '8px 16px',
        fontSize: 14,
        fontWeight: 500,
        borderRadius: 4,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        opacity: isDisabled ? 0.6 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        transition: 'opacity 0.15s',
        ...vstyle,
        ...s.style,
      }}
    >
      {isLoading && (
        <span
          style={{
            display: 'inline-block',
            width: 14,
            height: 14,
            border: '2px solid currentColor',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 0.6s linear infinite',
          }}
        />
      )}
      {isLoading ? '...' : s.label}
      {/* Inject keyframes for spinner */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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
      style={{
        color: '#2563EB',
        textDecoration: 'none',
        fontSize: 14,
        cursor: 'pointer',
        ...s.style,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.textDecoration = 'underline';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLAnchorElement).style.textDecoration = 'none';
      }}
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
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) ctx.closeDialog();
      }}
    >
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: 8,
          padding: 24,
          width: s.width ?? 480,
          maxHeight: '80vh',
          overflow: 'auto',
          ...s.style,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#111827' }}>
            {s.title}
          </h3>
          <button
            onClick={() => ctx.closeDialog()}
            style={{
              border: 'none',
              background: 'none',
              fontSize: 18,
              cursor: 'pointer',
              color: '#6B7280',
              padding: 4,
            }}
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

const alertTypeStyles: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  info: {
    bg: '#EFF6FF',
    border: '#BFDBFE',
    text: '#1E40AF',
    icon: '\u2139',  // i
  },
  success: {
    bg: '#F0FDF4',
    border: '#BBF7D0',
    text: '#166534',
    icon: '\u2713',  // checkmark
  },
  warning: {
    bg: '#FFFBEB',
    border: '#FDE68A',
    text: '#92400E',
    icon: '\u26A0',  // warning sign
  },
  error: {
    bg: '#FEF2F2',
    border: '#FECACA',
    text: '#991B1B',
    icon: '\u2717',  // x mark
  },
};

function AlertRenderer({ schema }: SchemaComponentProps) {
  const s = schema as AlertComponent;
  const alertType = s.alertType ?? 'info';
  const colors = alertTypeStyles[alertType] ?? alertTypeStyles.info;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '10px 14px',
        borderRadius: 4,
        backgroundColor: colors.bg,
        border: `1px solid ${colors.border}`,
        color: colors.text,
        fontSize: 14,
        lineHeight: '1.5',
        ...s.style,
      }}
    >
      <span style={{ fontSize: 16, lineHeight: '1.4', flexShrink: 0 }}>
        {colors.icon}
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
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
        color: '#9CA3AF',
        fontSize: 14,
        ...s.style,
      }}
    >
      <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.5 }}>
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

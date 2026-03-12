import { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { registerBuiltinComponent, type SchemaComponentProps } from '../engine/registry';
import { usePageContext } from '../engine/context';
import { dispatchAction } from '../engine/action';
import { resolveExpression } from '../engine/expression';
import { toArray } from '../renderer';
import { CzTabs, CzTabsList, CzTabsTrigger, CzTabsContent } from '../primitives';
import type {
  PageComponent,
  RowComponent,
  ColComponent,
  CardComponent,
  TabsComponent,
  DividerComponent,
  ComponentSchema,
} from '../schema/types';

// ============================================================
// page
// ============================================================

function PageComp({ schema, renderChild }: SchemaComponentProps) {
  const s = schema as PageComponent;

  return (
    <div
      className={clsx('w-full min-w-0 flex flex-col gap-4', s.className)}
      style={s.style}
    >
      {s.children?.map((child: ComponentSchema, i: number) =>
        renderChild(child, (child as { id?: string }).id ?? i),
      )}
    </div>
  );
}

registerBuiltinComponent('page', PageComp);

// ============================================================
// row
// ============================================================

function RowComp({ schema, renderChild }: SchemaComponentProps) {
  const s = schema as RowComponent;

  return (
    <div
      className={clsx('flex flex-row', s.wrap && 'flex-wrap', s.className)}
      style={{
        justifyContent: s.justify ?? 'start',
        alignItems: s.align ?? 'stretch',
        gap: s.gap ?? 8,
        ...s.style,
      }}
    >
      {s.children?.map((child: ComponentSchema, i: number) =>
        renderChild(child, (child as { id?: string }).id ?? i),
      )}
    </div>
  );
}

registerBuiltinComponent('row', RowComp);

// ============================================================
// col
// ============================================================

function ColComp({ schema, renderChild }: SchemaComponentProps) {
  const s = schema as ColComponent;

  return (
    <div
      className={clsx('flex flex-col', s.className)}
      style={{
        alignItems: s.align ?? 'stretch',
        gap: s.gap ?? 8,
        ...s.style,
      }}
    >
      {s.children?.map((child: ComponentSchema, i: number) =>
        renderChild(child, (child as { id?: string }).id ?? i),
      )}
    </div>
  );
}

registerBuiltinComponent('col', ColComp);

// ============================================================
// card
// ============================================================

function CardComp({ schema, renderChild, exprContext }: SchemaComponentProps) {
  const s = schema as CardComponent;
  const padding = s.padding ?? 16;
  const ctx = usePageContext();
  const hasAction = !!s.action;
  const resolvedTitle =
    s.title === undefined
      ? undefined
      : resolveExpression(s.title, exprContext);
  const titleText =
    resolvedTitle === undefined ||
    resolvedTitle === null ||
    resolvedTitle === ''
      ? undefined
      : String(resolvedTitle);

  const handleClick = hasAction
    ? () => {
        dispatchAction(s.action!, {
          baseUrl: ctx.baseUrl,
          triggerReload: ctx.triggerReload,
          openDialog: ctx.openDialog,
          closeDialog: ctx.closeDialog,
          requestConfirm: ctx.requestConfirm,
          navigate: ctx.navigate,
          expressionContext: exprContext,
        });
      }
    : undefined;

  return (
    <div
      className={clsx(
        'border border-border rounded-md shadow-sm bg-bg overflow-hidden',
        hasAction && 'cursor-pointer transition-shadow hover:shadow-md',
        s.className,
      )}
      style={s.style}
      onClick={handleClick}
    >
      {titleText && (
        <div
          className="font-semibold text-base text-text"
          style={{ padding: `${padding}px ${padding}px 0` }}
        >
          {titleText}
        </div>
      )}
      <div style={{ padding }}>
        {s.children?.map((child: ComponentSchema, i: number) =>
          renderChild(child, (child as { id?: string }).id ?? i),
        )}
      </div>
    </div>
  );
}

registerBuiltinComponent('card', CardComp);

// ============================================================
// tabs
// ============================================================

function TabsComp({ schema, renderChild }: SchemaComponentProps) {
  const s = schema as TabsComponent;
  const items = s.items ?? [];
  const defaultVal = s.defaultValue ?? items[0]?.value ?? '';

  const [activeTab, setActiveTab] = useState(defaultVal);
  const ctx = usePageContext();

  // Register / update / unregister with PageContext when the component has an id
  useEffect(() => {
    if (!s.id) return;
    ctx.registerComponent(s.id, { value: activeTab });
    return () => {
      ctx.unregisterComponent(s.id!);
    };
    // Only register/unregister on mount/unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.id]);

  useEffect(() => {
    if (!s.id) return;
    ctx.updateComponent(s.id, { value: activeTab });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, s.id]);

  return (
    <CzTabs value={activeTab} onValueChange={setActiveTab} className={s.className} style={s.style}>
      <CzTabsList>
        {items.map((item) => (
          <CzTabsTrigger key={item.value} value={item.value}>
            {item.label}
          </CzTabsTrigger>
        ))}
      </CzTabsList>
      {items.map((item) =>
        item.body ? (
          <CzTabsContent key={item.value} value={item.value}>
            {toArray<ComponentSchema>(item.body).map((child: ComponentSchema, i: number) =>
              renderChild(child, (child as { id?: string }).id ?? i),
            )}
          </CzTabsContent>
        ) : null,
      )}
    </CzTabs>
  );
}

registerBuiltinComponent('tabs', TabsComp);

// ============================================================
// divider
// ============================================================

function DividerComp({ schema }: SchemaComponentProps) {
  const s = schema as DividerComponent;

  if (s.label) {
    return (
      <div
        className={clsx('flex items-center gap-3 my-2', s.className)}
        style={s.style}
      >
        <div className="flex-1 h-px bg-border" />
        <span className="text-[13px] text-text-placeholder whitespace-nowrap">
          {s.label}
        </span>
        <div className="flex-1 h-px bg-border" />
      </div>
    );
  }

  return (
    <hr
      className={clsx('border-0 border-t border-border my-2', s.className)}
      style={s.style}
    />
  );
}

registerBuiltinComponent('divider', DividerComp);

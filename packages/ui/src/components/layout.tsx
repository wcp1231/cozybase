import { useState, useEffect } from 'react';
import { registerBuiltinComponent, type SchemaComponentProps } from '../engine/registry';
import { usePageContext } from '../engine/context';
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
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        ...s.style,
      }}
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
      style={{
        display: 'flex',
        flexDirection: 'row',
        justifyContent: s.justify ?? 'start',
        alignItems: s.align ?? 'stretch',
        gap: s.gap ?? 8,
        flexWrap: s.wrap ? 'wrap' : 'nowrap',
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
      style={{
        display: 'flex',
        flexDirection: 'column',
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

function CardComp({ schema, renderChild }: SchemaComponentProps) {
  const s = schema as CardComponent;
  const padding = s.padding ?? 16;

  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        backgroundColor: '#fff',
        overflow: 'hidden',
        ...s.style,
      }}
    >
      {s.title && (
        <div
          style={{
            padding: `${padding}px ${padding}px 0`,
            fontWeight: 600,
            fontSize: 16,
            color: '#111827',
          }}
        >
          {s.title}
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

  const activeItem = items.find((item) => item.value === activeTab);

  return (
    <div style={{ ...s.style }}>
      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid #e5e7eb',
          gap: 0,
        }}
      >
        {items.map((item) => {
          const isActive = item.value === activeTab;
          return (
            <button
              key={item.value}
              onClick={() => setActiveTab(item.value)}
              style={{
                padding: '8px 16px',
                cursor: 'pointer',
                border: 'none',
                borderBottom: isActive ? '2px solid #3b82f6' : '2px solid transparent',
                backgroundColor: 'transparent',
                color: isActive ? '#3b82f6' : '#6b7280',
                fontWeight: isActive ? 600 : 400,
                fontSize: 14,
                transition: 'color 0.15s, border-color 0.15s',
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Tab body (only rendered when items have body content) */}
      {activeItem?.body && (
        <div style={{ paddingTop: 16 }}>
          {activeItem.body.map((child: ComponentSchema, i: number) =>
            renderChild(child, (child as { id?: string }).id ?? i),
          )}
        </div>
      )}
    </div>
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
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          margin: '8px 0',
          ...s.style,
        }}
      >
        <div style={{ flex: 1, height: 1, backgroundColor: '#e5e7eb' }} />
        <span style={{ fontSize: 13, color: '#9ca3af', whiteSpace: 'nowrap' }}>
          {s.label}
        </span>
        <div style={{ flex: 1, height: 1, backgroundColor: '#e5e7eb' }} />
      </div>
    );
  }

  return (
    <hr
      style={{
        border: 'none',
        borderTop: '1px solid #e5e7eb',
        margin: '8px 0',
        ...s.style,
      }}
    />
  );
}

registerBuiltinComponent('divider', DividerComp);

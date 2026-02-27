import { Component, type ErrorInfo, type ReactNode } from 'react';
import type {
  PageSchema,
  ComponentSchema,
  CustomComponentSchema,
  ExpressionContext,
} from './schema/types';
import {
  PageProvider,
  usePageContext,
  useComponentStates,
  useDialogs,
} from './engine/context';
import { resolveExpression } from './engine/expression';
import {
  builtinRegistry,
  type SchemaComponentProps,
} from './engine/registry';

// ---- Public API ----

export interface SchemaRendererProps {
  schema: PageSchema;
  baseUrl: string;
  components?: Record<string, CustomComponentSchema>;
}

export function SchemaRenderer({
  schema,
  baseUrl,
  components,
}: SchemaRendererProps) {
  return (
    <PageProvider baseUrl={baseUrl} customComponents={components}>
      <PageBody body={schema.body} customComponents={components} />
      <DialogLayer customComponents={components} />
    </PageProvider>
  );
}

// ---- Internal ----

function PageBody({
  body,
  customComponents,
}: {
  body: ComponentSchema[];
  customComponents?: Record<string, CustomComponentSchema>;
}) {
  return (
    <>
      {body.map((child, i) => (
        <NodeRenderer
          key={(child as { id?: string }).id ?? i}
          schema={child}
          customComponents={customComponents}
        />
      ))}
    </>
  );
}

function DialogLayer({
  customComponents,
}: {
  customComponents?: Record<string, CustomComponentSchema>;
}) {
  const dialogs = useDialogs();
  const ctx = usePageContext();

  if (dialogs.length === 0) return null;

  return (
    <>
      {dialogs.map((dialog) => (
        <div
          key={dialog.id}
          className="fixed inset-0 bg-overlay flex items-center justify-center z-[1000]"
          onClick={(e) => {
            if (e.target === e.currentTarget) ctx.closeDialog();
          }}
        >
          <div
            className="bg-bg rounded-md p-6 max-h-[80vh] overflow-auto"
            style={{ width: dialog.width ?? 480 }}
          >
            <div className="flex justify-between items-center mb-4">
              <h3 className="m-0">{dialog.title}</h3>
              <button
                onClick={() => ctx.closeDialog()}
                className="border-0 bg-transparent text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>
            <NodeRenderer
              schema={dialog.body}
              customComponents={customComponents}
            />
          </div>
        </div>
      ))}
    </>
  );
}

// ---- NodeRenderer: the recursive core ----

export function NodeRenderer({
  schema,
  customComponents,
  extraContext,
}: {
  schema: ComponentSchema;
  customComponents?: Record<string, CustomComponentSchema>;
  extraContext?: Partial<ExpressionContext>;
}) {
  const componentStates = useComponentStates();

  // Build expression context
  const exprCtx: ExpressionContext = {
    components: componentStates,
    ...extraContext,
  };

  // Check visibility
  if (schema.visible !== undefined) {
    const visible = resolveExpression(schema.visible, exprCtx);
    if (visible === false || visible === 'false') return null;
  }

  // Check if it's a custom component that needs template expansion
  const schemaType = schema.type;
  if (
    customComponents &&
    schemaType in customComponents &&
    !builtinRegistry.has(schemaType)
  ) {
    return renderCustomComponent(
      schema,
      customComponents[schemaType],
      customComponents,
      exprCtx,
    );
  }

  // Look up built-in component
  const Comp = builtinRegistry.get(schemaType);
  if (!Comp) {
    return (
      <div className="p-2 bg-error-bg border border-error-border rounded-sm text-error-text text-xs">
        未知组件: {schemaType}
      </div>
    );
  }

  const renderChild = (
    childSchema: ComponentSchema,
    key?: string | number,
  ): ReactNode => (
    <NodeRenderer
      key={key}
      schema={childSchema}
      customComponents={customComponents}
      extraContext={extraContext}
    />
  );

  return (
    <ErrorBoundary type={schemaType}>
      <Comp schema={schema} exprContext={exprCtx} renderChild={renderChild} />
    </ErrorBoundary>
  );
}

// ---- Custom component expansion ----

function renderCustomComponent(
  instance: ComponentSchema,
  definition: CustomComponentSchema,
  customComponents: Record<string, CustomComponentSchema>,
  parentCtx: ExpressionContext,
): ReactNode {
  // Resolve props passed to the instance
  const instanceProps = (instance as { props?: Record<string, unknown> }).props ?? {};
  const resolvedProps: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(instanceProps)) {
    resolvedProps[key] = resolveExpression(value, parentCtx);
  }

  // Apply defaults from definition
  if (definition.props) {
    for (const [key, propDef] of Object.entries(definition.props)) {
      if (resolvedProps[key] === undefined && propDef.default !== undefined) {
        resolvedProps[key] = propDef.default;
      }
    }
  }

  // Render the body template with props in context
  return (
    <NodeRenderer
      schema={definition.body}
      customComponents={customComponents}
      extraContext={{
        ...parentCtx,
        props: resolvedProps,
      }}
    />
  );
}

// ---- Error Boundary ----

class ErrorBoundary extends Component<
  { type: string; children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[SchemaRenderer] Error in component "${this.props.type}":`, error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-2 bg-warning-bg border border-warning-border rounded-sm text-warning-text text-xs">
          组件 "{this.props.type}" 渲染出错: {this.state.error.message}
        </div>
      );
    }
    return this.props.children;
  }
}

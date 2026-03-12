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
  useConfirm,
} from './engine/context';
import { resolveExpression, resolveStyleExpressions } from './engine/expression';
import { builtinRegistry } from './engine/registry';
import { applyBuiltinSchemaDefaults } from './default-styling';
import {
  CzDialog,
  CzDialogContent,
  CzDialogTitle,
  CzDialogClose,
  CzAlertDialog,
  CzAlertDialogContent,
  CzAlertDialogTitle,
  CzAlertDialogDescription,
  CzAlertDialogAction,
  CzAlertDialogCancel,
} from './primitives';

// ---- Public API ----

/** Coerce a value that should be an array into one (handles null, undefined, single objects). */
export function toArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value == null) return [];
  if (typeof value === 'object') return [value as T];
  return [];
}

export interface SchemaRendererProps {
  schema: PageSchema;
  baseUrl: string;
  currentPath?: string;
  components?: Record<string, CustomComponentSchema>;
  params?: Record<string, string>;
  navigate?: (url: string) => void;
}

export function SchemaRenderer({
  schema,
  baseUrl,
  currentPath,
  components,
  params,
  navigate,
}: SchemaRendererProps) {
  const extraContext = params ? { params } : undefined;
  return (
    <PageProvider
      baseUrl={baseUrl}
      currentPath={currentPath}
      customComponents={components}
      navigate={navigate}
    >
      <PageBody body={schema.body} customComponents={components} extraContext={extraContext} />
      <DialogLayer customComponents={components} />
      <ConfirmLayer />
    </PageProvider>
  );
}

// ---- Internal ----

function PageBody({
  body,
  customComponents,
  extraContext,
}: {
  body: ComponentSchema[];
  customComponents?: Record<string, CustomComponentSchema>;
  extraContext?: Partial<ExpressionContext>;
}) {
  return (
    <>
      {toArray<ComponentSchema>(body).map((child, i) => (
        <NodeRenderer
          key={(child as { id?: string }).id ?? i}
          schema={child}
          customComponents={customComponents}
          extraContext={extraContext}
          siblingIndex={i}
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
      {dialogs.map((dialog, index) => (
        <CzDialog
          key={dialog.id}
          open={true}
          onOpenChange={(open) => {
            if (!open) ctx.closeDialog();
          }}
        >
          <CzDialogContent
            className="max-w-none"
            style={{ width: dialog.width ?? 480 }}
            level={index}
            aria-describedby={undefined}
          >
            <div className="flex justify-between items-center mb-4">
              <CzDialogTitle className="m-0">{dialog.title}</CzDialogTitle>
              <CzDialogClose className="border-0 bg-transparent text-lg cursor-pointer text-text-muted p-1">
                &#x2715;
              </CzDialogClose>
            </div>
            <NodeRenderer
              schema={dialog.body}
              customComponents={customComponents}
              extraContext={dialog.expressionContext}
            />
          </CzDialogContent>
        </CzDialog>
      ))}
    </>
  );
}

function ConfirmLayer() {
  const confirm = useConfirm();
  const dialogs = useDialogs();
  const ctx = usePageContext();

  if (!confirm) return null;

  return (
    <CzAlertDialog
      open={true}
      onOpenChange={(open) => {
        if (!open) ctx.resolveConfirm(false);
      }}
    >
      <CzAlertDialogContent level={dialogs.length}>
        <CzAlertDialogTitle>Confirm</CzAlertDialogTitle>
        <CzAlertDialogDescription>{confirm.message}</CzAlertDialogDescription>
        <div className="flex justify-end gap-2 mt-4">
          <CzAlertDialogCancel onClick={() => ctx.resolveConfirm(false)}>
            Cancel
          </CzAlertDialogCancel>
          <CzAlertDialogAction onClick={() => ctx.resolveConfirm(true)}>
            Confirm
          </CzAlertDialogAction>
        </div>
      </CzAlertDialogContent>
    </CzAlertDialog>
  );
}

// ---- NodeRenderer: the recursive core ----

export function NodeRenderer({
  schema,
  customComponents,
  extraContext,
  siblingIndex = 0,
}: {
  schema: ComponentSchema;
  customComponents?: Record<string, CustomComponentSchema>;
  extraContext?: Partial<ExpressionContext>;
  siblingIndex?: number;
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

  const resolvedSchema = applyBuiltinSchemaDefaults(resolveSchemaBaseProps(schema, exprCtx));

  // Check if it's a custom component that needs template expansion
  const schemaType = resolvedSchema.type;
  const schemaId =
    (resolvedSchema as { id?: string }).id ?? `${schemaType}-${siblingIndex}`;
  if (
    customComponents &&
    schemaType in customComponents &&
    !builtinRegistry.has(schemaType)
  ) {
    return (
      <div data-schema-id={schemaId} data-schema-type={schemaType} style={{ display: 'contents' }}>
        {renderCustomComponent(
          resolvedSchema,
          customComponents[schemaType],
          customComponents,
          exprCtx,
        )}
      </div>
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
      siblingIndex={typeof key === 'number' ? key : 0}
    />
  );

  return (
    <div data-schema-id={schemaId} data-schema-type={schemaType} style={{ display: 'contents' }}>
      <ErrorBoundary type={schemaType}>
        <Comp schema={resolvedSchema} exprContext={exprCtx} renderChild={renderChild} />
      </ErrorBoundary>
    </div>
  );
}

function resolveSchemaBaseProps(
  schema: ComponentSchema,
  exprCtx: ExpressionContext,
): ComponentSchema {
  const resolvedClassName =
    schema.className !== undefined
      ? resolveExpression(schema.className, exprCtx)
      : undefined;
  const className =
    resolvedClassName === undefined ||
    resolvedClassName === null ||
    resolvedClassName === ''
      ? undefined
      : String(resolvedClassName);

  const style = resolveStyleExpressions(schema.style, exprCtx);

  if (
    className === schema.className &&
    schema.style === undefined &&
    style === undefined
  ) {
    return schema;
  }

  return {
    ...schema,
    className,
    style,
  } as ComponentSchema;
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

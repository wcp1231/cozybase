import {
  CzDialog,
  CzDialogContent,
  CzDialogTitle,
  CzDialogClose,
  SchemaRenderer,
  type ComponentSchema,
  type CustomComponentSchema,
} from '@cozybase/ui';
import { EditorOverlay } from './editor-overlay';

interface DialogPreviewOverlayProps {
  title: string;
  body: ComponentSchema;
  baseUrl: string;
  components?: Record<string, CustomComponentSchema>;
  params?: Record<string, string>;
  navigate?: (url: string) => void;
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  onSelect: (nodeId: string | null) => void;
  onHover: (nodeId: string | null) => void;
  onClose: () => void;
}

export function DialogPreviewOverlay({
  title,
  body,
  baseUrl,
  components,
  params,
  navigate,
  selectedNodeId,
  hoveredNodeId,
  onSelect,
  onHover,
  onClose,
}: DialogPreviewOverlayProps) {
  // Wrap body in a minimal page schema for SchemaRenderer
  const pageSchema = {
    path: '__dialog_preview__',
    title,
    body: [body],
  };

  return (
    <CzDialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <CzDialogContent
        className="max-w-none"
        style={{ width: 640 }}
        level={10}
        aria-describedby={undefined}
      >
        <div className="mb-4 flex items-center justify-between">
          <CzDialogTitle className="m-0">Dialog 预览: {title}</CzDialogTitle>
          <CzDialogClose className="cursor-pointer border-0 bg-transparent p-1 text-lg text-[#94A3B8] hover:text-[#334155]">
            &#x2715;
          </CzDialogClose>
        </div>
        <div className="cz-app-canvas relative min-h-[120px] rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4">
          <SchemaRenderer
            schema={pageSchema}
            baseUrl={baseUrl}
            components={components}
            params={params}
            navigate={navigate}
          />
          <EditorOverlay
            active={true}
            selectedNodeId={selectedNodeId}
            hoveredNodeId={hoveredNodeId}
            onSelect={onSelect}
            onHover={onHover}
          />
        </div>
      </CzDialogContent>
    </CzDialog>
  );
}

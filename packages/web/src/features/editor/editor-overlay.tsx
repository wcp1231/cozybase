import { useEffect, useRef, useState } from 'react';

interface OverlayRect {
  top: number;
  left: number;
  width: number;
  height: number;
  type: string | null;
}

interface EditorOverlayProps {
  active: boolean;
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  onSelect: (nodeId: string | null) => void;
  onHover: (nodeId: string | null) => void;
}

export function EditorOverlay({
  active,
  selectedNodeId,
  hoveredNodeId,
  onSelect,
  onHover,
}: EditorOverlayProps) {
  const [selectedRect, setSelectedRect] = useState<OverlayRect | null>(null);
  const [hoveredRect, setHoveredRect] = useState<OverlayRect | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = overlayRef.current?.parentElement;
    if (!active || !root) return;

    const updateRects = () => {
      setSelectedRect(measureNode(root, selectedNodeId));
      setHoveredRect(measureNode(root, hoveredNodeId));
    };

    const handlePointerMove = (event: PointerEvent) => {
      const wrapper = findSchemaWrapper(event.target);
      onHover(wrapper?.dataset.schemaId ?? null);
    };

    const handlePointerLeave = () => {
      onHover(null);
    };

    const handleSelect = (event: Event) => {
      const wrapper = findSchemaWrapper(event.target);
      if (!wrapper) {
        onSelect(null);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      onSelect(wrapper.dataset.schemaId ?? null);
    };

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(updateRects)
      : null;

    updateRects();

    root.addEventListener('pointermove', handlePointerMove, true);
    root.addEventListener('pointerleave', handlePointerLeave, true);
    root.addEventListener('click', handleSelect, true);
    root.addEventListener('pointerdown', handleSelect, true);
    root.addEventListener('submit', handleSelect, true);
    root.addEventListener('scroll', updateRects, true);
    window.addEventListener('resize', updateRects);
    resizeObserver?.observe(root);

    return () => {
      root.removeEventListener('pointermove', handlePointerMove, true);
      root.removeEventListener('pointerleave', handlePointerLeave, true);
      root.removeEventListener('click', handleSelect, true);
      root.removeEventListener('pointerdown', handleSelect, true);
      root.removeEventListener('submit', handleSelect, true);
      root.removeEventListener('scroll', updateRects, true);
      window.removeEventListener('resize', updateRects);
      resizeObserver?.disconnect();
    };
  }, [active, hoveredNodeId, onHover, onSelect, selectedNodeId]);

  if (!active) return null;

  return (
    <div ref={overlayRef} className="pointer-events-none absolute inset-0 z-20">
      {hoveredRect ? (
        <div
          className="absolute rounded-[8px] border border-dashed border-[#60A5FA] bg-[#60A5FA]/[0.06]"
          style={toRectStyle(hoveredRect)}
        />
      ) : null}
      {selectedRect ? (
        <>
          <div
            className="absolute rounded-[8px] border-2 border-[#2563EB] bg-[#2563EB]/[0.08]"
            style={toRectStyle(selectedRect)}
          />
          <div
            className="absolute -translate-y-full rounded-md bg-[#1D4ED8] px-2 py-1 text-[11px] font-semibold text-white"
            style={{
              top: Math.max(selectedRect.top - 6, 0),
              left: selectedRect.left,
            }}
          >
            {selectedRect.type}
          </div>
        </>
      ) : null}
    </div>
  );
}

function findSchemaWrapper(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  return target.closest('[data-schema-id]');
}

function measureNode(root: HTMLElement, nodeId: string | null): OverlayRect | null {
  if (!nodeId) return null;
  const wrapper = root.querySelector(`[data-schema-id="${escapeAttribute(nodeId)}"]`);
  if (!(wrapper instanceof HTMLElement)) return null;

  const target = findMeasurableElement(wrapper);
  if (!target) return null;

  const rootRect = root.getBoundingClientRect();
  const rect = target.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;

  return {
    top: rect.top - rootRect.top + root.scrollTop,
    left: rect.left - rootRect.left + root.scrollLeft,
    width: rect.width,
    height: rect.height,
    type: wrapper.dataset.schemaType ?? null,
  };
}

function findMeasurableElement(wrapper: HTMLElement): HTMLElement | null {
  if (wrapper.firstElementChild instanceof HTMLElement) return wrapper.firstElementChild;
  const nested = wrapper.querySelector('*');
  return nested instanceof HTMLElement ? nested : null;
}

function toRectStyle(rect: OverlayRect) {
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

function escapeAttribute(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/"/g, '\\"');
}

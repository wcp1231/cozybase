import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { COMPONENT_CATEGORIES } from '@cozybase/ui';
import { Plus } from 'lucide-react';

interface ComponentPaletteProps {
  open: boolean;
  onToggle: () => void;
  onInsert: (type: string) => void;
}

const CATEGORY_LABELS: Record<keyof typeof COMPONENT_CATEGORIES, string> = {
  container: '容器',
  text: '文本',
  data: '数据',
  input: '输入',
  action: '动作',
  structural: '结构',
  feedback: '反馈',
};

export function ComponentPalette({
  open,
  onToggle,
  onInsert,
}: ComponentPaletteProps) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }

    const updatePosition = () => {
      const button = buttonRef.current;
      if (!button) return;

      const rect = button.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const left = Math.min(
        Math.max(rect.left, 12),
        Math.max(12, viewportWidth - 288 - 12),
      );

      setPosition({
        top: rect.bottom + 8,
        left,
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (buttonRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      onToggle();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [open, onToggle]);

  return (
    <div>
      <button
        ref={buttonRef}
        type="button"
        onClick={onToggle}
        className="inline-flex h-8 w-24 items-center justify-center gap-1 rounded-lg border border-[#CBD5E1] bg-white px-3 text-xs font-semibold text-[#334155] transition-colors hover:bg-[#F8FAFC]"
      >
        <Plus className="h-3.5 w-3.5" />
        添加组件
      </button>

      {open && position && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={popoverRef}
              className="fixed z-40 w-72 rounded-xl border border-[#E2E8F0] bg-white p-3 shadow-[0_20px_40px_-24px_rgba(15,23,42,0.35)]"
              style={{ top: position.top, left: position.left }}
            >
              <div className="max-h-[min(20rem,calc(100vh-5rem))] overflow-auto pr-1">
                {Object.entries(COMPONENT_CATEGORIES).map(([category, types]) => (
                  <section key={category} className="mb-3 last:mb-0">
                    <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">
                      {CATEGORY_LABELS[category as keyof typeof COMPONENT_CATEGORIES]}
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                      {types
                        .filter((type) => type !== 'page')
                        .map((type) => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => onInsert(type)}
                            className="rounded-lg border border-[#E2E8F0] px-3 py-2 text-left text-xs font-medium text-[#334155] transition-colors hover:bg-[#F8FAFC]"
                          >
                            {type}
                          </button>
                        ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

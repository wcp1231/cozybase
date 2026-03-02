import type { ReactNode } from 'react';
import { Menu, PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react';
import { useAppContext } from '../../pages/app-layout';

export function StandardPageFrame({
  eyebrow,
  title,
  searchValue,
  onSearchChange,
  searchPlaceholder = '搜索应用...',
  actions,
  children,
}: {
  eyebrow?: string;
  title: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { openSidebar, toggleSidebar, sidebarVisible } = useAppContext();

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="sticky top-0 z-20 bg-[#F3F5F9] px-4 pb-2 pt-4 md:px-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <button
              type="button"
              aria-label="Toggle menu"
              onClick={toggleSidebar}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#E2E8F0] bg-white text-[#475569] shadow-sm transition-colors hover:bg-[#F8FAFC] md:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>

            <button
              type="button"
              aria-label="Toggle sidebar"
              onClick={toggleSidebar}
              className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#E2E8F0] bg-white text-[#475569] shadow-sm transition-colors hover:bg-[#F8FAFC] md:inline-flex"
            >
              {sidebarVisible ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
            </button>

            <div className="min-w-0 flex-1">
              {eyebrow && <p className="m-0 text-[13px] text-[#71717A]">{eyebrow}</p>}
              <h1 className='m-0 truncate font-["Outfit",sans-serif] text-[26px] font-extrabold tracking-[-0.02em] text-[#18181B]'>
                {title}
              </h1>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {actions}
            <SearchField
              value={searchValue}
              placeholder={searchPlaceholder}
              onChange={onSearchChange}
            />
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-auto px-4 pb-6 pt-2 md:px-8 md:pb-8">{children}</main>
    </div>
  );
}

function SearchField({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex h-10 min-w-[220px] items-center gap-2 rounded-[10px] border border-[#E2E8F0] bg-white px-3 shadow-sm md:min-w-[320px]">
      <Search className="h-4 w-4 text-[#94A3B8]" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent text-sm text-[#334155] outline-none placeholder:text-[#A1A1AA]"
      />
    </label>
  );
}

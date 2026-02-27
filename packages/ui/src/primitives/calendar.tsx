import * as React from 'react';
import { clsx } from 'clsx';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

interface CzCalendarProps {
  value?: string; // YYYY-MM-DD
  onSelect?: (date: string) => void;
  className?: string;
}

function toDateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function getMonthGrid(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  // 0=Sun, adjust to Mon=0
  let startWeekday = firstDay.getDay() - 1;
  if (startWeekday < 0) startWeekday = 6;

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weeks: (number | null)[][] = [];
  let currentWeek: (number | null)[] = [];

  for (let i = 0; i < startWeekday; i++) {
    currentWeek.push(null);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    currentWeek.push(day);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }

  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) {
      currentWeek.push(null);
    }
    weeks.push(currentWeek);
  }

  return weeks;
}

function CzCalendar({ value, onSelect, className }: CzCalendarProps) {
  const today = new Date();
  const todayStr = toDateStr(today.getFullYear(), today.getMonth(), today.getDate());

  const initial = value ? new Date(value) : today;
  const [viewYear, setViewYear] = React.useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = React.useState(initial.getMonth());

  const weeks = getMonthGrid(viewYear, viewMonth);

  const monthLabel = new Date(viewYear, viewMonth).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
  });

  function prevMonth() {
    if (viewMonth === 0) {
      setViewYear(viewYear - 1);
      setViewMonth(11);
    } else {
      setViewMonth(viewMonth - 1);
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewYear(viewYear + 1);
      setViewMonth(0);
    } else {
      setViewMonth(viewMonth + 1);
    }
  }

  function handleDayClick(day: number) {
    onSelect?.(toDateStr(viewYear, viewMonth, day));
  }

  return (
    <div className={clsx('w-[252px] select-none', className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={prevMonth}
          className="h-7 w-7 flex items-center justify-center rounded-sm hover:bg-bg-muted text-text-muted"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M7.5 9L4.5 6L7.5 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <span className="text-sm font-medium text-text">{monthLabel}</span>
        <button
          type="button"
          onClick={nextMonth}
          className="h-7 w-7 flex items-center justify-center rounded-sm hover:bg-bg-muted text-text-muted"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4.5 3L7.5 6L4.5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map((day) => (
          <div key={day} className="h-8 flex items-center justify-center text-xs text-text-muted font-medium">
            {day}
          </div>
        ))}
      </div>

      {/* Days grid */}
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7">
          {week.map((day, di) => {
            if (day === null) {
              return <div key={di} className="h-8" />;
            }
            const dateStr = toDateStr(viewYear, viewMonth, day);
            const isSelected = dateStr === value;
            const isToday = dateStr === todayStr;
            return (
              <button
                key={di}
                type="button"
                onClick={() => handleDayClick(day)}
                className={clsx(
                  'h-8 w-8 mx-auto flex items-center justify-center text-sm rounded-sm',
                  'hover:bg-bg-muted transition-colors',
                  isSelected && 'bg-primary text-white hover:bg-primary/90',
                  !isSelected && isToday && 'font-bold text-primary',
                  !isSelected && !isToday && 'text-text',
                )}
              >
                {day}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export { CzCalendar };
export type { CzCalendarProps };

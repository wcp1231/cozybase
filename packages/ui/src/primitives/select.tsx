import * as React from 'react';
import * as RadixSelect from '@radix-ui/react-select';
import { clsx } from 'clsx';

const CzSelect = RadixSelect.Root;
const CzSelectValue = RadixSelect.Value;

type CzSelectTriggerProps = React.ComponentPropsWithoutRef<typeof RadixSelect.Trigger> & {
  className?: string;
};

const CzSelectTrigger = React.forwardRef<
  React.ComponentRef<typeof RadixSelect.Trigger>,
  CzSelectTriggerProps
>(({ className, children, ...props }, ref) => (
  <RadixSelect.Trigger
    ref={ref}
    className={clsx(
      'flex items-center justify-between w-full px-2.5 py-1.5 text-sm',
      'border border-border-strong rounded-sm bg-bg text-text',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'data-[placeholder]:text-text-placeholder',
      className,
    )}
    {...props}
  >
    {children}
    <RadixSelect.Icon className="ml-2 shrink-0">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </RadixSelect.Icon>
  </RadixSelect.Trigger>
));
CzSelectTrigger.displayName = 'CzSelectTrigger';

type CzSelectContentProps = React.ComponentPropsWithoutRef<typeof RadixSelect.Content> & {
  className?: string;
};

const CzSelectContent = React.forwardRef<
  React.ComponentRef<typeof RadixSelect.Content>,
  CzSelectContentProps
>(({ className, children, position = 'popper', ...props }, ref) => (
  <RadixSelect.Portal>
    <RadixSelect.Content
      ref={ref}
      position={position}
      className={clsx(
        'z-[1100] overflow-hidden rounded-sm border border-border bg-bg shadow-md',
        position === 'popper' && 'max-h-[var(--radix-select-content-available-height)]',
        className,
      )}
      {...props}
    >
      <RadixSelect.Viewport
        className={clsx(
          'p-1',
          position === 'popper' && 'w-full min-w-[var(--radix-select-trigger-width)]',
        )}
      >
        {children}
      </RadixSelect.Viewport>
    </RadixSelect.Content>
  </RadixSelect.Portal>
));
CzSelectContent.displayName = 'CzSelectContent';

type CzSelectItemProps = React.ComponentPropsWithoutRef<typeof RadixSelect.Item> & {
  className?: string;
};

const CzSelectItem = React.forwardRef<
  React.ComponentRef<typeof RadixSelect.Item>,
  CzSelectItemProps
>(({ className, children, ...props }, ref) => (
  <RadixSelect.Item
    ref={ref}
    className={clsx(
      'relative flex items-center px-2 py-1.5 text-sm rounded-sm cursor-pointer select-none',
      'outline-none',
      'data-[highlighted]:bg-bg-muted data-[highlighted]:text-text',
      'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className,
    )}
    {...props}
  >
    <RadixSelect.ItemText>{children}</RadixSelect.ItemText>
    <RadixSelect.ItemIndicator className="absolute right-2">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M10 3L4.5 8.5L2 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </RadixSelect.ItemIndicator>
  </RadixSelect.Item>
));
CzSelectItem.displayName = 'CzSelectItem';

export {
  CzSelect,
  CzSelectTrigger,
  CzSelectContent,
  CzSelectItem,
  CzSelectValue,
};

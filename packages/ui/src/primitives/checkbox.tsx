import * as React from 'react';
import * as RadixCheckbox from '@radix-ui/react-checkbox';
import { clsx } from 'clsx';

type CzCheckboxProps = React.ComponentPropsWithoutRef<typeof RadixCheckbox.Root> & {
  className?: string;
};

const CzCheckbox = React.forwardRef<
  React.ComponentRef<typeof RadixCheckbox.Root>,
  CzCheckboxProps
>(({ className, ...props }, ref) => (
  <RadixCheckbox.Root
    ref={ref}
    className={clsx(
      'h-4 w-4 shrink-0 rounded-sm border border-border-strong',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=checked]:text-white',
      'data-[state=indeterminate]:bg-primary data-[state=indeterminate]:border-primary data-[state=indeterminate]:text-white',
      className,
    )}
    {...props}
  >
    <CzCheckboxIndicator />
  </RadixCheckbox.Root>
));
CzCheckbox.displayName = 'CzCheckbox';

type CzCheckboxIndicatorProps = React.ComponentPropsWithoutRef<typeof RadixCheckbox.Indicator> & {
  className?: string;
};

const CzCheckboxIndicator = React.forwardRef<
  React.ComponentRef<typeof RadixCheckbox.Indicator>,
  CzCheckboxIndicatorProps
>(({ className, ...props }, ref) => (
  <RadixCheckbox.Indicator
    ref={ref}
    className={clsx('flex items-center justify-center text-current', className)}
    {...props}
  >
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 3L4.5 8.5L2 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </RadixCheckbox.Indicator>
));
CzCheckboxIndicator.displayName = 'CzCheckboxIndicator';

export { CzCheckbox, CzCheckboxIndicator };

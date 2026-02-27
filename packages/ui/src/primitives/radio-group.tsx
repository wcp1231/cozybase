import * as React from 'react';
import * as RadixRadioGroup from '@radix-ui/react-radio-group';
import { clsx } from 'clsx';

type CzRadioGroupProps = React.ComponentPropsWithoutRef<typeof RadixRadioGroup.Root> & {
  className?: string;
};

const CzRadioGroup = React.forwardRef<
  React.ComponentRef<typeof RadixRadioGroup.Root>,
  CzRadioGroupProps
>(({ className, ...props }, ref) => (
  <RadixRadioGroup.Root
    ref={ref}
    className={clsx('flex flex-col gap-2', className)}
    {...props}
  />
));
CzRadioGroup.displayName = 'CzRadioGroup';

type CzRadioGroupItemProps = React.ComponentPropsWithoutRef<typeof RadixRadioGroup.Item> & {
  className?: string;
};

const CzRadioGroupItem = React.forwardRef<
  React.ComponentRef<typeof RadixRadioGroup.Item>,
  CzRadioGroupItemProps
>(({ className, ...props }, ref) => (
  <RadixRadioGroup.Item
    ref={ref}
    className={clsx(
      'h-4 w-4 shrink-0 rounded-full border border-border-strong',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'data-[state=checked]:border-primary',
      className,
    )}
    {...props}
  >
    <CzRadioGroupIndicator />
  </RadixRadioGroup.Item>
));
CzRadioGroupItem.displayName = 'CzRadioGroupItem';

type CzRadioGroupIndicatorProps = React.ComponentPropsWithoutRef<typeof RadixRadioGroup.Indicator> & {
  className?: string;
};

const CzRadioGroupIndicator = React.forwardRef<
  React.ComponentRef<typeof RadixRadioGroup.Indicator>,
  CzRadioGroupIndicatorProps
>(({ className, ...props }, ref) => (
  <RadixRadioGroup.Indicator
    ref={ref}
    className={clsx('flex items-center justify-center', className)}
    {...props}
  >
    <div className="h-2 w-2 rounded-full bg-primary" />
  </RadixRadioGroup.Indicator>
));
CzRadioGroupIndicator.displayName = 'CzRadioGroupIndicator';

export { CzRadioGroup, CzRadioGroupItem, CzRadioGroupIndicator };

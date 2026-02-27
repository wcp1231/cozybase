import * as React from 'react';
import * as RadixSwitch from '@radix-ui/react-switch';
import { clsx } from 'clsx';

type CzSwitchProps = React.ComponentPropsWithoutRef<typeof RadixSwitch.Root> & {
  className?: string;
};

const CzSwitch = React.forwardRef<
  React.ComponentRef<typeof RadixSwitch.Root>,
  CzSwitchProps
>(({ className, ...props }, ref) => (
  <RadixSwitch.Root
    ref={ref}
    className={clsx(
      'inline-flex h-[22px] w-10 shrink-0 cursor-pointer items-center rounded-full transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'data-[state=checked]:bg-primary data-[state=unchecked]:bg-bg-muted',
      className,
    )}
    {...props}
  >
    <RadixSwitch.Thumb
      className="pointer-events-none block h-[18px] w-[18px] rounded-full bg-bg shadow-sm transition-transform data-[state=checked]:translate-x-[20px] data-[state=unchecked]:translate-x-[2px]"
    />
  </RadixSwitch.Root>
));
CzSwitch.displayName = 'CzSwitch';

export { CzSwitch };

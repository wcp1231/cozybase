import * as React from 'react';
import * as RadixPopover from '@radix-ui/react-popover';
import { clsx } from 'clsx';

const CzPopover = RadixPopover.Root;
const CzPopoverTrigger = RadixPopover.Trigger;
const CzPopoverClose = RadixPopover.Close;

type CzPopoverContentProps = React.ComponentPropsWithoutRef<typeof RadixPopover.Content> & {
  className?: string;
  /** When true, traps focus inside the popover and blocks outside interaction. */
  modal?: boolean;
};

const CzPopoverContent = React.forwardRef<
  React.ComponentRef<typeof RadixPopover.Content>,
  CzPopoverContentProps
>(({ className, align = 'start', sideOffset = 4, modal, onFocusOutside, onInteractOutside, ...props }, ref) => (
  <RadixPopover.Portal>
    <RadixPopover.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      onFocusOutside={modal ? (e) => e.preventDefault() : onFocusOutside}
      onInteractOutside={modal ? (e) => e.preventDefault() : onInteractOutside}
      className={clsx(
        'z-[1100] rounded-md border border-border bg-bg p-3 shadow-md',
        'focus-visible:outline-none',
        className,
      )}
      {...props}
    />
  </RadixPopover.Portal>
));
CzPopoverContent.displayName = 'CzPopoverContent';

export {
  CzPopover,
  CzPopoverTrigger,
  CzPopoverContent,
  CzPopoverClose,
};

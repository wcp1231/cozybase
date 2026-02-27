import * as React from 'react';
import * as RadixTabs from '@radix-ui/react-tabs';
import { clsx } from 'clsx';

type CzTabsProps = React.ComponentPropsWithoutRef<typeof RadixTabs.Root> & {
  className?: string;
};

const CzTabs = React.forwardRef<
  React.ComponentRef<typeof RadixTabs.Root>,
  CzTabsProps
>(({ className, ...props }, ref) => (
  <RadixTabs.Root ref={ref} className={className} {...props} />
));
CzTabs.displayName = 'CzTabs';

type CzTabsListProps = React.ComponentPropsWithoutRef<typeof RadixTabs.List> & {
  className?: string;
};

const CzTabsList = React.forwardRef<
  React.ComponentRef<typeof RadixTabs.List>,
  CzTabsListProps
>(({ className, ...props }, ref) => (
  <RadixTabs.List
    ref={ref}
    className={clsx('flex border-b border-border', className)}
    {...props}
  />
));
CzTabsList.displayName = 'CzTabsList';

type CzTabsTriggerProps = React.ComponentPropsWithoutRef<typeof RadixTabs.Trigger> & {
  className?: string;
};

const CzTabsTrigger = React.forwardRef<
  React.ComponentRef<typeof RadixTabs.Trigger>,
  CzTabsTriggerProps
>(({ className, ...props }, ref) => (
  <RadixTabs.Trigger
    ref={ref}
    className={clsx(
      'px-3 py-2 text-sm border-b-2 -mb-px cursor-pointer transition-colors',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:font-semibold',
      'data-[state=inactive]:border-transparent data-[state=inactive]:text-text-muted data-[state=inactive]:hover:text-text',
      className,
    )}
    {...props}
  />
));
CzTabsTrigger.displayName = 'CzTabsTrigger';

type CzTabsContentProps = React.ComponentPropsWithoutRef<typeof RadixTabs.Content> & {
  className?: string;
};

const CzTabsContent = React.forwardRef<
  React.ComponentRef<typeof RadixTabs.Content>,
  CzTabsContentProps
>(({ className, ...props }, ref) => (
  <RadixTabs.Content
    ref={ref}
    className={clsx('pt-4 focus-visible:outline-none', className)}
    {...props}
  />
));
CzTabsContent.displayName = 'CzTabsContent';

export { CzTabs, CzTabsList, CzTabsTrigger, CzTabsContent };

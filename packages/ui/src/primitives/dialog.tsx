import * as React from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { clsx } from 'clsx';

const CzDialog = RadixDialog.Root;
const CzDialogTrigger = RadixDialog.Trigger;
const CzDialogClose = RadixDialog.Close;

type CzDialogContentProps = React.ComponentPropsWithoutRef<typeof RadixDialog.Content> & {
  className?: string;
  overlayClassName?: string;
  /** Stacking level for nested dialogs. Each level raises z-index by 10. */
  level?: number;
};

const CzDialogContent = React.forwardRef<
  React.ComponentRef<typeof RadixDialog.Content>,
  CzDialogContentProps
>(({ className, overlayClassName, level = 0, children, style, ...props }, ref) => {
  const baseZ = 1000 + level * 10;
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay
        className={clsx(
          'fixed inset-0 bg-overlay',
          overlayClassName,
        )}
        style={{ zIndex: baseZ }}
      />
      <RadixDialog.Content
        ref={ref}
        className={clsx(
          'fixed inset-0 m-auto h-fit',
          'w-full max-w-lg max-h-[85vh] overflow-auto',
          'bg-bg rounded-md p-6 shadow-md',
          'focus-visible:outline-none',
          className,
        )}
        style={{ zIndex: baseZ + 1, ...style }}
        {...props}
      >
        {children}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
});
CzDialogContent.displayName = 'CzDialogContent';

type CzDialogTitleProps = React.ComponentPropsWithoutRef<typeof RadixDialog.Title> & {
  className?: string;
};

const CzDialogTitle = React.forwardRef<
  React.ComponentRef<typeof RadixDialog.Title>,
  CzDialogTitleProps
>(({ className, ...props }, ref) => (
  <RadixDialog.Title
    ref={ref}
    className={clsx('text-lg font-semibold text-text', className)}
    {...props}
  />
));
CzDialogTitle.displayName = 'CzDialogTitle';

type CzDialogDescriptionProps = React.ComponentPropsWithoutRef<typeof RadixDialog.Description> & {
  className?: string;
};

const CzDialogDescription = React.forwardRef<
  React.ComponentRef<typeof RadixDialog.Description>,
  CzDialogDescriptionProps
>(({ className, ...props }, ref) => (
  <RadixDialog.Description
    ref={ref}
    className={clsx('text-sm text-text-muted', className)}
    {...props}
  />
));
CzDialogDescription.displayName = 'CzDialogDescription';

export {
  CzDialog,
  CzDialogTrigger,
  CzDialogContent,
  CzDialogTitle,
  CzDialogDescription,
  CzDialogClose,
};

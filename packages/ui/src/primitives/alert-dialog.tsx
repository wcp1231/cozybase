import * as React from 'react';
import * as RadixAlertDialog from '@radix-ui/react-alert-dialog';
import { clsx } from 'clsx';

const CzAlertDialog = RadixAlertDialog.Root;
const CzAlertDialogTrigger = RadixAlertDialog.Trigger;

type CzAlertDialogContentProps = React.ComponentPropsWithoutRef<typeof RadixAlertDialog.Content> & {
  className?: string;
  overlayClassName?: string;
  /** Stacking level for nested dialogs. Each level raises z-index by 10. */
  level?: number;
};

const CzAlertDialogContent = React.forwardRef<
  React.ComponentRef<typeof RadixAlertDialog.Content>,
  CzAlertDialogContentProps
>(({ className, overlayClassName, level = 0, children, style, ...props }, ref) => {
  const baseZ = 1000 + level * 10;
  return (
    <RadixAlertDialog.Portal>
      <RadixAlertDialog.Overlay
        className={clsx(
          'fixed inset-0 bg-overlay',
          overlayClassName,
        )}
        style={{ zIndex: baseZ }}
      />
      <RadixAlertDialog.Content
        ref={ref}
        className={clsx(
          'fixed inset-0 m-auto h-fit',
          'w-full max-w-md',
          'bg-bg rounded-md p-6 shadow-md',
          'focus-visible:outline-none',
          className,
        )}
        style={{ zIndex: baseZ + 1, ...style }}
        {...props}
      >
        {children}
      </RadixAlertDialog.Content>
    </RadixAlertDialog.Portal>
  );
});
CzAlertDialogContent.displayName = 'CzAlertDialogContent';

type CzAlertDialogTitleProps = React.ComponentPropsWithoutRef<typeof RadixAlertDialog.Title> & {
  className?: string;
};

const CzAlertDialogTitle = React.forwardRef<
  React.ComponentRef<typeof RadixAlertDialog.Title>,
  CzAlertDialogTitleProps
>(({ className, ...props }, ref) => (
  <RadixAlertDialog.Title
    ref={ref}
    className={clsx('text-lg font-semibold text-text', className)}
    {...props}
  />
));
CzAlertDialogTitle.displayName = 'CzAlertDialogTitle';

type CzAlertDialogDescriptionProps = React.ComponentPropsWithoutRef<typeof RadixAlertDialog.Description> & {
  className?: string;
};

const CzAlertDialogDescription = React.forwardRef<
  React.ComponentRef<typeof RadixAlertDialog.Description>,
  CzAlertDialogDescriptionProps
>(({ className, ...props }, ref) => (
  <RadixAlertDialog.Description
    ref={ref}
    className={clsx('text-sm text-text-muted mt-2', className)}
    {...props}
  />
));
CzAlertDialogDescription.displayName = 'CzAlertDialogDescription';

type CzAlertDialogActionProps = React.ComponentPropsWithoutRef<typeof RadixAlertDialog.Action> & {
  className?: string;
};

const CzAlertDialogAction = React.forwardRef<
  React.ComponentRef<typeof RadixAlertDialog.Action>,
  CzAlertDialogActionProps
>(({ className, ...props }, ref) => (
  <RadixAlertDialog.Action
    ref={ref}
    className={clsx(
      'inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-sm',
      'bg-danger text-white hover:bg-danger/90',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2',
      className,
    )}
    {...props}
  />
));
CzAlertDialogAction.displayName = 'CzAlertDialogAction';

type CzAlertDialogCancelProps = React.ComponentPropsWithoutRef<typeof RadixAlertDialog.Cancel> & {
  className?: string;
};

const CzAlertDialogCancel = React.forwardRef<
  React.ComponentRef<typeof RadixAlertDialog.Cancel>,
  CzAlertDialogCancelProps
>(({ className, ...props }, ref) => (
  <RadixAlertDialog.Cancel
    ref={ref}
    className={clsx(
      'inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-sm',
      'border border-border text-text hover:bg-bg-muted',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
      className,
    )}
    {...props}
  />
));
CzAlertDialogCancel.displayName = 'CzAlertDialogCancel';

export {
  CzAlertDialog,
  CzAlertDialogTrigger,
  CzAlertDialogContent,
  CzAlertDialogTitle,
  CzAlertDialogDescription,
  CzAlertDialogAction,
  CzAlertDialogCancel,
};

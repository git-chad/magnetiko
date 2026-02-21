"use client";

import * as ToastPrimitive from "@radix-ui/react-toast";
import { CheckCircle, Info, Warning, X, XCircle } from "@phosphor-icons/react";
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const ToastProvider = ToastPrimitive.Provider;

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Viewport
    ref={ref}
    className={cn(
      "fixed bottom-0 right-0 z-[100]",
      "flex max-h-screen flex-col-reverse gap-3xs p-sm",
      "w-[22rem] md:w-[26rem]",
      "focus:outline-none",
      className,
    )}
    {...props}
  />
));
ToastViewport.displayName = ToastPrimitive.Viewport.displayName;

const toastVariants = cva(
  [
    "group pointer-events-auto relative flex w-full items-start gap-xs overflow-hidden",
    "rounded-sm border border-[var(--color-border)] bg-[var(--color-bg-raised)]",
    "p-xs shadow-high",
    "transition-all duration-base ease-enter",
    "data-[state=open]:animate-[toast-enter_150ms_var(--ease-enter)_both]",
    "data-[state=closed]:animate-[toast-exit_90ms_var(--ease-exit)_both]",
    "data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)]",
    "data-[swipe=cancel]:translate-x-0",
    "data-[swipe=end]:animate-[toast-exit_90ms_var(--ease-exit)_both]",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "",
        success: "border-success/30 bg-success-subtle dark:bg-success/10",
        error:   "border-error/30 bg-error-subtle dark:bg-error/10",
        warning: "border-warning/30 bg-warning-subtle dark:bg-warning/10",
        info:    "border-info/30 bg-info-subtle dark:bg-info/10",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const toastIconMap = {
  default: null,
  success: <CheckCircle size={16} weight="fill" className="text-success shrink-0 mt-[1px]" />,
  error:   <XCircle    size={16} weight="fill" className="text-error shrink-0 mt-[1px]" />,
  warning: <Warning    size={16} weight="fill" className="text-warning shrink-0 mt-[1px]" />,
  info:    <Info       size={16} weight="fill" className="text-info shrink-0 mt-[1px]" />,
};

type ToastVariant = "default" | "success" | "error" | "warning" | "info";

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Root> &
    VariantProps<typeof toastVariants>
>(({ className, variant = "default", children, ...props }, ref) => (
  <ToastPrimitive.Root
    ref={ref}
    className={cn(toastVariants({ variant }), className)}
    {...props}
  >
    {variant && variant !== "default" && toastIconMap[variant]}
    <div className="flex-1">{children}</div>
  </ToastPrimitive.Root>
));
Toast.displayName = ToastPrimitive.Root.displayName;

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Action
    ref={ref}
    className={cn(
      "inline-flex h-7 shrink-0 items-center justify-center rounded-sm",
      "border border-[var(--color-border)] bg-transparent",
      "px-3xs text-caption font-medium",
      "hover:bg-[var(--color-hover-bg)]",
      "focus:outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)]",
      "transition-colors duration-micro",
      className,
    )}
    {...props}
  />
));
ToastAction.displayName = ToastPrimitive.Action.displayName;

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Close
    ref={ref}
    className={cn(
      "absolute right-3xs top-3xs",
      "flex size-6 items-center justify-center rounded-xs",
      "text-[var(--color-fg-tertiary)]",
      "hover:bg-[var(--color-hover-bg)] hover:text-[var(--color-fg)]",
      "transition-colors duration-micro",
      "focus:outline-none focus:ring-2 focus:ring-[var(--color-focus-ring)]",
      className,
    )}
    toast-close=""
    {...props}
  >
    <X size={12} />
  </ToastPrimitive.Close>
));
ToastClose.displayName = ToastPrimitive.Close.displayName;

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Title
    ref={ref}
    className={cn("text-body font-medium text-[var(--color-fg)]", className)}
    {...props}
  />
));
ToastTitle.displayName = ToastPrimitive.Title.displayName;

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Description
    ref={ref}
    className={cn("mt-[2px] text-caption text-[var(--color-fg-secondary)]", className)}
    {...props}
  />
));
ToastDescription.displayName = ToastPrimitive.Description.displayName;

// ── Imperative toast hook ─────────────────────────────────────────────────────

type ToastConfig = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
  action?: React.ReactElement<typeof ToastAction>;
};

type ToastState = ToastConfig & { id: string; open: boolean };

const ToastContext = React.createContext<{
  toasts: ToastState[];
  toast: (config: ToastConfig) => void;
  dismiss: (id: string) => void;
} | null>(null);

function ToastContextProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastState[]>([]);

  const toast = React.useCallback((config: ToastConfig) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => {
      const next = [...prev, { ...config, id, open: true }];
      return next.slice(-3); // max 3 visible
    });
  }, []);

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, open: false } : t)),
    );
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, toast, dismiss }}>
      {children}
    </ToastContext.Provider>
  );
}

function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <Toaster>");
  return { toast: ctx.toast, dismiss: ctx.dismiss };
}

function Toaster() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) return null;
  const { toasts, dismiss } = ctx;

  return (
    <ToastProvider swipeDirection="right">
      {toasts.map(({ id, title, description, variant, duration = 5000, action, open }) => (
        <Toast
          key={id}
          variant={variant}
          open={open}
          duration={duration}
          onOpenChange={(o) => { if (!o) dismiss(id); }}
        >
          <ToastTitle>{title}</ToastTitle>
          {description && <ToastDescription>{description}</ToastDescription>}
          {action}
          <ToastClose />
        </Toast>
      ))}
      <ToastViewport />
    </ToastProvider>
  );
}

export {
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastAction,
  ToastClose,
  ToastContextProvider,
  Toaster,
  useToast,
};
export type { ToastConfig, ToastVariant };

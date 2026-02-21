import * as React from "react";

import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  error?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, leadingIcon, trailingIcon, error, ...props }, ref) => {
    return (
      <div className="relative flex items-center">
        {leadingIcon && (
          <span className="pointer-events-none absolute left-3xs text-[var(--color-fg-tertiary)]">
            {leadingIcon}
          </span>
        )}
        <input
          type={type}
          className={cn(
            "flex h-8 w-full rounded-sm text-body",
            "bg-[var(--color-bg-raised)] text-[var(--color-fg)]",
            "border border-[var(--color-border)]",
            "px-xs py-3xs",
            "placeholder:text-[var(--color-fg-tertiary)]",
            "transition-colors duration-micro ease-micro",
            "focus-visible:outline-none focus-visible:border-[var(--color-border-focus)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]",
            "disabled:pointer-events-none disabled:opacity-40",
            error && "border-error focus-visible:border-error focus-visible:ring-error/30",
            leadingIcon && "pl-[1.75rem]",
            trailingIcon && "pr-[1.75rem]",
            className,
          )}
          ref={ref}
          {...props}
        />
        {trailingIcon && (
          <span className="pointer-events-none absolute right-3xs text-[var(--color-fg-tertiary)]">
            {trailingIcon}
          </span>
        )}
      </div>
    );
  },
);
Input.displayName = "Input";

export { Input };

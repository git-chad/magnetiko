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
            "flex h-9 w-full rounded-md text-body",
            "bg-[var(--color-bg-raised)] text-[var(--color-fg)] backdrop-blur-sm",
            "border border-[var(--color-border)]",
            "px-xs py-3xs",
            "placeholder:text-[var(--color-fg-tertiary)]",
            "shadow-[inset_0_1px_0_rgba(255,255,255,0.32)]",
            "transition-[color,background-color,border-color,box-shadow] duration-base ease-micro",
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

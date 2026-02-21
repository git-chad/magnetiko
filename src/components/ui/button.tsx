"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "rounded-sm font-medium leading-none select-none",
    "transition-colors duration-micro ease-micro",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] focus-visible:ring-offset-0",
    "disabled:pointer-events-none disabled:opacity-40",
  ].join(" "),
  {
    variants: {
      variant: {
        primary: [
          "bg-accent text-primary-50",
          "hover:bg-accent-700 active:bg-accent-800",
        ].join(" "),
        secondary: [
          "bg-transparent border border-[var(--color-border)] text-[var(--color-fg)]",
          "hover:bg-[var(--color-hover-bg)] hover:border-[var(--color-border-hover)]",
          "active:bg-[var(--color-active-bg)]",
        ].join(" "),
        ghost: [
          "bg-transparent text-[var(--color-fg)]",
          "hover:bg-[var(--color-hover-bg)]",
          "active:bg-[var(--color-active-bg)]",
        ].join(" "),
        destructive: [
          "bg-error text-white",
          "hover:bg-red-600 active:bg-red-700",
        ].join(" "),
      },
      size: {
        sm: "h-7 px-3xs text-caption",
        md: "h-8 px-xs text-body",
        lg: "h-10 px-sm text-subhead",
        "icon-sm": "size-7",
        "icon-md": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };

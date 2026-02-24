"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "rounded-md font-medium leading-none select-none",
    "border border-transparent backdrop-blur-sm",
    "transition-[color,background-color,border-color,box-shadow,transform] duration-base ease-micro",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] focus-visible:ring-offset-0",
    "disabled:pointer-events-none disabled:opacity-40",
  ].join(" "),
  {
    variants: {
      variant: {
        primary: [
          "bg-accent text-[var(--color-fg-on-accent)]",
          "border-[color:rgba(153,65,15,0.35)] shadow-low",
          "hover:brightness-[1.03] hover:shadow-mid",
          "active:translate-y-px active:shadow-low",
        ].join(" "),
        secondary: [
          "bg-[var(--color-bg-raised)] text-[var(--color-fg)] border-[var(--color-border)]",
          "hover:bg-white/90 hover:border-[var(--color-border-hover)] hover:shadow-low",
          "active:bg-[var(--color-active-bg)]",
        ].join(" "),
        ghost: [
          "bg-transparent text-[var(--color-fg-secondary)] border-transparent",
          "hover:bg-[var(--color-hover-bg)] hover:text-[var(--color-fg)]",
          "active:bg-[var(--color-active-bg)]",
        ].join(" "),
        destructive: [
          "bg-error text-white border-[color:rgba(120,20,20,0.35)] shadow-low",
          "hover:brightness-95 hover:shadow-mid active:translate-y-px",
        ].join(" "),
      },
      size: {
        sm: "h-8 px-xs text-caption",
        md: "h-9 px-sm text-body",
        lg: "h-11 px-md text-subhead",
        "icon-sm": "size-8",
        "icon-md": "size-9",
        "icon-lg": "size-11",
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

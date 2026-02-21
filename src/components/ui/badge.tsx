import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-3xs py-[2px] text-caption font-medium select-none",
  {
    variants: {
      variant: {
        default:
          "bg-primary-100 text-primary-800 dark:bg-primary-800 dark:text-primary-100",
        accent:
          "bg-accent-100 text-accent-800 dark:bg-accent-800 dark:text-accent-100",
        secondary:
          "bg-secondary-100 text-secondary-700 dark:bg-secondary-800 dark:text-secondary-200",
        success:
          "bg-success-subtle text-success dark:bg-success/20 dark:text-success",
        warning:
          "bg-warning-subtle text-warning dark:bg-warning/20 dark:text-warning",
        error:
          "bg-error-subtle text-error dark:bg-error/20 dark:text-error",
        info:
          "bg-info-subtle text-info dark:bg-info/20 dark:text-info",
        outline:
          "border border-[var(--color-border)] text-[var(--color-fg-secondary)] bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

// ── Variant map ───────────────────────────────────────────────────────────────

const textVariants = cva("", {
  variants: {
    variant: {
      caption:  "text-caption font-normal",
      body:     "text-body font-normal",
      subhead:  "text-subhead font-medium",
      title:    "text-title font-semibold",
      headline: "text-headline font-bold",
      display:  "text-display font-bold",
    },
    color: {
      primary:     "text-[var(--color-fg)]",
      secondary:   "text-[var(--color-fg-secondary)]",
      tertiary:    "text-[var(--color-fg-tertiary)]",
      disabled:    "text-[var(--color-fg-disabled)]",
      onPrimary:   "text-primary-50",
      onSecondary: "text-secondary-50",
      onAccent:    "text-[var(--color-fg-on-accent)]",
      inherit:     "",
    },
  },
  defaultVariants: {
    variant: "body",
    color: "primary",
  },
});

// ── Type map: default semantic element per variant ────────────────────────────

const defaultElement: Record<
  NonNullable<VariantProps<typeof textVariants>["variant"]>,
  React.ElementType
> = {
  caption:  "span",
  body:     "p",
  subhead:  "p",
  title:    "h3",
  headline: "h2",
  display:  "h1",
};

// ── Component ─────────────────────────────────────────────────────────────────

type TextVariant = NonNullable<VariantProps<typeof textVariants>["variant"]>;
type TextColor   = NonNullable<VariantProps<typeof textVariants>["color"]>;

export interface TextProps
  extends React.HTMLAttributes<HTMLElement>,
    VariantProps<typeof textVariants> {
  as?: React.ElementType;
  variant?: TextVariant;
  color?: TextColor;
}

const Text = React.forwardRef<HTMLElement, TextProps>(
  ({ className, variant = "body", color = "primary", as, children, ...props }, ref) => {
    const Comp = as ?? defaultElement[variant];
    return (
      <Comp
        ref={ref}
        className={cn(textVariants({ variant, color }), className)}
        {...props}
      >
        {children}
      </Comp>
    );
  },
);
Text.displayName = "Text";

export { Text, textVariants };
export type { TextVariant, TextColor };

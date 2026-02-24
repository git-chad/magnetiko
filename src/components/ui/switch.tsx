"use client";

import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as React from "react";

import { cn } from "@/lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    className={cn(
      "peer inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full",
      "border-2 border-transparent",
      "transition-[background-color,box-shadow] duration-base ease-micro",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] focus-visible:ring-offset-0",
      "disabled:cursor-not-allowed disabled:opacity-40",
      "data-[state=unchecked]:bg-primary-200/90 dark:data-[state=unchecked]:bg-primary-700/85",
      "data-[state=checked]:bg-accent data-[state=checked]:shadow-[0_0_0_1px_rgba(255,141,75,0.35)]",
      className,
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        "pointer-events-none block size-5 rounded-full bg-white shadow-low",
        "transition-transform duration-micro ease-micro",
        "data-[state=unchecked]:translate-x-0",
        "data-[state=checked]:translate-x-4",
      )}
    />
  </SwitchPrimitive.Root>
));
Switch.displayName = SwitchPrimitive.Root.displayName;

export { Switch };

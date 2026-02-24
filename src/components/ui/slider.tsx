"use client";

import * as SliderPrimitive from "@radix-ui/react-slider";
import * as React from "react";

import { cn } from "@/lib/utils";

interface SliderProps
  extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> {
  showValue?: boolean;
  formatValue?: (value: number) => string;
}

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  SliderProps
>(
  (
    {
      className,
      showValue = false,
      formatValue,
      value,
      defaultValue,
      onKeyDown,
      onValueChange,
      min = 0,
      max = 100,
      step = 1,
      ...props
    },
    ref,
  ) => {
  const currentValue = (value ?? defaultValue ?? [0]) as number[];
  const displayValue = formatValue
    ? formatValue(currentValue[0])
    : String(currentValue[0]);
  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      onKeyDown?.(event as React.KeyboardEvent<HTMLDivElement>);
      if (event.defaultPrevented || !event.shiftKey || !onValueChange) return;

      const incKeys = new Set(["ArrowRight", "ArrowUp", "PageUp"]);
      const decKeys = new Set(["ArrowLeft", "ArrowDown", "PageDown"]);
      if (!incKeys.has(event.key) && !decKeys.has(event.key)) return;

      event.preventDefault();
      const dir = incKeys.has(event.key) ? 1 : -1;
      const base = currentValue[0] ?? min;
      const next = Math.min(max, Math.max(min, base + step * 10 * dir));
      onValueChange([next]);
    },
    [currentValue, max, min, onKeyDown, onValueChange, step],
  );

  return (
    <div className="flex items-center gap-3xs w-full">
      <SliderPrimitive.Root
        ref={ref}
        className={cn(
          "relative flex w-full touch-none select-none items-center",
          className,
        )}
        min={min}
        max={max}
        step={step}
        value={value}
        defaultValue={defaultValue}
        onValueChange={onValueChange}
        onKeyDown={handleKeyDown}
        {...props}
      >
        <SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-primary-100/80 dark:bg-primary-700/80">
          <SliderPrimitive.Range className="absolute h-full bg-accent" />
        </SliderPrimitive.Track>
        {currentValue.map((_, i) => (
          <SliderPrimitive.Thumb
            key={i}
            className={cn(
              "block size-4 rounded-full bg-white shadow-mid",
              "border border-white/60 dark:border-primary-400/40",
              "transition-[color,box-shadow,transform] duration-base ease-micro",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)]",
              "disabled:pointer-events-none disabled:opacity-40",
              "hover:scale-105",
            )}
          />
        ))}
      </SliderPrimitive.Root>
      {showValue && (
        <span className="min-w-[2.5rem] text-right text-caption text-[var(--color-fg-secondary)] tabular-nums">
          {displayValue}
        </span>
      )}
    </div>
  );
},
);
Slider.displayName = SliderPrimitive.Root.displayName;

export { Slider };

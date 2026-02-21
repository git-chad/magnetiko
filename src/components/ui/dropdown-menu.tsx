"use client";

import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { CaretRight, Check, Circle } from "@phosphor-icons/react";
import * as React from "react";

import { cn } from "@/lib/utils";

const DropdownMenu = DropdownMenuPrimitive.Root;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
const DropdownMenuGroup = DropdownMenuPrimitive.Group;
const DropdownMenuPortal = DropdownMenuPrimitive.Portal;
const DropdownMenuSub = DropdownMenuPrimitive.Sub;
const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

const DropdownMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger> & {
    inset?: boolean;
  }
>(({ className, inset, children, ...props }, ref) => (
  <DropdownMenuPrimitive.SubTrigger
    ref={ref}
    className={cn(
      "flex cursor-default select-none items-center rounded-xs px-xs py-[5px]",
      "text-body text-[var(--color-fg)] outline-none",
      "focus:bg-[var(--color-hover-bg)]",
      "data-[state=open]:bg-[var(--color-hover-bg)]",
      inset && "pl-[2rem]",
      className,
    )}
    {...props}
  >
    {children}
    <CaretRight size={12} className="ml-auto text-[var(--color-fg-tertiary)]" />
  </DropdownMenuPrimitive.SubTrigger>
));
DropdownMenuSubTrigger.displayName = DropdownMenuPrimitive.SubTrigger.displayName;

const DropdownMenuSubContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.SubContent
    ref={ref}
    className={cn(
      "z-50 min-w-[8rem] overflow-hidden rounded-xs",
      "border border-[var(--color-border)] bg-[var(--color-bg-raised)]",
      "p-3xs shadow-mid",
      "data-[state=open]:animate-[dropdown-enter_120ms_var(--ease-enter)_both]",
      "data-[state=closed]:animate-[fade-in_72ms_var(--ease-exit)_reverse_both]",
      className,
    )}
    {...props}
  />
));
DropdownMenuSubContent.displayName = DropdownMenuPrimitive.SubContent.displayName;

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 min-w-[10rem] overflow-hidden rounded-xs",
        "border border-[var(--color-border)] bg-[var(--color-bg-raised)]",
        "p-3xs shadow-mid",
        "data-[state=open]:animate-[dropdown-enter_120ms_var(--ease-enter)_both]",
        "data-[state=closed]:animate-[fade-in_72ms_var(--ease-exit)_reverse_both]",
        className,
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;

const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    inset?: boolean;
    destructive?: boolean;
  }
>(({ className, inset, destructive, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center gap-2 rounded-xs",
      "px-xs py-[5px]",
      "text-body outline-none transition-colors duration-micro",
      destructive
        ? "text-error focus:bg-error-subtle dark:focus:bg-error/20"
        : "text-[var(--color-fg)] focus:bg-[var(--color-hover-bg)]",
      "data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
      inset && "pl-[2rem]",
      className,
    )}
    {...props}
  />
));
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;

const DropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
  <DropdownMenuPrimitive.CheckboxItem
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center rounded-xs",
      "py-[5px] pl-[2rem] pr-xs",
      "text-body text-[var(--color-fg)] outline-none",
      "transition-colors duration-micro",
      "focus:bg-[var(--color-hover-bg)]",
      "data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
      className,
    )}
    checked={checked}
    {...props}
  >
    <span className="absolute left-xs flex size-3 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <Check size={12} weight="bold" className="text-accent dark:text-accent-300" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.CheckboxItem>
));
DropdownMenuCheckboxItem.displayName = DropdownMenuPrimitive.CheckboxItem.displayName;

const DropdownMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
  <DropdownMenuPrimitive.RadioItem
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center rounded-xs",
      "py-[5px] pl-[2rem] pr-xs",
      "text-body text-[var(--color-fg)] outline-none",
      "transition-colors duration-micro",
      "focus:bg-[var(--color-hover-bg)]",
      "data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
      className,
    )}
    {...props}
  >
    <span className="absolute left-xs flex size-3 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <Circle size={6} weight="fill" className="text-accent dark:text-accent-300" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.RadioItem>
));
DropdownMenuRadioItem.displayName = DropdownMenuPrimitive.RadioItem.displayName;

const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & {
    inset?: boolean;
  }
>(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={cn(
      "px-xs py-3xs text-caption font-medium text-[var(--color-fg-tertiary)]",
      inset && "pl-[2rem]",
      className,
    )}
    {...props}
  />
));
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName;

const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn("-mx-3xs my-3xs h-px bg-[var(--color-border)]", className)}
    {...props}
  />
));
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName;

const DropdownMenuShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => (
  <span
    className={cn("ml-auto text-caption tracking-widest text-[var(--color-fg-tertiary)]", className)}
    {...props}
  />
);
DropdownMenuShortcut.displayName = "DropdownMenuShortcut";

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
};

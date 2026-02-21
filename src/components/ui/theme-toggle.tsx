"use client";

import * as React from "react";
import { Moon, Sun } from "@phosphor-icons/react";

import { useTheme } from "./theme-provider";
import { Button } from "./button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

interface ThemeToggleProps {
  className?: string;
}

function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-md"
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          onClick={toggle}
          className={className}
        >
          {isDark ? <Sun size={15} /> : <Moon size={15} />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {isDark ? "Light mode" : "Dark mode"}
      </TooltipContent>
    </Tooltip>
  );
}

export { ThemeToggle };

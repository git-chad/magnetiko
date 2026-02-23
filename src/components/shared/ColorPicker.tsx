"use client";

import * as React from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  Text,
} from "@/components/ui";

// ── Color math ────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((n) =>
        Math.round(Math.max(0, Math.min(255, n)))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const cmax = Math.max(rr, gg, bb);
  const cmin = Math.min(rr, gg, bb);
  const d = cmax - cmin;
  let h = 0;
  if (d > 0) {
    if      (cmax === rr) h = ((gg - bb) / d + (gg < bb ? 6 : 0)) * 60;
    else if (cmax === gg) h = ((bb - rr) / d + 2) * 60;
    else                  h = ((rr - gg) / d + 4) * 60;
  }
  return [h, cmax === 0 ? 0 : d / cmax, cmax];
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if      (h < 60)  { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) {         g = c; b = x; }
  else if (h < 240) {         g = x; b = c; }
  else if (h < 300) { r = x;         b = c; }
  else              { r = c;         b = x; }
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

/** Normalise any hex string → #rrggbb lowercase, or "" on failure. */
function toHex(raw: string): string {
  const s = raw.trim();
  const clean = s.startsWith("#") ? s : `#${s}`;
  if (/^#[0-9a-f]{6}$/i.test(clean)) return clean.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(clean)) {
    const [, r, g, b] = clean.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i)!;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return "";
}

// ── Constants ─────────────────────────────────────────────────────────────────

const HUE_GRADIENT = Array.from(
  { length: 13 },
  (_, i) => `hsl(${i * 30},100%,50%)`,
).join(",");

const MAX_RECENT = 8;

// ── Component ─────────────────────────────────────────────────────────────────

export interface ColorPickerProps {
  /** Current colour as a hex string, e.g. "#f5f5f0". */
  value: string;
  onChange: (hex: string) => void;
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [recent, setRecent] = React.useState<string[]>([]);

  // ── Internal HSV state (drives picker visuals) ────────────────────────────
  // Refs mirror the state values so drag callbacks never capture stale values.
  const hRef = React.useRef(0);
  const sRef = React.useRef(0);
  const vRef = React.useRef(1);
  const [h, setH] = React.useState(0);
  const [s, setS] = React.useState(0);
  const [v, setV] = React.useState(1);

  const setHSV = React.useCallback((hh: number, ss: number, vv: number) => {
    hRef.current = hh; sRef.current = ss; vRef.current = vv;
    setH(hh); setS(ss); setV(vv);
  }, []);

  // ── Text-input state (allows partial entry without clobbering mid-type) ───
  const [hexTxt, setHexTxt] = React.useState("");
  const [rgbTxt, setRgbTxt] = React.useState<[string, string, string]>([
    "255", "255", "255",
  ]);

  // ── Sync from external value ──────────────────────────────────────────────
  React.useEffect(() => {
    const norm = toHex(value);
    if (!norm) return;
    const [r, g, b] = hexToRgb(norm);
    const [hh, ss, vv] = rgbToHsv(r, g, b);
    setHSV(hh, ss, vv);
    setHexTxt(norm.slice(1).toUpperCase());
    setRgbTxt([String(r), String(g), String(b)]);
  }, [value, setHSV]);

  // ── Emit helpers ──────────────────────────────────────────────────────────
  const emitHex = React.useCallback(
    (hex: string) => {
      onChange(hex);
      const [r, g, b] = hexToRgb(hex);
      setHexTxt(hex.slice(1).toUpperCase());
      setRgbTxt([String(r), String(g), String(b)]);
    },
    [onChange],
  );

  // ── Drag refs & helpers ───────────────────────────────────────────────────
  const slRef  = React.useRef<HTMLDivElement>(null);
  const hueRef = React.useRef<HTMLDivElement>(null);

  const applySlDrag = React.useCallback(
    (clientX: number, clientY: number) => {
      if (!slRef.current) return;
      const rect = slRef.current.getBoundingClientRect();
      const ns = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const nv = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      sRef.current = ns; vRef.current = nv;
      setS(ns); setV(nv);
      emitHex(rgbToHex(...hsvToRgb(hRef.current, ns, nv)));
    },
    [emitHex],
  );

  const applyHueDrag = React.useCallback(
    (clientX: number) => {
      if (!hueRef.current) return;
      const rect = hueRef.current.getBoundingClientRect();
      const nh = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * 360;
      hRef.current = nh; setH(nh);
      emitHex(rgbToHex(...hsvToRgb(nh, sRef.current, vRef.current)));
    },
    [emitHex],
  );

  // React pointer event handlers (pointer capture keeps events flowing outside element)
  const slHandlers = {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      applySlDrag(e.clientX, e.clientY);
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      if (!(e.currentTarget as HTMLDivElement).hasPointerCapture(e.pointerId)) return;
      applySlDrag(e.clientX, e.clientY);
    },
  };

  const hueHandlers = {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      applyHueDrag(e.clientX);
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      if (!(e.currentTarget as HTMLDivElement).hasPointerCapture(e.pointerId)) return;
      applyHueDrag(e.clientX);
    },
  };

  // ── Popover close: record recent colour ───────────────────────────────────
  const handleOpenChange = (o: boolean) => {
    if (!o) {
      const norm = toHex(value) || value;
      setRecent((prev) =>
        [norm, ...prev.filter((c) => c !== norm)].slice(0, MAX_RECENT),
      );
    }
    setOpen(o);
  };

  // ── Text input handlers ───────────────────────────────────────────────────
  const onHexChange = (raw: string) => {
    const clean = raw.replace(/[^0-9a-fA-F]/g, "").slice(0, 6);
    setHexTxt(clean.toUpperCase());
    if (clean.length === 6) {
      const hex = `#${clean.toLowerCase()}`;
      const [r, g, b] = hexToRgb(hex);
      setHSV(...rgbToHsv(r, g, b));
      emitHex(hex);
    }
  };

  const onRgbChange = (ch: 0 | 1 | 2, raw: string) => {
    const next = [...rgbTxt] as [string, string, string];
    next[ch] = raw.replace(/[^0-9]/g, "").slice(0, 3);
    setRgbTxt(next);
    const nums = next.map((str) => parseInt(str, 10));
    if (nums.every((n) => !isNaN(n) && n >= 0 && n <= 255)) {
      const [r, g, b] = nums as [number, number, number];
      setHSV(...rgbToHsv(r, g, b));
      emitHex(rgbToHex(r, g, b));
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const currentHex = toHex(value) || "#000000";
  const dotHex     = rgbToHex(...hsvToRgb(h, s, v));

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Pick colour"
          className="flex items-center gap-xs hover:opacity-80 transition-opacity"
        >
          <span
            className="h-6 w-10 shrink-0 rounded-xs border border-[var(--color-border)] shadow-inner"
            style={{ backgroundColor: currentHex }}
          />
          <span className="font-mono text-caption text-[var(--color-fg-tertiary)] uppercase tracking-wide">
            {currentHex.slice(1)}
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={6}
        avoidCollisions
        className="w-[220px] p-xs flex flex-col gap-xs"
      >
        {/* ── Saturation / Value 2D area ──────────────────────────────── */}
        <div
          ref={slRef}
          role="presentation"
          aria-label="Saturation and brightness"
          className="relative w-full rounded-xs select-none cursor-crosshair overflow-hidden"
          style={{
            height: 120,
            background: [
              "linear-gradient(to bottom, transparent, black)",
              "linear-gradient(to right, white, transparent)",
              `hsl(${h}, 100%, 50%)`,
            ].join(", "),
          }}
          {...slHandlers}
        >
          {/* Crosshair thumb */}
          <div
            className="pointer-events-none absolute rounded-full border-2 border-white"
            style={{
              width: 14,
              height: 14,
              left: `${s * 100}%`,
              top: `${(1 - v) * 100}%`,
              transform: "translate(-50%, -50%)",
              backgroundColor: dotHex,
              boxShadow: "0 1px 4px rgba(0,0,0,0.5)",
            }}
          />
        </div>

        {/* ── Hue bar ──────────────────────────────────────────────────── */}
        <div
          ref={hueRef}
          role="presentation"
          aria-label="Hue"
          className="relative select-none cursor-ew-resize rounded-full"
          style={{
            height: 10,
            background: `linear-gradient(to right, ${HUE_GRADIENT})`,
          }}
          {...hueHandlers}
        >
          {/* Hue thumb */}
          <div
            className="pointer-events-none absolute rounded-xs border-2 border-white"
            style={{
              width: 10,
              height: 18,
              top: "50%",
              left: `${(h / 360) * 100}%`,
              transform: "translate(-50%, -50%)",
              backgroundColor: `hsl(${h}, 100%, 50%)`,
              boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
            }}
          />
        </div>

        {/* ── Hex input ────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3xs">
          <span className="font-mono text-caption text-[var(--color-fg-disabled)] w-3 text-center shrink-0">
            #
          </span>
          <input
            type="text"
            spellCheck={false}
            aria-label="Hex colour"
            className="flex-1 min-w-0 rounded-xs border border-[var(--color-border)] bg-transparent px-3xs py-[3px] font-mono text-caption text-[var(--color-fg-primary)] uppercase outline-none focus:border-[var(--color-accent)] transition-colors"
            value={hexTxt}
            onChange={(e) => onHexChange(e.target.value)}
            onBlur={() => {
              const norm = toHex(value);
              if (norm) setHexTxt(norm.slice(1).toUpperCase());
            }}
          />
        </div>

        {/* ── RGB inputs ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3xs">
          {(["R", "G", "B"] as const).map((label, i) => (
            <div key={label} className="flex flex-col items-center gap-[2px]">
              <input
                type="text"
                inputMode="numeric"
                aria-label={label}
                className="w-full rounded-xs border border-[var(--color-border)] bg-transparent px-3xs py-[3px] font-mono text-caption text-[var(--color-fg-primary)] text-center outline-none focus:border-[var(--color-accent)] transition-colors"
                value={rgbTxt[i]}
                onChange={(e) => onRgbChange(i as 0 | 1 | 2, e.target.value)}
                onBlur={() => {
                  const [r, g, b] = hexToRgb(toHex(value) || "#000000");
                  setRgbTxt([String(r), String(g), String(b)]);
                }}
              />
              <Text variant="caption" color="disabled" as="span">
                {label}
              </Text>
            </div>
          ))}
        </div>

        {/* ── Recent colours ───────────────────────────────────────────── */}
        {recent.length > 0 && (
          <div className="flex flex-col gap-[4px]">
            <Text variant="caption" color="disabled" as="span">
              Recent
            </Text>
            <div className="flex flex-wrap gap-[4px]">
              {recent.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Use colour ${c}`}
                  className="h-5 w-5 rounded-xs border border-[var(--color-border)] transition-transform hover:scale-110"
                  style={{ backgroundColor: c }}
                  onClick={() => {
                    const [r, g, b] = hexToRgb(c);
                    setHSV(...rgbToHsv(r, g, b));
                    emitHex(c);
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Design System Tokens — Shader Studio
 *
 * Single source of truth for all design values.
 * Used by Tailwind config, CSS custom properties, and component logic.
 */

// ─────────────────────────────────────────────────────────────────────────────
// COLORS
// ─────────────────────────────────────────────────────────────────────────────

export const colors = {
  primary: {
    950: '#10100f',
    900: '#141413',
    800: '#171716',
    700: '#1a1a19',
    DEFAULT: '#1d1d1c',
    500: '#4d4d46',
    400: '#7a7a73',
    300: '#a7a7a2',
    200: '#c8c8c3',
    100: '#d4d4cf',
    50: '#eaeae7',
  },

  secondary: {
    950: '#151510',
    900: '#252520',
    800: '#383832',
    700: '#515142',
    DEFAULT: '#656553',
    500: '#878772',
    400: '#a8a896',
    300: '#c5c5b8',
    200: '#d8d8cf',
    100: '#e0e0dd',
    50: '#f0f0ed',
  },

  accent: {
    950: '#15150b',
    900: '#222215',
    800: '#32321a',
    700: '#51512d',
    DEFAULT: '#64643a',
    500: '#8d8d58',
    400: '#adad80',
    300: '#c8c8a8',
    200: '#d8d8c4',
    100: '#e0e0d8',
    50: '#f0f0ec',
  },

  // Named semantic surfaces
  surface: {
    base: '#F5F5F0',
    raised: '#c5c5a6',
    overlay: '#94945e',
    sunken: '#4b4b2e',
  },

  text: {
    primary: '#111110',
    secondary: '#444440',
    tertiary: '#88887e',
    disabled: '#bbbbbb',
    onPrimary: '#F5F5F0',
    onSecondary: '#F5F5F0',
    onAccent: '#F5F5F0',
  },

  semantic: {
    success: '#22C55E',
    successSubtle: '#dcfce7',
    warning: '#F59E0B',
    warningSubtle: '#fef3c7',
    error: '#EF4444',
    errorSubtle: '#fee2e2',
    info: '#3B82F6',
    infoSubtle: '#dbeafe',
  },

  // Interactive state overlays (applied as bg color additions)
  interactive: {
    hoverBg: 'rgba(0, 0, 0, 0.04)',
    activeBg: 'rgba(0, 0, 0, 0.08)',
    selectedBg: 'rgba(100, 100, 58, 0.12)', // accent with opacity
    focusRing: 'rgba(100, 100, 58, 0.4)',
    disabledBg: 'rgba(0, 0, 0, 0.06)',
    disabledText: '#bbbbbb',
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// SPACING
// ─────────────────────────────────────────────────────────────────────────────

export const spacing = {
  '4xs': 3,
  '3xs': 6,
  '2xs': 9,
  xs: 12,
  sm: 18,
  md: 24,
  lg: 36,
  xl: 48,
  '2xl': 72,
  '3xl': 96,
  '4xl': 144,
} as const satisfies Record<string, number>;

/** Spacing in px strings, for use in CSS-in-JS or inline styles */
export const spacingPx = Object.fromEntries(
  Object.entries(spacing).map(([k, v]) => [k, `${v}px`])
) as Record<keyof typeof spacing, string>;

// ─────────────────────────────────────────────────────────────────────────────
// TYPOGRAPHY
// ─────────────────────────────────────────────────────────────────────────────

export type TypeVariant = 'caption' | 'body' | 'subhead' | 'title' | 'headline' | 'display';

export interface TypeStyle {
  fontFamily: string;
  fontSize: string;
  fontWeight: number;
  lineHeight: string;
  letterSpacing: string;
}

export const typography: Record<TypeVariant, TypeStyle> = {
  caption: {
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: '12px',
    fontWeight: 400,
    lineHeight: '24px',
    letterSpacing: '0.01em',
  },
  body: {
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: '14px',
    fontWeight: 400,
    lineHeight: '24px',
    letterSpacing: '0em',
  },
  subhead: {
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: '17px',
    fontWeight: 500,
    lineHeight: '24px',
    letterSpacing: '0em',
  },
  title: {
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: '20px',
    fontWeight: 600,
    lineHeight: '24px',
    letterSpacing: '-0.005em',
  },
  headline: {
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: '24px',
    fontWeight: 700,
    lineHeight: '32px',
    letterSpacing: '-0.01em',
  },
  display: {
    fontFamily: "'Inter', system-ui, sans-serif",
    fontSize: '29px',
    fontWeight: 700,
    lineHeight: '40px',
    letterSpacing: '-0.015em',
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// BORDER RADIUS
// ─────────────────────────────────────────────────────────────────────────────

export const radius = {
  xs: '2px',
  sm: '4px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  full: '9999px',
} as const;

/**
 * Semantic radius aliases matching component usage:
 * Buttons: sm | Inputs: sm | Cards: md | Modals: lg | Tooltips: xs | Badges: full
 */
export const radiusComponent = {
  button: radius.sm,
  input: radius.sm,
  card: radius.md,
  modal: radius.lg,
  tooltip: radius.xs,
  badge: radius.full,
  popover: radius.sm,
  dropdown: radius.sm,
  switch: radius.full,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// ELEVATION (box-shadow)
// ─────────────────────────────────────────────────────────────────────────────

export const elevation = {
  low: '0 1px 3px 0px rgba(0,0,0,0.047)',
  mid: '0 3px 8px 0px rgba(0,0,0,0.08)',
  high: '0 7px 18px 0px rgba(0,0,0,0.119)',
  none: 'none',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// MOTION
// ─────────────────────────────────────────────────────────────────────────────

export const duration = {
  micro: '60ms',
  base: '120ms',
  medium: '150ms',
  large: '500ms',
} as const;

export const easing = {
  /** Spring-like enter easing for popups, tooltips, and interactive feedback */
  enter: 'cubic-bezier(.2,1.4,.4,1)',
  /** Quick, clean exit — just fast enough to not feel sluggish */
  exit: 'cubic-bezier(0,0,.2,1)',
  /** Neutral spatial movement for drag/drop and position changes */
  move: 'cubic-bezier(.2,1.4,.4,1)',
  /** Snappy micro-interactions (toggle, check, switch) */
  micro: 'cubic-bezier(.2,1.4,.4,1)',
} as const;

/** Pre-combined transition strings for convenience */
export const transition = {
  micro: `${duration.micro} ${easing.micro}`,
  base: `${duration.base} ${easing.enter}`,
  medium: `${duration.medium} ${easing.enter}`,
  large: `${duration.large} ${easing.enter}`,
  microExit: `${String(Number.parseInt(duration.micro) * 0.6)}ms ${easing.exit}`,
  baseExit: `${String(Math.round(Number.parseInt(duration.base) * 0.6))}ms ${easing.exit}`,
  mediumExit: `${String(Math.round(Number.parseInt(duration.medium) * 0.6))}ms ${easing.exit}`,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// BORDERS
// ─────────────────────────────────────────────────────────────────────────────

export const border = {
  base: 'rgba(0,0,0,0.04)',
  divider: 'rgba(0,0,0,0.08)',
  hover: 'rgba(0,0,0,0.14)',
  focus: 'rgba(100,100,58,0.6)', // accent-based
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// OVERLAYS
// ─────────────────────────────────────────────────────────────────────────────

export const overlay = {
  /** Modal backdrop — semi-opaque dark */
  backdrop: 'rgba(17,17,16,0.55)',
  /** Uniform overlay for disabled states */
  uniform: 'rgba(17,17,16,0.12)',
  /** Frosted-glass backdrop filter value (used with CSS backdrop-filter) */
  blur: 'blur(12px)',
  /** Bottom-to-top scrim gradient for image captions and video overlays */
  scrim: 'linear-gradient(to top, rgba(17,17,16,0.72) 0%, rgba(17,17,16,0) 100%)',
} as const;

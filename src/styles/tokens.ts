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
    950: '#0f120f',
    900: '#171b17',
    800: '#1f2520',
    700: '#2a322b',
    DEFAULT: '#364038',
    500: '#556257',
    400: '#778377',
    300: '#99a398',
    200: '#bdc3bb',
    100: '#dde0da',
    50: '#f1f4ef',
  },

  secondary: {
    950: '#141813',
    900: '#1c231c',
    800: '#273126',
    700: '#394638',
    DEFAULT: '#526250',
    500: '#70806f',
    400: '#8f9c8e',
    300: '#afbaae',
    200: '#ced6cd',
    100: '#e5eae4',
    50: '#f4f7f3',
  },

  accent: {
    950: '#2d1202',
    900: '#4d2106',
    800: '#6f3009',
    700: '#99410f',
    DEFAULT: '#ff6a1f',
    500: '#ff8d4b',
    400: '#ffae79',
    300: '#ffccaa',
    200: '#ffe3d0',
    100: '#fff1e8',
    50: '#fff8f3',
  },

  // Named semantic surfaces
  surface: {
    base: '#f1f4f9',
    raised: '#ffffff',
    overlay: '#e8edf5',
    sunken: '#d8dfeb',
  },

  text: {
    primary: '#1b231c',
    secondary: '#445242',
    tertiary: '#718070',
    disabled: '#a3aca2',
    onPrimary: '#f8fbff',
    onSecondary: '#f8fbff',
    onAccent: '#fffaf6',
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
    hoverBg: 'rgba(19, 33, 20, 0.06)',
    activeBg: 'rgba(19, 33, 20, 0.11)',
    selectedBg: 'rgba(255, 106, 31, 0.16)',
    focusRing: 'rgba(255, 106, 31, 0.28)',
    disabledBg: 'rgba(19, 33, 20, 0.08)',
    disabledText: '#a3aca2',
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

const appleSans = "'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', 'Segoe UI', sans-serif";

export const typography: Record<TypeVariant, TypeStyle> = {
  caption: {
    fontFamily: appleSans,
    fontSize: '12px',
    fontWeight: 400,
    lineHeight: '15px',
    letterSpacing: '0.01em',
  },
  body: {
    fontFamily: appleSans,
    fontSize: '14px',
    fontWeight: 400,
    lineHeight: '18px',
    letterSpacing: '0em',
  },
  subhead: {
    fontFamily: appleSans,
    fontSize: '17px',
    fontWeight: 500,
    lineHeight: '20px',
    letterSpacing: '0em',
  },
  title: {
    fontFamily: appleSans,
    fontSize: '20px',
    fontWeight: 600,
    lineHeight: '24px',
    letterSpacing: '-0.005em',
  },
  headline: {
    fontFamily: appleSans,
    fontSize: '24px',
    fontWeight: 700,
    lineHeight: '30px',
    letterSpacing: '-0.01em',
  },
  display: {
    fontFamily: appleSans,
    fontSize: '29px',
    fontWeight: 700,
    lineHeight: '34px',
    letterSpacing: '-0.015em',
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// BORDER RADIUS
// ─────────────────────────────────────────────────────────────────────────────

export const radius = {
  xs: '4px',
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '20px',
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
  low: '0 1px 1px rgba(18, 24, 18, 0.04), 0 4px 8px rgba(18, 24, 18, 0.06)',
  mid: '0 8px 24px rgba(18, 24, 18, 0.1), 0 2px 8px rgba(18, 24, 18, 0.08)',
  high: '0 18px 48px rgba(18, 24, 18, 0.16), 0 6px 18px rgba(18, 24, 18, 0.12)',
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
  base: 'rgba(19,33,20,0.1)',
  divider: 'rgba(19,33,20,0.14)',
  hover: 'rgba(19,33,20,0.22)',
  focus: 'rgba(255,106,31,0.62)',
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// OVERLAYS
// ─────────────────────────────────────────────────────────────────────────────

export const overlay = {
  /** Modal backdrop — semi-opaque dark */
  backdrop: 'rgba(12,17,13,0.42)',
  /** Uniform overlay for disabled states */
  uniform: 'rgba(12,17,13,0.12)',
  /** Frosted-glass backdrop filter value (used with CSS backdrop-filter) */
  blur: 'blur(12px)',
  /** Bottom-to-top scrim gradient for image captions and video overlays */
  scrim: 'linear-gradient(to top, rgba(12,17,13,0.72) 0%, rgba(12,17,13,0) 100%)',
} as const;

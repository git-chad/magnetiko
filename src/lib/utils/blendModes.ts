import {
  vec3,
  vec4,
  float,
  min,
  max,
  mix,
  clamp,
  abs,
  sqrt,
  dot,
  select,
} from "three/tsl";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Node = any;

// ─────────────────────────────────────────────────────────────────────────────
// Separable blend modes (operate component-wise on vec3 RGB)
// ─────────────────────────────────────────────────────────────────────────────

function _normal(_base: Node, blend: Node): Node {
  return blend;
}

function _multiply(base: Node, blend: Node): Node {
  return base.mul(blend);
}

function _screen(base: Node, blend: Node): Node {
  // 1 − (1−base) × (1−blend)
  return float(1).sub(float(1).sub(base).mul(float(1).sub(blend)));
}

function _overlay(base: Node, blend: Node): Node {
  // Per-component: base < 0.5 → 2·base·blend, else 1 − 2·(1−base)·(1−blend)
  const dark = float(2).mul(base).mul(blend);
  const light = float(1).sub(float(2).mul(float(1).sub(base)).mul(float(1).sub(blend)));
  return select(base.lessThan(float(0.5)), dark, light);
}

function _darken(base: Node, blend: Node): Node {
  return min(base, blend);
}

function _lighten(base: Node, blend: Node): Node {
  return max(base, blend);
}

function _colorDodge(base: Node, blend: Node): Node {
  return clamp(base.div(max(float(1).sub(blend), float(1e-6))), vec3(0), vec3(1));
}

function _colorBurn(base: Node, blend: Node): Node {
  return clamp(float(1).sub(float(1).sub(base).div(max(blend, float(1e-6)))), vec3(0), vec3(1));
}

function _hardLight(base: Node, blend: Node): Node {
  // Overlay with base/blend roles swapped
  return _overlay(blend, base);
}

function _softLight(base: Node, blend: Node): Node {
  // W3C formula, per component:
  //   blend ≤ 0.5 → base − (1−2·blend)·base·(1−base)
  //   blend > 0.5, base ≤ 0.25 → base + (2·blend−1)·(((16·base−12)·base+4)·base − base)
  //   blend > 0.5, base > 0.25  → base + (2·blend−1)·(√base − base)
  const darkResult = base.sub(
    float(1).sub(float(2).mul(blend)).mul(base).mul(float(1).sub(base)),
  );
  const b2 = float(2).mul(blend).sub(float(1));
  const dLow = float(16).mul(base).sub(float(12)).mul(base).add(float(4)).mul(base);
  const dHigh = sqrt(base);
  const d = select(base.lessThanEqual(float(0.25)), dLow, dHigh);
  const lightResult = base.add(b2.mul(d.sub(base)));
  return select(blend.lessThanEqual(float(0.5)), darkResult, lightResult);
}

function _difference(base: Node, blend: Node): Node {
  return abs(base.sub(blend));
}

function _exclusion(base: Node, blend: Node): Node {
  return base.add(blend).sub(float(2).mul(base).mul(blend));
}

// ─────────────────────────────────────────────────────────────────────────────
// Non-separable helpers (W3C Compositing & Blending Level 1 spec)
// ─────────────────────────────────────────────────────────────────────────────

/** Rec. 709 relative luminance. Returns a float node. */
function _lum(c: Node): Node {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

/**
 * ClipColor — ensure the color stays in [0,1] gamut while preserving
 * luminance. Applies the low clip first, then the high clip.
 */
function _clipColor(c: Node): Node {
  const l = _lum(c);
  const cMin = min(c.x, min(c.y, c.z));
  const cMax = max(c.x, max(c.y, c.z));

  // Low clip: cMin < 0
  const cLow = c.sub(l).mul(l.div(max(l.sub(cMin), float(1e-6)))).add(l);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c1: any = select(cMin.lessThan(float(0)), cLow, c);

  // High clip: cMax > 1 (recompute max after low clip)
  const cMax2 = max(c1.x, max(c1.y, c1.z));
  const excess = cMax2.sub(float(1));
  const cHigh = c1.sub(l).mul(float(1).sub(l).div(max(excess, float(1e-6)))).add(l);
  return select(cMax2.greaterThan(float(1)), cHigh, c1);
}

/** SetLum — shift color so its luminance equals `lum`, then clip to gamut. */
function _setLum(c: Node, lum: Node): Node {
  // c + (lum − Lum(c)) broadcasts the float delta to vec3
  return _clipColor(c.add(lum.sub(_lum(c))));
}

/** Sat — range of a color (max component − min component). Returns float. */
function _sat(c: Node): Node {
  return max(c.x, max(c.y, c.z)).sub(min(c.x, min(c.y, c.z)));
}

/**
 * SetSat — set the saturation (range) of a color while preserving its hue and
 * luminance order. Implementation mirrors the W3C sorted-channel algorithm:
 *   - minimum channel → 0
 *   - maximum channel → sat
 *   - middle channel  → (c − cMin) / (cMax − cMin) × sat
 */
function _setSat(c: Node, sat: Node): Node {
  const r = c.x;
  const g = c.y;
  const b = c.z;

  const cMin = min(r, min(g, b));
  const cMax = max(r, max(g, b));
  const delta = cMax.sub(cMin);
  const scale = select(delta.greaterThan(float(0)), sat.div(delta), float(0));

  const rOut = select(
    r.lessThanEqual(cMin),
    float(0),
    select(r.greaterThanEqual(cMax), sat, r.sub(cMin).mul(scale)),
  );
  const gOut = select(
    g.lessThanEqual(cMin),
    float(0),
    select(g.greaterThanEqual(cMax), sat, g.sub(cMin).mul(scale)),
  );
  const bOut = select(
    b.lessThanEqual(cMin),
    float(0),
    select(b.greaterThanEqual(cMax), sat, b.sub(cMin).mul(scale)),
  );

  return vec3(rOut, gOut, bOut);
}

// ─────────────────────────────────────────────────────────────────────────────
// Non-separable blend modes
// ─────────────────────────────────────────────────────────────────────────────

function _hue(base: Node, blend: Node): Node {
  return _setLum(_setSat(blend, _sat(base)), _lum(base));
}

function _saturation(base: Node, blend: Node): Node {
  return _setLum(_setSat(base, _sat(blend)), _lum(base));
}

function _color(base: Node, blend: Node): Node {
  return _setLum(blend, _lum(base));
}

function _luminosity(base: Node, blend: Node): Node {
  return _setLum(base, _lum(blend));
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a TSL node that composites `blend` over `base` using the CSS blend
 * mode named by `mode`, attenuated by `opacity`.
 *
 * ```
 * result.rgb = mix(base.rgb, blendFn(base.rgb, blend.rgb), opacity)
 * result.a   = 1.0
 * ```
 *
 * @param mode    CSS blend mode name (e.g. "multiply", "screen", "hue")
 * @param base    vec4 node — the layer below (input texture)
 * @param blend   vec4 node — this layer's shader output
 * @param opacity float node — layer opacity uniform (0–1)
 */
export function buildBlendNode(
  mode: string,
  base: Node,
  blend: Node,
  opacity: Node,
  filterMode: "filter" | "mask" = "filter",
  layerMask?: Node,
  hasCustomMask?: Node,
): Node {
  const b = base.rgb;
  const e = blend.rgb;
  const externalMask = layerMask
    ? float(clamp(dot(layerMask.rgb, vec3(0.2126, 0.7152, 0.0722)), float(0.0), float(1.0)))
    : float(1.0);
  const effectiveOpacity = float(clamp(float(opacity).mul(externalMask), float(0.0), float(1.0)));

  let composited: Node;
  switch (mode) {
    case "multiply":    composited = _multiply(b, e);    break;
    case "screen":      composited = _screen(b, e);      break;
    case "overlay":     composited = _overlay(b, e);     break;
    case "darken":      composited = _darken(b, e);      break;
    case "lighten":     composited = _lighten(b, e);     break;
    case "color-dodge": composited = _colorDodge(b, e);  break;
    case "color-burn":  composited = _colorBurn(b, e);   break;
    case "hard-light":  composited = _hardLight(b, e);   break;
    case "soft-light":  composited = _softLight(b, e);   break;
    case "difference":  composited = _difference(b, e);  break;
    case "exclusion":   composited = _exclusion(b, e);   break;
    case "hue":         composited = _hue(b, e);         break;
    case "saturation":  composited = _saturation(b, e);  break;
    case "color":       composited = _color(b, e);       break;
    case "luminosity":  composited = _luminosity(b, e);  break;
    case "normal":
    default:            composited = _normal(b, e);      break;
  }

  // Filter mode: regular opacity mix.
  if (filterMode === "filter") {
    return vec4(mix(b, composited, effectiveOpacity), float(1.0));
  }

  // Mask mode:
  // - With a painted mask: painted mask drives reveal strength directly.
  // - Without painted mask: fallback to effect luminance as mask weight.
  const maskLuma = float(dot(e, vec3(0.2126, 0.7152, 0.0722)));
  const customMaskMix = hasCustomMask
    ? float(clamp(float(hasCustomMask), float(0.0), float(1.0)))
    : float(1.0);
  const activeMask = float(mix(maskLuma, externalMask, customMaskMix));
  const maskedOpacity = float(clamp(float(opacity).mul(activeMask), float(0.0), float(1.0)));
  return vec4(mix(b, composited, maskedOpacity), float(1.0));
}

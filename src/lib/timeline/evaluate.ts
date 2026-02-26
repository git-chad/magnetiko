import type { TimelineTrack } from "@/store/timelineStore";
import type { Layer, ShaderParam } from "@/types";

export interface EvaluatedLayerParams {
  layerId: string;
  params: ShaderParam[];
}

function isNumericArray(value: ShaderParam["value"]): value is number[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "number")
  );
}

function cloneParamValue(value: ShaderParam["value"]): ShaderParam["value"] {
  return Array.isArray(value) ? [...value] : value;
}

function valueSignature(value: ShaderParam["value"]): string {
  if (Array.isArray(value)) return `[${value.join(",")}]`;
  return String(value);
}

export function paramsSignature(params: ShaderParam[]): string {
  return params
    .map((param) => `${param.key}:${valueSignature(param.value)}`)
    .join("|");
}

function easeInOutCubic(t: number): number {
  if (t < 0.5) return 4 * t * t * t;
  return 1 - (-2 * t + 2) ** 3 / 2;
}

function parseHexColor(value: string): [number, number, number] | null {
  const raw = value.trim().toLowerCase();
  if (!raw.startsWith("#")) return null;
  const hex = raw.slice(1);

  if (hex.length === 3 || hex.length === 4) {
    const r = Number.parseInt(hex[0] + hex[0], 16);
    const g = Number.parseInt(hex[1] + hex[1], 16);
    const b = Number.parseInt(hex[2] + hex[2], 16);
    if ([r, g, b].some((channel) => Number.isNaN(channel))) return null;
    return [r, g, b];
  }

  if (hex.length === 6 || hex.length === 8) {
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    if ([r, g, b].some((channel) => Number.isNaN(channel))) return null;
    return [r, g, b];
  }

  return null;
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (value: number) => {
    const clamped = Math.max(0, Math.min(255, Math.round(value)));
    return clamped.toString(16).padStart(2, "0");
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function countStepDecimals(step: number): number {
  const value = step.toString().toLowerCase();
  if (value.includes("e-")) {
    const [, exp] = value.split("e-");
    const parsed = Number.parseInt(exp ?? "0", 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  const dot = value.indexOf(".");
  if (dot < 0) return 0;
  return value.length - dot - 1;
}

function resolveStep(
  param: ShaderParam,
  paramType: TimelineTrack["paramType"],
): number | null {
  if (
    typeof param.step === "number" &&
    Number.isFinite(param.step) &&
    param.step > 0
  ) {
    return param.step;
  }
  if (paramType === "int") return 1;
  return null;
}

function clampToRange(value: number, param: ShaderParam): number {
  let next = value;
  if (typeof param.min === "number" && Number.isFinite(param.min)) {
    next = Math.max(param.min, next);
  }
  if (typeof param.max === "number" && Number.isFinite(param.max)) {
    next = Math.min(param.max, next);
  }
  return next;
}

function quantizeToParam(
  value: number,
  param: ShaderParam,
  paramType: TimelineTrack["paramType"],
): number {
  let next = clampToRange(value, param);
  const step = resolveStep(param, paramType);
  if (step && step > 0) {
    next = Math.round(next / step) * step;
    const decimals = Math.max(0, Math.min(8, countStepDecimals(step)));
    if (decimals > 0) {
      next = Number(next.toFixed(decimals));
    }
  }
  if (paramType === "int") {
    next = Math.round(next);
  }
  return clampToRange(next, param);
}

function interpolateParamValue(
  from: ShaderParam["value"],
  to: ShaderParam["value"],
  t: number,
  interpolation: TimelineTrack["interpolation"],
  paramType: TimelineTrack["paramType"],
  param: ShaderParam,
): ShaderParam["value"] {
  if (interpolation === "step") return cloneParamValue(from);
  const eased = interpolation === "smooth" ? easeInOutCubic(t) : t;

  if (
    (paramType === "float" || paramType === "int") &&
    typeof from === "number" &&
    typeof to === "number"
  ) {
    return quantizeToParam(lerp(from, to, eased), param, paramType);
  }

  if (
    (paramType === "vec2" || paramType === "vec3") &&
    isNumericArray(from) &&
    isNumericArray(to)
  ) {
    if (from.length !== to.length) return cloneParamValue(from);
    return from.map((value, index) =>
      quantizeToParam(lerp(value, to[index] ?? value, eased), param, paramType),
    );
  }

  if (
    paramType === "color" &&
    typeof from === "string" &&
    typeof to === "string"
  ) {
    const fromRgb = parseHexColor(from);
    const toRgb = parseHexColor(to);
    if (!fromRgb || !toRgb) {
      return eased < 0.5 ? from : to;
    }
    return rgbToHex(
      lerp(fromRgb[0], toRgb[0], eased),
      lerp(fromRgb[1], toRgb[1], eased),
      lerp(fromRgb[2], toRgb[2], eased),
    );
  }

  return eased < 0.5 ? cloneParamValue(from) : cloneParamValue(to);
}

function evaluateTrackAtTime(
  track: TimelineTrack,
  time: number,
  param: ShaderParam,
): ShaderParam["value"] | null {
  if (!track.enabled || track.keyframes.length === 0) return null;

  const keyframes = track.keyframes;
  if (keyframes.length === 1) {
    return cloneParamValue(keyframes[0].value);
  }

  const first = keyframes[0];
  const last = keyframes[keyframes.length - 1];
  if (!first || !last) return null;

  if (time <= first.time) return cloneParamValue(first.value);
  if (time >= last.time) return cloneParamValue(last.value);

  for (let index = 1; index < keyframes.length; index++) {
    const next = keyframes[index];
    const prev = keyframes[index - 1];
    if (!next || !prev) continue;
    if (time > next.time) continue;

    const span = Math.max(next.time - prev.time, 1e-6);
    const rawT = Math.max(0, Math.min(1, (time - prev.time) / span));
    return interpolateParamValue(
      prev.value,
      next.value,
      rawT,
      track.interpolation,
      track.paramType,
      param,
    );
  }

  return cloneParamValue(last.value);
}

export function getTimelineControlledLayerIds(
  tracks: TimelineTrack[],
  layers: Layer[],
): Set<string> {
  const validLayerIds = new Set(layers.map((layer) => layer.id));
  const controlled = new Set<string>();
  for (const track of tracks) {
    if (!validLayerIds.has(track.layerId)) continue;
    controlled.add(track.layerId);
  }
  return controlled;
}

export function evaluateTimelineForLayers(
  layers: Layer[],
  tracks: TimelineTrack[],
  time: number,
): EvaluatedLayerParams[] {
  if (tracks.length === 0) return [];

  const layerById = new Map(layers.map((layer) => [layer.id, layer]));
  const trackOverridesByLayer = new Map<
    string,
    Map<string, ShaderParam["value"]>
  >();

  for (const track of tracks) {
    const layer = layerById.get(track.layerId);
    if (!layer) continue;
    const targetParam =
      layer.params.find((param) => param.key === track.paramKey) ?? null;
    if (!targetParam) continue;

    let layerOverrides = trackOverridesByLayer.get(track.layerId);
    if (!layerOverrides) {
      layerOverrides = new Map();
      trackOverridesByLayer.set(track.layerId, layerOverrides);
    }

    const value = evaluateTrackAtTime(track, time, targetParam);
    if (value !== null) {
      layerOverrides.set(track.paramKey, value);
    }
  }

  const evaluated: EvaluatedLayerParams[] = [];
  const controlledLayerIds = getTimelineControlledLayerIds(tracks, layers);
  for (const layerId of controlledLayerIds) {
    const layer = layerById.get(layerId);
    if (!layer) continue;
    const overrides = trackOverridesByLayer.get(layerId);
    const params = layer.params.map((param) => {
      const override = overrides?.get(param.key);
      if (override === undefined) return { ...param };
      return {
        ...param,
        value: cloneParamValue(override),
      };
    });
    evaluated.push({ layerId, params });
  }

  return evaluated;
}

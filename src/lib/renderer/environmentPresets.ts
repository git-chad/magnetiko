import * as THREE from "three/webgpu";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";

const HDRI_ROOT =
  "https://raw.githack.com/pmndrs/drei-assets/456060a26bbeb8fdf79326f224b6d99b8bcce736/hdri/";

const PRESET_FILE = {
  apartment: "lebombo_1k.hdr",
  city: "potsdamer_platz_1k.hdr",
  dawn: "kiara_1_dawn_1k.hdr",
  forest: "forest_slope_1k.hdr",
  lobby: "st_fagans_interior_1k.hdr",
  night: "dikhololo_night_1k.hdr",
  park: "rooitou_park_1k.hdr",
  studio: "studio_small_03_1k.hdr",
  sunset: "venice_sunset_1k.hdr",
  warehouse: "empty_warehouse_01_1k.hdr",
} as const;

export type EnvironmentPresetId = keyof typeof PRESET_FILE | "custom";

const textureCache = new Map<Exclude<EnvironmentPresetId, "custom">, Promise<THREE.Texture>>();

export function isHdriPreset(
  preset: EnvironmentPresetId,
): preset is Exclude<EnvironmentPresetId, "custom"> {
  return preset !== "custom";
}

export function parseEnvironmentPreset(value: unknown): EnvironmentPresetId {
  if (typeof value !== "string") return "studio";
  if (value === "custom") return "custom";
  if (value in PRESET_FILE) return value as Exclude<EnvironmentPresetId, "custom">;
  return "studio";
}

export function loadEnvironmentPreset(
  preset: Exclude<EnvironmentPresetId, "custom">,
): Promise<THREE.Texture> {
  const cached = textureCache.get(preset);
  if (cached) return cached;

  const filename = PRESET_FILE[preset];
  const url = `${HDRI_ROOT}${filename}`;

  const promise = new RGBELoader().loadAsync(url).then((texture) => {
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.LinearSRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  });

  textureCache.set(preset, promise);
  return promise;
}

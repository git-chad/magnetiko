import * as THREE from "three/webgpu";

// ─────────────────────────────────────────────────────────────────────────────
// Bayer matrix data (row-major, values 0..N²-1)
// ─────────────────────────────────────────────────────────────────────────────

const BAYER_2x2 = [
  0, 2,
  3, 1,
];

const BAYER_4x4 = [
   0,  8,  2, 10,
  12,  4, 14,  6,
   3, 11,  1,  9,
  15,  7, 13,  5,
];

const BAYER_8x8 = [
   0, 32,  8, 40,  2, 34, 10, 42,
  48, 16, 56, 24, 50, 18, 58, 26,
  12, 44,  4, 36, 14, 46,  6, 38,
  60, 28, 52, 20, 62, 30, 54, 22,
   3, 35, 11, 43,  1, 33,  9, 41,
  51, 19, 59, 27, 49, 17, 57, 25,
  15, 47,  7, 39, 13, 45,  5, 37,
  63, 31, 55, 23, 61, 29, 53, 21,
];

// ─────────────────────────────────────────────────────────────────────────────
// Builders
// ─────────────────────────────────────────────────────────────────────────────

function buildBayerTexture(matrix: number[], size: number): THREE.DataTexture {
  const normalizer = size * size;
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const v = Math.round((matrix[i] / normalizer) * 255);
    data[i * 4 + 0] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(
    data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType,
  );
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS     = THREE.RepeatWrapping;
  tex.wrapT     = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

/**
 * 64×64 interleaved-gradient-noise texture.
 *
 * IGN (Jimenez et al., 2014) gives an organic, aperiodic threshold map that
 * approximates blue-noise characteristics without requiring pre-computed data.
 * Used for blue-noise, Floyd-Steinberg, and Atkinson approximations.
 */
function buildBlueNoiseTexture(size = 64): THREE.DataTexture {
  const fract = (x: number) => x - Math.floor(x);
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = Math.round(fract(52.9829189 * fract(0.06711056 * x + 0.00583715 * y)) * 255);
      const i = (y * size + x) * 4;
      data[i + 0] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(
    data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType,
  );
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS     = THREE.RepeatWrapping;
  tex.wrapT     = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export interface DitherTextures {
  bayer2:     THREE.DataTexture;
  bayer4:     THREE.DataTexture;
  bayer8:     THREE.DataTexture;
  blueNoise:  THREE.DataTexture;
}

export function buildDitherTextures(): DitherTextures {
  return {
    bayer2:    buildBayerTexture(BAYER_2x2, 2),
    bayer4:    buildBayerTexture(BAYER_4x4, 4),
    bayer8:    buildBayerTexture(BAYER_8x8, 8),
    blueNoise: buildBlueNoiseTexture(64),
  };
}

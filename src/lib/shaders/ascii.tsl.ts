import * as THREE from "three/webgpu";
import {
  uv,
  vec2,
  vec3,
  vec4,
  float,
  uniform,
  floor,
  fract,
  clamp,
  mix,
  select,
  length,
  screenSize,
  texture as tslTexture,
} from "three/tsl";
import { PassNode } from "@/lib/renderer/PassNode";
import { BloomSubPass } from "@/lib/renderer/BloomSubPass";
import type { ShaderParam } from "@/types";
import { buildAsciiAtlas, CHARSETS } from "@/lib/utils/asciiAtlas";
import type { FontWeight } from "@/lib/utils/asciiAtlas";

// ─────────────────────────────────────────────────────────────────────────────
// AsciiPass
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ASCII art filter pass.
 *
 * Divides the screen into a grid of character cells. Each cell samples
 * the input texture at its center, converts the colour to luminance, and
 * looks up the matching glyph from a pre-generated font atlas texture.
 *
 * Font atlas layout:
 *   One horizontal row, one cell per character (ATLAS_CELL_PX × ATLAS_CELL_PX).
 *   UV: x = (charIndex + cellFract.x) / numChars,  y = cellFract.y
 *
 * Color modes (_colorModeU):
 *   0 = source     — glyph takes the cell-center colour; bg = source * bgOpacity
 *   1 = monochrome — white glyphs on black background
 *   2 = green-terminal — green-luminance glyphs on black (classic CRT)
 */
export class AsciiPass extends PassNode {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _cellSizeU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _numCharsU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _colorModeU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _bgOpacityU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _invertU: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _interactionModeU: any; // 0=none,1=trail,2=displacement
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _interactionAmountU: any;

  // Mutable texture nodes — updated each frame in render() without recompile.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _inputSampledNode: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _atlasSampledNode: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _interactionTrailNode: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _interactionDisplacementNode: any;
  private readonly _blackTexture: THREE.DataTexture;
  private _interactivityTrailTexture: THREE.Texture | null = null;
  private _interactivityDisplacementTexture: THREE.Texture | null = null;

  // Font atlas — rebuilt when charset, fontWeight, or cellSize changes.
  private _atlasTexture: THREE.CanvasTexture | null = null;

  // Track current settings to detect changes that require atlas rebuild.
  private _currentCharset     = "light";
  private _currentCustomChars = " .:-=+*#%@";
  private _currentFontWeight: FontWeight = "regular";
  private _currentCellSize    = 16;

  // Bloom sub-pass (optional, per-shader enhancement).
  private readonly _bloom: BloomSubPass;
  private _bloomEnabled = false;

  constructor(layerId: string) {
    super(layerId);

    // Guard: super() already called _buildEffectNode() once, but the guard
    // returned the passthrough _inputNode because these uniforms didn't exist
    // yet. Initialise them now, then rebuild the real effect.
    this._cellSizeU  = uniform(16.0);
    this._numCharsU  = uniform(CHARSETS["light"].length);  // plain number, not a TSL node
    this._colorModeU = uniform(1.0);  // 1=monochrome (white glyphs on black bg)
    this._bgOpacityU = uniform(1.0);
    this._invertU    = uniform(0.0);
    this._interactionModeU = uniform(0.0);
    this._interactionAmountU = uniform(0.5);

    // Build atlas sized to match the default cellSize — 1:1 pixel mapping.
    this._atlasTexture = buildAsciiAtlas(CHARSETS["light"], "regular", 16);
    this._blackTexture = new THREE.DataTexture(
      new Uint8Array([0, 0, 0, 255]),
      1,
      1,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    );
    this._blackTexture.needsUpdate = true;
    this._blackTexture.minFilter = THREE.LinearFilter;
    this._blackTexture.magFilter = THREE.LinearFilter;

    this._effectNode = this._buildEffectNode();
    this._rebuildColorNode();
    this._material.needsUpdate = true;

    // Bloom starts at 1×1; PipelineManager will call resize() with the real size.
    this._bloom = new BloomSubPass(1, 1);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  override render(
    renderer: THREE.WebGPURenderer,
    inputTex: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number,
  ): void {
    if (this._inputSampledNode) this._inputSampledNode.value = inputTex;
    if (this._atlasSampledNode && this._atlasTexture) {
      this._atlasSampledNode.value = this._atlasTexture;
    }
    if (this._interactionTrailNode) {
      this._interactionTrailNode.value =
        this._interactivityTrailTexture ?? this._blackTexture;
    }
    if (this._interactionDisplacementNode) {
      this._interactionDisplacementNode.value =
        this._interactivityDisplacementTexture ?? this._blackTexture;
    }
    // Render main ASCII effect into outputTarget.
    super.render(renderer, inputTex, outputTarget, time, delta);

    // If bloom is enabled, apply it on top of the ASCII output.
    // process() reads outputTarget.texture, writes composited result back.
    if (this._bloomEnabled) {
      this._bloom.process(renderer, outputTarget.texture, outputTarget);
    }
  }

  override resize(width: number, height: number): void {
    this._bloom.resize(width, height);
  }

  setInteractivityTextures(
    trailTexture: THREE.Texture | null,
    displacementTexture: THREE.Texture | null,
  ): void {
    this._interactivityTrailTexture = trailTexture;
    this._interactivityDisplacementTexture = displacementTexture;
  }

  // ── Effect node ────────────────────────────────────────────────────────────

  protected override _buildEffectNode(): /* TSL Node */ any { // eslint-disable-line @typescript-eslint/no-explicit-any
    // Guard: called once by super() before uniforms are initialised.
    if (!this._cellSizeU) return this._inputNode;

    // Y-flipped UV — WebGPU render-target textures have V=0 at the top.
    const rtUV = vec2(uv().x, float(1.0).sub(uv().y));

    // Normalised cell size (UV fraction per cell on each axis).
    const normalizedCellSize = vec2(this._cellSizeU, this._cellSizeU).div(screenSize);

    // ── Cell-center UV ────────────────────────────────────────────────────────
    // Floor UV to cell index, shift to cell centre, convert back to UV.
    const cellCenterUV = floor(rtUV.div(normalizedCellSize))
      .add(vec2(0.5, 0.5))
      .mul(normalizedCellSize);

    // ── Fractional position within the current cell (0..1 on each axis) ──────
    const cellUV = fract(rtUV.div(normalizedCellSize));

    // ── Sample input at cell center ───────────────────────────────────────────
    this._inputSampledNode = tslTexture(this._inputNode.value, cellCenterUV);
    const sampledColor = this._inputSampledNode;

    // ── Luminance (Rec. 709) ──────────────────────────────────────────────────
    const luma = float(sampledColor.r).mul(float(0.2126))
      .add(float(sampledColor.g).mul(float(0.7152)))
      .add(float(sampledColor.b).mul(float(0.0722)));

    // ── Invert ────────────────────────────────────────────────────────────────
    const adjustedLuma = select(
      this._invertU.greaterThan(float(0.5)),
      float(1.0).sub(luma),
      luma,
    );
    this._interactionTrailNode = tslTexture(this._blackTexture, rtUV);
    this._interactionDisplacementNode = tslTexture(this._blackTexture, rtUV);
    const trailLuma = clamp(
      float(this._interactionTrailNode.r).mul(float(0.2126))
        .add(float(this._interactionTrailNode.g).mul(float(0.7152)))
        .add(float(this._interactionTrailNode.b).mul(float(0.0722))),
      float(0.0),
      float(1.0),
    );
    const displacementMagnitude = clamp(
      length(
        vec2(
          float(this._interactionDisplacementNode.r),
          float(this._interactionDisplacementNode.g),
        ),
      ).mul(float(8.0)),
      float(0.0),
      float(1.0),
    );
    const interactionSignal = float(select(
      this._interactionModeU.lessThan(float(1.5)),
      trailLuma,
      displacementMagnitude,
    ));
    const interactionOffset = float(select(
      this._interactionModeU.lessThan(float(0.5)),
      float(0.0),
      interactionSignal.mul(this._interactionAmountU),
    ));
    const interactionLuma = clamp(
      adjustedLuma.add(interactionOffset),
      float(0.0),
      float(1.0),
    );

    // ── Character index ───────────────────────────────────────────────────────
    // luma 0 → char[0] (space, lightest), luma 1 → char[last] (densest).
    const charIndex = floor(
      clamp(
        interactionLuma.mul(this._numCharsU.sub(float(1.0))),
        float(0.0),
        this._numCharsU.sub(float(1.0)),
      ),
    );

    // ── Font atlas UV ─────────────────────────────────────────────────────────
    // x: which character column; y: vertical position within the glyph.
    // CanvasTexture with flipY=true (default): atlasUV.y=0 → top of canvas glyph.
    const atlasUV = vec2(
      float(charIndex).add(float(cellUV.x)).div(this._numCharsU),
      float(cellUV.y),
    );

    // ── Sample font atlas ─────────────────────────────────────────────────────
    // _atlasSampledNode.value is refreshed each frame in render().
    this._atlasSampledNode = tslTexture(
      this._atlasTexture ?? new THREE.Texture(),
      atlasUV,
    );
    // Red channel carries the glyph mask (1 = inside glyph, 0 = background).
    const characterMask = float(this._atlasSampledNode.r);

    // ── Glyph colour per color mode ───────────────────────────────────────────
    const srcColor   = vec3(float(sampledColor.r), float(sampledColor.g), float(sampledColor.b));
    const monoColor  = vec3(interactionLuma, interactionLuma, interactionLuma);
    const greenColor = vec3(float(0.0), interactionLuma, float(0.0));

    const dotColor = select(
      this._colorModeU.lessThan(float(0.5)),
      srcColor,
      select(
        this._colorModeU.lessThan(float(1.5)),
        monoColor,
        greenColor,
      ),
    );

    // ── Background colour per color mode ──────────────────────────────────────
    // source: source color blended by bgOpacity (0 = black bg, 1 = full source bg)
    // mono / green-terminal: always black
    const sourceBg = srcColor.mul(this._bgOpacityU);
    const bgColor = select(
      this._colorModeU.lessThan(float(0.5)),
      sourceBg,
      vec3(float(0.0), float(0.0), float(0.0)),
    );

    return vec4(mix(bgColor, dotColor, characterMask), float(1.0));
  }

  // ── Uniforms ───────────────────────────────────────────────────────────────

  override updateUniforms(params: ShaderParam[]): void {
    let needsAtlasRebuild = false;
    let charsetChanged    = false;

    for (const p of params) {
      switch (p.key) {
        case "cellSize": {
          const val = typeof p.value === "number" ? p.value : 8;
          this._cellSizeU.value = val;
          // Rebuild atlas when cell size changes so atlas px = screen cell px (1:1 mapping).
          if (Math.round(val) !== this._currentCellSize) {
            this._currentCellSize = Math.round(val);
            needsAtlasRebuild = true;
          }
          break;
        }

        case "charset": {
          const val = p.value as string;
          if (val !== this._currentCharset) {
            this._currentCharset = val;
            charsetChanged    = true;
            needsAtlasRebuild = true;
          }
          break;
        }

        case "customChars": {
          const val = (p.value as string) || " .:-=+*#%@";
          if (val !== this._currentCustomChars) {
            this._currentCustomChars = val;
            if (this._currentCharset === "custom") {
              charsetChanged    = true;
              needsAtlasRebuild = true;
            }
          }
          break;
        }

        case "colorMode": {
          const modeMap: Record<string, number> = {
            source: 0, monochrome: 1, "green-terminal": 2,
          };
          this._colorModeU.value = modeMap[p.value as string] ?? 0;
          break;
        }

        case "bgOpacity":
          this._bgOpacityU.value = typeof p.value === "number" ? p.value : 1;
          break;

        case "fontWeight": {
          const fw = (p.value as string) as FontWeight;
          if (fw !== this._currentFontWeight) {
            this._currentFontWeight = fw;
            needsAtlasRebuild = true;
          }
          break;
        }

        case "invert":
          this._invertU.value = p.value === true ? 1.0 : 0.0;
          break;
        case "interactionInput": {
          const map: Record<string, number> = {
            none: 0,
            trail: 1,
            displacement: 2,
          };
          this._interactionModeU.value = map[p.value as string] ?? 0;
          break;
        }
        case "interactionAmount":
          this._interactionAmountU.value =
            typeof p.value === "number" ? Math.max(0, p.value) : 0.5;
          break;

        // ── Bloom params ──────────────────────────────────────────────────
        case "bloomEnabled":
          this._bloomEnabled = p.value === true;
          break;
        case "bloomThreshold":
          this._bloom.setThreshold(typeof p.value === "number" ? p.value : 0.7);
          break;
        case "bloomSoftKnee":
          this._bloom.setSoftKnee(typeof p.value === "number" ? p.value : 0.5);
          break;
        case "bloomIntensity":
          this._bloom.setIntensity(typeof p.value === "number" ? p.value : 1.0);
          break;
        case "bloomRadius":
          this._bloom.setRadius(typeof p.value === "number" ? p.value : 5.0);
          break;
        case "bloomBlendWithSource":
          this._bloom.setBlendWithSource(p.value === true);
          break;
      }
    }

    if (needsAtlasRebuild) {
      this._rebuildAtlas(charsetChanged);
    }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _rebuildAtlas(charsetChanged: boolean): void {
    const chars =
      this._currentCharset === "custom"
        ? this._currentCustomChars || " .:-=+*#%@"
        : (CHARSETS[this._currentCharset] ?? CHARSETS["light"]);

    this._atlasTexture?.dispose();
    this._atlasTexture = buildAsciiAtlas(chars, this._currentFontWeight, this._currentCellSize);

    // Swap the live texture reference — takes effect on the next render() call.
    if (this._atlasSampledNode) {
      this._atlasSampledNode.value = this._atlasTexture;
    }

    // Update char count only when the character set actually changed.
    if (charsetChanged) {
      this._numCharsU.value = chars.length;
    }
  }

  override dispose(): void {
    this._atlasTexture?.dispose();
    this._blackTexture.dispose();
    this._bloom.dispose();
    super.dispose();
  }
}

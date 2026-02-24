import * as THREE from "three/webgpu";
import { vec2, vec4, float, uv, texture as tslTexture } from "three/tsl";
import { PassNode } from "@/lib/renderer/PassNode";
import {
  isHdriPreset,
  loadEnvironmentPreset,
  parseEnvironmentPreset,
  type EnvironmentPresetId,
} from "@/lib/renderer/environmentPresets";
import type { ShaderParam } from "@/types";

const SHAPE_RT_OPTIONS = {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  type: THREE.UnsignedByteType,
  format: THREE.RGBAFormat,
  depthBuffer: true,
  stencilBuffer: false,
  generateMipmaps: false,
} as const;

type ShapeKind = "sphere" | "cube" | "torus" | "prism";
type MaterialKind = "matte" | "metal" | "neon" | "clay";
type AnimKind = "none" | "rotate" | "float" | "rotate-float";

export class Shapes3DPass extends PassNode {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _shapeTexNode: any;

  private readonly _placeholder: THREE.Texture;
  private readonly _shapeTarget: THREE.WebGLRenderTarget;
  private readonly _shapeScene: THREE.Scene;
  private readonly _shapeCamera: THREE.PerspectiveCamera;
  private readonly _pivot: THREE.Group;

  private readonly _hemiLight: THREE.HemisphereLight;
  private readonly _keyLight: THREE.DirectionalLight;
  private readonly _rimLight: THREE.DirectionalLight;

  private readonly _ground: THREE.Mesh;
  private readonly _groundMaterial: THREE.MeshStandardMaterial;

  private _mesh: THREE.Mesh | null = null;
  private _shapeMaterial: THREE.MeshStandardMaterial;

  private _shape: ShapeKind = "sphere";
  private _materialKind: MaterialKind = "matte";
  private _animation: AnimKind = "none";

  private _size: [number, number, number] = [0.36, 0.28, 0.24];
  private _radius = 0.38;
  private _thickness = 0.1;
  private _roundness = 0.05;
  private _baseRotation = 0;
  private _intensity = 0.9;
  private _ambient = 0.18;

  private _cameraYaw = 0;
  private _cameraPitch = 0.15;
  private _cameraDistance = 2.8;
  private _autoOrbit = false;
  private _orbitSpeed = 0.3;

  private _speed = 0.55;
  private _shapeColor = new THREE.Color("#ff6a1f");
  private _backgroundColor = new THREE.Color("#0b0e10");
  private _environment: EnvironmentPresetId = "studio";
  private _environmentStrength = 1;
  private _showEnvironmentBackground = true;
  private _environmentBlur = 0;
  private _environmentBackgroundIntensity = 1;
  private _environmentTexture: THREE.Texture | null = null;
  private _environmentLoading = false;
  private _environmentLoadToken = 0;
  private _refreshFrames = 0;

  constructor(layerId: string) {
    super(layerId);

    this._placeholder = new THREE.Texture();
    this._shapeTarget = new THREE.WebGLRenderTarget(1, 1, SHAPE_RT_OPTIONS);
    this._shapeTarget.samples = 4;

    this._shapeScene = new THREE.Scene();
    this._shapeScene.background = this._backgroundColor.clone();

    this._shapeCamera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
    this._pivot = new THREE.Group();
    this._shapeScene.add(this._pivot);

    this._hemiLight = new THREE.HemisphereLight(0xffffff, 0x0e1013, 0.85);
    this._shapeScene.add(this._hemiLight);

    this._keyLight = new THREE.DirectionalLight(0xfff3e5, 0.85);
    this._keyLight.position.set(3.2, 3.8, 2.4);
    this._shapeScene.add(this._keyLight);

    this._rimLight = new THREE.DirectionalLight(0xc7d8ff, 0.35);
    this._rimLight.position.set(-2.4, 1.8, -2.8);
    this._shapeScene.add(this._rimLight);

    this._shapeMaterial = new THREE.MeshStandardMaterial({
      color: this._shapeColor.clone(),
      roughness: 0.58,
      metalness: 0.08,
      envMapIntensity: 1.0,
    });

    this._groundMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#111317"),
      roughness: 0.92,
      metalness: 0.0,
      envMapIntensity: 0.35,
    });
    this._ground = new THREE.Mesh(new THREE.CircleGeometry(6, 72), this._groundMaterial);
    this._ground.rotation.x = -Math.PI / 2;
    this._ground.position.y = -0.68;
    this._shapeScene.add(this._ground);

    this._buildMesh();
    this._applyMaterialPreset();
    this._updateCamera();
    this._requestEnvironment();

    this._effectNode = this._buildEffectNode();
    this._rebuildColorNode();
    this._shapeMaterial.needsUpdate = true;
  }

  override render(
    renderer: THREE.WebGPURenderer,
    inputTex: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number,
  ): void {
    const animTime = time * this._speed;
    const rotateOn = this._animation === "rotate" || this._animation === "rotate-float";
    const floatOn = this._animation === "float" || this._animation === "rotate-float";

    if (this._mesh) {
      this._mesh.rotation.set(0, 0, 0);
      this._mesh.position.set(0, 0, 0);

      this._mesh.rotation.y = rotateOn ? this._baseRotation + animTime : this._baseRotation;
      if (floatOn) this._mesh.position.y = Math.sin(animTime * 1.55) * 0.14;
    }

    if (this._autoOrbit) {
      this._updateCamera(this._cameraYaw + time * this._orbitSpeed);
    } else {
      this._updateCamera();
    }

    renderer.setRenderTarget(this._shapeTarget);
    renderer.render(this._shapeScene, this._shapeCamera);
    if (this._shapeTexNode) this._shapeTexNode.value = this._shapeTarget.texture;

    if (this._refreshFrames > 0) this._refreshFrames--;

    super.render(renderer, inputTex, outputTarget, time, delta);
  }

  override resize(width: number, height: number): void {
    const w = Math.max(width, 1);
    const h = Math.max(height, 1);
    this._shapeTarget.setSize(w, h);
    this._shapeCamera.aspect = w / h;
    this._shapeCamera.updateProjectionMatrix();
  }

  override needsContinuousRender(): boolean {
    const hasAnim = this._animation !== "none" && Math.abs(this._speed) > 1e-6;
    const hasOrbit = this._autoOrbit && Math.abs(this._orbitSpeed) > 1e-6;
    return hasAnim || hasOrbit || this._environmentLoading || this._refreshFrames > 0;
  }

  override updateUniforms(params: ShaderParam[]): void {
    let shapeDirty = false;
    let materialDirty = false;
    let cameraDirty = false;
    let environmentDirty = false;

    for (const p of params) {
      switch (p.key) {
        case "shape": {
          const value = (p.value as ShapeKind) ?? "sphere";
          if (value !== this._shape) {
            this._shape = value;
            shapeDirty = true;
          }
          break;
        }
        case "material": {
          const value = (p.value as MaterialKind) ?? "matte";
          if (value !== this._materialKind) {
            this._materialKind = value;
            materialDirty = true;
          }
          break;
        }
        case "animation":
          this._animation = ((p.value as AnimKind) ?? "none");
          break;
        case "size": {
          const [x, y, z] = Array.isArray(p.value) ? (p.value as number[]) : this._size;
          const nx = Number.isFinite(x) ? x : this._size[0];
          const ny = Number.isFinite(y) ? y : this._size[1];
          const nz = Number.isFinite(z) ? z : this._size[2];
          if (nx !== this._size[0] || ny !== this._size[1] || nz !== this._size[2]) {
            this._size = [nx, ny, nz];
            shapeDirty = true;
          }
          break;
        }
        case "radius": {
          const value = typeof p.value === "number" ? p.value : this._radius;
          if (value !== this._radius) {
            this._radius = value;
            shapeDirty = true;
          }
          break;
        }
        case "thickness": {
          const value = typeof p.value === "number" ? p.value : this._thickness;
          if (value !== this._thickness) {
            this._thickness = value;
            shapeDirty = true;
          }
          break;
        }
        case "roundness": {
          const value = typeof p.value === "number" ? p.value : this._roundness;
          if (value !== this._roundness) {
            this._roundness = value;
            shapeDirty = true;
          }
          break;
        }
        case "rotation":
          this._baseRotation = typeof p.value === "number" ? p.value : this._baseRotation;
          break;
        case "intensity": {
          const value = typeof p.value === "number" ? p.value : this._intensity;
          if (value !== this._intensity) {
            this._intensity = value;
            materialDirty = true;
          }
          break;
        }
        case "ambient": {
          const value = typeof p.value === "number" ? p.value : this._ambient;
          if (value !== this._ambient) {
            this._ambient = value;
            materialDirty = true;
          }
          break;
        }
        case "cameraYaw": {
          const value = typeof p.value === "number" ? p.value : this._cameraYaw;
          if (value !== this._cameraYaw) {
            this._cameraYaw = value;
            cameraDirty = true;
          }
          break;
        }
        case "cameraPitch": {
          const value = typeof p.value === "number" ? p.value : this._cameraPitch;
          if (value !== this._cameraPitch) {
            this._cameraPitch = value;
            cameraDirty = true;
          }
          break;
        }
        case "cameraDistance": {
          const value = typeof p.value === "number" ? p.value : this._cameraDistance;
          if (value !== this._cameraDistance) {
            this._cameraDistance = value;
            cameraDirty = true;
          }
          break;
        }
        case "autoOrbit":
          this._autoOrbit = p.value === true;
          break;
        case "orbitSpeed":
          this._orbitSpeed = typeof p.value === "number" ? p.value : this._orbitSpeed;
          break;
        case "speed":
          this._speed = typeof p.value === "number" ? p.value : this._speed;
          break;
        case "color": {
          const next = parseCSSColor(String(p.value ?? "#ff6a1f"), this._shapeColor);
          if (!next.equals(this._shapeColor)) {
            this._shapeColor.copy(next);
            materialDirty = true;
          }
          break;
        }
        case "background": {
          const next = parseCSSColor(String(p.value ?? "#0b0e10"), this._backgroundColor);
          if (!next.equals(this._backgroundColor)) {
            this._backgroundColor.copy(next);
            if (!isHdriPreset(this._environment)) environmentDirty = true;
          }
          break;
        }
        case "environment": {
          const value = parseEnvironmentPreset(p.value);
          if (value !== this._environment) {
            this._environment = value;
            environmentDirty = true;
          }
          break;
        }
        case "environmentStrength": {
          const value = typeof p.value === "number" ? p.value : this._environmentStrength;
          if (value !== this._environmentStrength) {
            this._environmentStrength = value;
            environmentDirty = true;
          }
          break;
        }
        case "showEnvironmentBackground": {
          const value = p.value === true;
          if (value !== this._showEnvironmentBackground) {
            this._showEnvironmentBackground = value;
            environmentDirty = true;
          }
          break;
        }
        case "environmentBlur": {
          const value = typeof p.value === "number" ? p.value : this._environmentBlur;
          if (value !== this._environmentBlur) {
            this._environmentBlur = value;
            environmentDirty = true;
          }
          break;
        }
        case "environmentBackgroundIntensity": {
          const value =
            typeof p.value === "number" ? p.value : this._environmentBackgroundIntensity;
          if (value !== this._environmentBackgroundIntensity) {
            this._environmentBackgroundIntensity = value;
            environmentDirty = true;
          }
          break;
        }
      }
    }

    if (shapeDirty) this._buildMesh();
    if (materialDirty) this._applyMaterialPreset();
    if (cameraDirty) this._updateCamera();
    if (environmentDirty || materialDirty) this._requestEnvironment();
  }

  override dispose(): void {
    this._environmentLoadToken++;

    if (this._mesh) {
      this._mesh.geometry.dispose();
      this._pivot.remove(this._mesh);
      this._mesh = null;
    }

    this._ground.geometry.dispose();
    this._groundMaterial.dispose();
    this._shapeMaterial.dispose();

    this._shapeTarget.dispose();
    this._placeholder.dispose();
    super.dispose();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected override _buildEffectNode(): any {
    if (!this._placeholder) return this._inputNode;
    const rtUV = vec2(uv().x, float(1.0).sub(uv().y));
    this._shapeTexNode = tslTexture(this._placeholder, rtUV);
    return vec4(this._shapeTexNode.rgb, float(1.0));
  }

  private _buildMesh(): void {
    if (this._mesh) {
      this._mesh.geometry.dispose();
      this._pivot.remove(this._mesh);
      this._mesh = null;
    }

    const sx = Math.max(this._size[0], 0.01);
    const sy = Math.max(this._size[1], 0.01);
    const sz = Math.max(this._size[2], 0.01);
    const radius = Math.max(this._radius, 0.01);
    const thickness = Math.max(this._thickness, 0.01);

    let geometry: THREE.BufferGeometry;
    switch (this._shape) {
      case "cube":
        geometry = new THREE.BoxGeometry(sx * 2.25, sy * 2.25, sz * 2.25, 2, 2, 2);
        break;
      case "torus": {
        const major = Math.max(radius, 0.08);
        const minor = Math.min(Math.max(thickness, 0.01), major * 0.95);
        geometry = new THREE.TorusGeometry(major, minor, 36, 96);
        break;
      }
      case "prism": {
        const prismRadius = Math.max(radius, 0.06);
        geometry = new THREE.CylinderGeometry(prismRadius, prismRadius, sz * 3.2, 3, 1, false);
        break;
      }
      case "sphere":
      default:
        geometry = new THREE.SphereGeometry(radius, 64, 48);
        break;
    }

    this._mesh = new THREE.Mesh(geometry, this._shapeMaterial);

    if (this._shape === "cube" || this._shape === "prism") {
      const soften = 1 - Math.min(Math.max(this._roundness, 0), 0.35) * 0.2;
      this._mesh.scale.setScalar(soften);
    }

    this._pivot.add(this._mesh);
  }

  private _applyMaterialPreset(): void {
    const intensity = Math.max(this._intensity, 0);

    this._shapeMaterial.color.copy(this._shapeColor).multiplyScalar(0.62 + intensity * 0.38);
    this._shapeMaterial.emissive.set(0x000000);
    this._shapeMaterial.emissiveIntensity = 0;

    switch (this._materialKind) {
      case "metal":
        this._shapeMaterial.roughness = 0.18;
        this._shapeMaterial.metalness = 1.0;
        break;
      case "neon":
        this._shapeMaterial.roughness = 0.32;
        this._shapeMaterial.metalness = 0.08;
        this._shapeMaterial.emissive.copy(this._shapeColor).multiplyScalar(0.35 + intensity * 0.65);
        this._shapeMaterial.emissiveIntensity = 1.1;
        break;
      case "clay":
        this._shapeMaterial.roughness = 0.9;
        this._shapeMaterial.metalness = 0.0;
        break;
      case "matte":
      default:
        this._shapeMaterial.roughness = 0.62;
        this._shapeMaterial.metalness = 0.08;
        break;
    }

    this._shapeMaterial.needsUpdate = true;
  }

  private _updateCamera(orbitYaw?: number): void {
    const yaw = orbitYaw ?? this._cameraYaw;
    const pitch = this._cameraPitch;
    const distance = Math.max(this._cameraDistance, 0.5);

    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);

    const x = distance * sy * cp;
    const y = distance * sp;
    const z = distance * cy * cp;

    this._shapeCamera.position.set(x, y, z);
    this._shapeCamera.lookAt(0, 0, 0);
    this._shapeCamera.updateProjectionMatrix();
  }

  private _requestEnvironment(): void {
    const token = ++this._environmentLoadToken;

    if (!isHdriPreset(this._environment)) {
      this._environmentTexture = null;
      this._environmentLoading = false;
      this._applyEnvironment();
      this._refreshFrames = Math.max(this._refreshFrames, 2);
      return;
    }

    this._environmentLoading = true;
    loadEnvironmentPreset(this._environment)
      .then((texture) => {
        if (token !== this._environmentLoadToken) return;
        this._environmentTexture = texture;
        this._environmentLoading = false;
        this._applyEnvironment();
        this._refreshFrames = Math.max(this._refreshFrames, 4);
      })
      .catch(() => {
        if (token !== this._environmentLoadToken) return;
        this._environmentTexture = null;
        this._environmentLoading = false;
        this._applyEnvironment();
        this._refreshFrames = Math.max(this._refreshFrames, 2);
      });
  }

  private _applyEnvironment(): void {
    const envStrength = Math.max(this._environmentStrength, 0);
    const intensity = Math.max(this._intensity, 0);
    const ambient = Math.max(this._ambient, 0);
    const hasHdri = isHdriPreset(this._environment) && this._environmentTexture !== null;

    if (hasHdri && this._environmentTexture) {
      this._shapeScene.environment = this._environmentTexture;
      this._shapeScene.background = this._showEnvironmentBackground
        ? this._environmentTexture
        : this._backgroundColor.clone();
      // Scene-level env controls (same conceptual controls as drei Environment).
      this._shapeScene.backgroundBlurriness = this._showEnvironmentBackground
        ? Math.max(0, Math.min(1, this._environmentBlur))
        : 0;
      this._shapeScene.backgroundIntensity = this._showEnvironmentBackground
        ? Math.max(0, this._environmentBackgroundIntensity)
        : 1;
      this._shapeMaterial.envMapIntensity = 0.6 + envStrength * 1.3;
      this._groundMaterial.envMapIntensity = 0.22 + envStrength * 0.36;

      this._hemiLight.intensity = (0.25 + ambient * 0.45) * envStrength;
      this._keyLight.intensity = (0.18 + intensity * 0.35) * envStrength;
      this._rimLight.intensity = (0.12 + intensity * 0.22) * envStrength;
    } else {
      this._shapeScene.environment = null;
      this._shapeScene.background = this._backgroundColor.clone();
      this._shapeScene.backgroundBlurriness = 0;
      this._shapeScene.backgroundIntensity = 1;
      this._shapeMaterial.envMapIntensity = 0;
      this._groundMaterial.envMapIntensity = 0;

      this._hemiLight.intensity = (0.65 + ambient * 1.15) * Math.max(envStrength, 0.25);
      this._keyLight.intensity = (0.55 + intensity * 0.9) * Math.max(envStrength, 0.25);
      this._rimLight.intensity = (0.2 + intensity * 0.45) * Math.max(envStrength, 0.25);
    }

    this._shapeMaterial.needsUpdate = true;
    this._groundMaterial.needsUpdate = true;
  }
}

function parseCSSColor(value: string, fallback: THREE.Color): THREE.Color {
  try {
    const next = new THREE.Color();
    next.set(value);
    return next;
  } catch {
    return fallback.clone();
  }
}

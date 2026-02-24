import * as THREE from "three/webgpu";
import { vec2, vec4, float, uv, texture as tslTexture } from "three/tsl";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { PassNode } from "./PassNode";
import {
  isHdriPreset,
  loadEnvironmentPreset,
  parseEnvironmentPreset,
  type EnvironmentPresetId,
} from "./environmentPresets";
import type { ShaderParam } from "@/types";

const MODEL_RT_OPTIONS = {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  type: THREE.UnsignedByteType,
  format: THREE.RGBAFormat,
  depthBuffer: true,
  stencilBuffer: false,
  generateMipmaps: false,
} as const;

function inferModelFormat(nameOrUrl?: string): "gltf" | "obj" | null {
  if (!nameOrUrl) return null;
  const value = nameOrUrl.toLowerCase();
  if (value.endsWith(".glb") || value.endsWith(".gltf")) return "gltf";
  if (value.endsWith(".obj")) return "obj";
  return null;
}

function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    mesh.geometry?.dispose?.();

    const mat = mesh.material;
    if (Array.isArray(mat)) {
      for (const m of mat) m.dispose?.();
    } else {
      mat?.dispose?.();
    }
  });
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

export class ModelPass extends PassNode {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _modelTexNode: any;

  private readonly _placeholder: THREE.Texture;
  private readonly _modelTarget: THREE.WebGLRenderTarget;
  private readonly _modelScene: THREE.Scene;
  private readonly _modelCamera: THREE.PerspectiveCamera;
  private readonly _pivot: THREE.Group;

  private readonly _hemiLight: THREE.HemisphereLight;
  private readonly _keyLight: THREE.DirectionalLight;
  private readonly _rimLight: THREE.DirectionalLight;

  private _modelRoot: THREE.Object3D | null = null;
  private _mixer: THREE.AnimationMixer | null = null;
  private _hasEmbeddedAnimations = false;
  private _needsContinuous = false;
  private _loadVersion = 0;

  private _environment: EnvironmentPresetId = "studio";
  private _environmentStrength = 1;
  private _showEnvironmentBackground = true;
  private _environmentBlur = 0;
  private _environmentBackgroundIntensity = 1;
  private _backgroundColor = new THREE.Color("#0b0e10");
  private _environmentTexture: THREE.Texture | null = null;
  private _environmentLoading = false;
  private _environmentLoadToken = 0;
  private _refreshFrames = 0;

  private _cameraYaw = 0;
  private _cameraPitch = 0.1;
  private _cameraDistanceMultiplier = 1;
  private _fitDistance = 2.6;

  private _playEmbeddedAnimation = true;
  private _autoRotate = false;
  private _autoRotateSpeed = 0.6;

  private _modelScale = 1;
  private _modelOffset = new THREE.Vector3();
  private _modelRotation = new THREE.Vector3();

  constructor(layerId: string) {
    super(layerId);

    this._placeholder = new THREE.Texture();
    this._modelTarget = new THREE.WebGLRenderTarget(1, 1, MODEL_RT_OPTIONS);
    this._modelTarget.samples = 4;

    this._modelScene = new THREE.Scene();
    this._modelScene.background = this._backgroundColor.clone();

    this._modelCamera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
    this._modelCamera.position.set(0.85, 0.6, 2.6);
    this._modelCamera.lookAt(0, 0, 0);

    this._hemiLight = new THREE.HemisphereLight(0xffffff, 0x0f1112, 0.85);
    this._modelScene.add(this._hemiLight);
    this._keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
    this._keyLight.position.set(2.5, 3, 2);
    this._modelScene.add(this._keyLight);
    this._rimLight = new THREE.DirectionalLight(0xbcc7d6, 0.35);
    this._rimLight.position.set(-2, 1, -2);
    this._modelScene.add(this._rimLight);

    this._pivot = new THREE.Group();
    this._modelScene.add(this._pivot);

    this._requestEnvironment();
    this._updateCamera();

    this._effectNode = this._buildEffectNode();
    this._rebuildColorNode();
    this._material.needsUpdate = true;
  }

  async setModel(url: string, fileName?: string): Promise<void> {
    const version = ++this._loadVersion;
    this._releaseModel();

    const formatHint = inferModelFormat(fileName) ?? inferModelFormat(url);
    const objLoader = new OBJLoader();
    const gltfLoader = new GLTFLoader();

    let root: THREE.Object3D | null = null;
    let animations: THREE.AnimationClip[] = [];

    const tryLoadGltf = async () => {
      const gltf = await gltfLoader.loadAsync(url);
      const scene = gltf.scene ?? gltf.scenes?.[0];
      if (!scene) throw new Error("GLTF has no scene.");
      return { root: scene as THREE.Object3D, animations: gltf.animations ?? [] };
    };

    if (formatHint === "obj") {
      root = await objLoader.loadAsync(url);
    } else if (formatHint === "gltf") {
      const loaded = await tryLoadGltf();
      root = loaded.root;
      animations = loaded.animations;
    } else {
      try {
        const loaded = await tryLoadGltf();
        root = loaded.root;
        animations = loaded.animations;
      } catch {
        root = await objLoader.loadAsync(url);
      }
    }

    if (version !== this._loadVersion) {
      if (root) disposeObject3D(root);
      return;
    }
    if (!root) throw new Error("Unsupported or empty 3D model.");

    this._fitModel(root);
    this._pivot.add(root);
    this._modelRoot = root;

    if (animations.length > 0) {
      const mixer = new THREE.AnimationMixer(root);
      for (const clip of animations) mixer.clipAction(clip).play();
      this._mixer = mixer;
      this._hasEmbeddedAnimations = true;
    } else {
      this._mixer = null;
      this._hasEmbeddedAnimations = false;
    }

    this._applyEnvironment();
    this._refreshContinuousState();
  }

  override render(
    renderer: THREE.WebGPURenderer,
    inputTex: THREE.Texture,
    outputTarget: THREE.WebGLRenderTarget,
    time: number,
    delta: number,
  ): void {
    if (this._mixer && this._playEmbeddedAnimation) {
      this._mixer.update(Math.max(delta, 0));
    }

    if (this._modelRoot) {
      const autoYaw = this._autoRotate ? time * this._autoRotateSpeed : 0;
      this._pivot.position.copy(this._modelOffset);
      this._pivot.rotation.set(
        this._modelRotation.x,
        this._modelRotation.y + autoYaw,
        this._modelRotation.z,
      );
      this._pivot.scale.setScalar(Math.max(this._modelScale, 0.01));

      this._updateCamera();

      renderer.setRenderTarget(this._modelTarget);
      renderer.render(this._modelScene, this._modelCamera);
      if (this._modelTexNode) this._modelTexNode.value = this._modelTarget.texture;
    }

    if (this._refreshFrames > 0) this._refreshFrames--;

    super.render(renderer, inputTex, outputTarget, time, delta);
  }

  override resize(width: number, height: number): void {
    const w = Math.max(width, 1);
    const h = Math.max(height, 1);
    this._modelTarget.setSize(w, h);
    this._modelCamera.aspect = w / h;
    this._modelCamera.updateProjectionMatrix();
  }

  override updateUniforms(params: ShaderParam[]): void {
    let environmentDirty = false;
    let cameraDirty = false;

    for (const p of params) {
      switch (p.key) {
        case "environment": {
          const raw = String(p.value ?? "studio");
          const value = parseEnvironmentPreset(raw);
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
        case "background": {
          const next = parseCSSColor(String(p.value ?? "#0b0e10"), this._backgroundColor);
          if (!next.equals(this._backgroundColor)) {
            this._backgroundColor.copy(next);
            if (!isHdriPreset(this._environment) || !this._showEnvironmentBackground) {
              environmentDirty = true;
            }
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
          const value = typeof p.value === "number" ? p.value : this._cameraDistanceMultiplier;
          if (value !== this._cameraDistanceMultiplier) {
            this._cameraDistanceMultiplier = value;
            cameraDirty = true;
          }
          break;
        }
        case "playAnimation":
          this._playEmbeddedAnimation = p.value !== false;
          break;
        case "autoRotate":
          this._autoRotate = p.value === true;
          break;
        case "autoRotateSpeed":
          this._autoRotateSpeed = typeof p.value === "number" ? p.value : this._autoRotateSpeed;
          break;
        case "modelScale":
          this._modelScale = typeof p.value === "number" ? p.value : this._modelScale;
          break;
        case "modelOffset": {
          const [x, y, z] = Array.isArray(p.value) ? (p.value as number[]) : [0, 0, 0];
          this._modelOffset.set(
            Number.isFinite(x) ? x : 0,
            Number.isFinite(y) ? y : 0,
            Number.isFinite(z) ? z : 0,
          );
          break;
        }
        case "modelRotation": {
          const [x, y, z] = Array.isArray(p.value) ? (p.value as number[]) : [0, 0, 0];
          this._modelRotation.set(
            Number.isFinite(x) ? x : 0,
            Number.isFinite(y) ? y : 0,
            Number.isFinite(z) ? z : 0,
          );
          break;
        }
      }
    }

    if (environmentDirty) this._requestEnvironment();
    if (cameraDirty) this._updateCamera();
    this._refreshContinuousState();
  }

  override needsContinuousRender(): boolean {
    return this._needsContinuous || this._environmentLoading || this._refreshFrames > 0;
  }

  override dispose(): void {
    this._environmentLoadToken++;
    this._releaseModel();
    this._modelTarget.dispose();
    this._placeholder.dispose();
    super.dispose();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected override _buildEffectNode(): any {
    if (!this._placeholder) return this._inputNode;
    const rtUV = vec2(uv().x, float(1.0).sub(uv().y));
    this._modelTexNode = tslTexture(this._placeholder, rtUV);
    return vec4(this._modelTexNode.rgb, float(1.0));
  }

  private _fitModel(root: THREE.Object3D): void {
    root.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(root);
    if (box.isEmpty()) {
      root.position.set(0, 0, 0);
      root.scale.setScalar(1);
      this._fitDistance = 2.6;
      return;
    }

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 1e-4);
    const targetExtent = 1.35;
    const scale = targetExtent / maxDim;

    root.position.sub(center);
    root.scale.multiplyScalar(scale);

    const radius = (maxDim * scale) * 0.5;
    const fovRad = (this._modelCamera.fov * Math.PI) / 180;
    this._fitDistance = (radius / Math.tan(fovRad * 0.5)) * 1.35;
  }

  private _updateCamera(): void {
    const yaw = this._cameraYaw;
    const pitch = this._cameraPitch;
    const distance = Math.max(this._fitDistance * this._cameraDistanceMultiplier, 0.3);

    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);

    const x = distance * sy * cp;
    const y = distance * sp;
    const z = distance * cy * cp;

    this._modelCamera.position.set(x, y, z);
    this._modelCamera.near = Math.max(distance * 0.02, 0.01);
    this._modelCamera.far = Math.max(distance * 8, 50);
    this._modelCamera.lookAt(0, 0, 0);
    this._modelCamera.updateProjectionMatrix();
  }

  private _applyEnvironment(): void {
    const strength = Math.max(this._environmentStrength, 0);
    const hasHdri = isHdriPreset(this._environment) && this._environmentTexture !== null;

    if (hasHdri && this._environmentTexture) {
      this._modelScene.environment = this._environmentTexture;
      this._modelScene.background = this._showEnvironmentBackground
        ? this._environmentTexture
        : this._backgroundColor.clone();
      this._modelScene.backgroundBlurriness = this._showEnvironmentBackground
        ? Math.max(0, Math.min(1, this._environmentBlur))
        : 0;
      this._modelScene.backgroundIntensity = this._showEnvironmentBackground
        ? Math.max(0, this._environmentBackgroundIntensity)
        : 1;

      this._hemiLight.intensity = 0.22 * strength;
      this._keyLight.intensity = 0.16 * strength;
      this._rimLight.intensity = 0.12 * strength;
      this._hemiLight.color.set("#ffffff");
      this._hemiLight.groundColor.set("#0e1013");
      this._keyLight.color.set("#fff8ed");
      this._rimLight.color.set("#c8d8ff");
    } else {
      this._modelScene.environment = null;
      this._modelScene.background = this._backgroundColor.clone();
      this._modelScene.backgroundBlurriness = 0;
      this._modelScene.backgroundIntensity = 1;

      this._hemiLight.intensity = 0.75 * Math.max(strength, 0.25);
      this._keyLight.intensity = 0.82 * Math.max(strength, 0.25);
      this._rimLight.intensity = 0.35 * Math.max(strength, 0.25);
      this._hemiLight.color.set("#ffffff");
      this._hemiLight.groundColor.set("#0f1114");
      this._keyLight.color.set("#fff6e5");
      this._rimLight.color.set("#c6d4ff");
    }

    this._applyModelMaterialOverrides();
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

  private _applyModelMaterialOverrides(): void {
    if (!this._modelRoot) return;
    const hasHdri = isHdriPreset(this._environment) && this._environmentTexture !== null;
    const envStrength = Math.max(this._environmentStrength, 0);
    const envMapIntensity = hasHdri ? 0.6 + envStrength * 1.25 : 0;

    this._modelRoot.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      const mat = mesh.material;

      const apply = (m: THREE.Material) => {
        const std = m as THREE.MeshStandardMaterial;
        if ("envMapIntensity" in std) {
          std.envMapIntensity = envMapIntensity;
          std.needsUpdate = true;
        }
      };

      if (Array.isArray(mat)) {
        for (const m of mat) apply(m);
      } else if (mat) {
        apply(mat);
      }
    });
  }

  private _refreshContinuousState(): void {
    const hasEmbeddedAnim = this._hasEmbeddedAnimations && this._playEmbeddedAnimation;
    const hasAutoRotate = this._autoRotate && Math.abs(this._autoRotateSpeed) > 1e-6;
    this._needsContinuous =
      hasEmbeddedAnim || hasAutoRotate || this._environmentLoading || this._refreshFrames > 0;
  }

  private _releaseModel(): void {
    if (this._mixer) this._mixer.stopAllAction();
    this._mixer = null;
    this._hasEmbeddedAnimations = false;
    this._needsContinuous = false;
    this._pivot.rotation.set(0, 0, 0);
    this._pivot.position.set(0, 0, 0);
    this._pivot.scale.set(1, 1, 1);

    if (this._modelRoot) {
      this._pivot.remove(this._modelRoot);
      disposeObject3D(this._modelRoot);
      this._modelRoot = null;
    }
  }
}

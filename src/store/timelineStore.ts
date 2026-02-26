import { v4 as uuidv4 } from "uuid";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { Layer, ShaderParam, ShaderParamType } from "@/types";

export type TimelineInterpolation = "linear" | "smooth" | "step";

export interface TimelineKeyframe {
  id: string;
  time: number;
  value: ShaderParam["value"];
}

export interface TimelineTrack {
  id: string;
  layerId: string;
  paramKey: string;
  paramLabel: string;
  paramType: ShaderParamType;
  enabled: boolean;
  interpolation: TimelineInterpolation;
  keyframes: TimelineKeyframe[];
}

interface TimelineState {
  isPlaying: boolean;
  loop: boolean;
  duration: number;
  currentTime: number;
  tracks: TimelineTrack[];
  selectedTrackId: string | null;
  selectedKeyframeId: string | null;
  panelOpen: boolean;
}

interface ToggleKeyframeInput {
  layerId: string;
  paramKey: string;
  paramLabel: string;
  paramType: ShaderParamType;
  value: ShaderParam["value"];
  time?: number;
}

interface UpsertKeyframeInput extends ToggleKeyframeInput {
  time?: number;
}

interface TimelineActions {
  setPanelOpen(open: boolean): void;
  setPlaying(playing: boolean): void;
  togglePlaying(): void;
  stop(): void;
  setLoop(loop: boolean): void;
  setDuration(duration: number): void;
  setCurrentTime(time: number): void;
  advance(delta: number): void;
  toggleKeyframe(input: ToggleKeyframeInput): void;
  upsertKeyframe(input: UpsertKeyframeInput): void;
  setTrackEnabled(trackId: string, enabled: boolean): void;
  setTrackInterpolation(
    trackId: string,
    interpolation: TimelineInterpolation,
  ): void;
  setSelected(trackId: string | null, keyframeId?: string | null): void;
  setKeyframeTime(trackId: string, keyframeId: string, time: number): void;
  removeKeyframe(trackId: string, keyframeId: string): void;
  clearLayerTracks(layerId: string): void;
  pruneTracks(layers: Layer[]): void;
}

type TimelineStore = TimelineState & TimelineActions;

const MIN_DURATION = 0.25;
const MAX_DURATION = 120;
const DEFAULT_DURATION = 4;
const TIME_EPSILON = 1 / 240;

function clampDuration(duration: number): number {
  if (!Number.isFinite(duration)) return DEFAULT_DURATION;
  return Math.max(MIN_DURATION, Math.min(MAX_DURATION, duration));
}

function clampTime(time: number, duration: number): number {
  if (!Number.isFinite(time)) return 0;
  return Math.max(0, Math.min(Math.max(duration, MIN_DURATION), time));
}

function cloneParamValue(value: ShaderParam["value"]): ShaderParam["value"] {
  return Array.isArray(value) ? [...value] : value;
}

function valuesEqual(
  a: ShaderParam["value"],
  b: ShaderParam["value"],
): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return a === b;
}

function sortKeyframes(keyframes: TimelineKeyframe[]): TimelineKeyframe[] {
  return [...keyframes].sort((a, b) => a.time - b.time);
}

function defaultInterpolationForType(
  paramType: ShaderParamType,
): TimelineInterpolation {
  if (paramType === "enum" || paramType === "bool") return "step";
  return "smooth";
}

function cleanupTrackAfterKeyframeMutation(
  state: TimelineState,
  trackIndex: number,
): void {
  const track = state.tracks[trackIndex];
  if (!track) return;
  track.keyframes = sortKeyframes(track.keyframes);
  if (track.keyframes.length > 0) return;

  const removedTrackId = track.id;
  state.tracks.splice(trackIndex, 1);
  if (state.selectedTrackId === removedTrackId) {
    state.selectedTrackId = null;
    state.selectedKeyframeId = null;
  }
}

export function isParamAnimatable(paramType: ShaderParamType): boolean {
  return (
    paramType === "float" ||
    paramType === "int" ||
    paramType === "vec2" ||
    paramType === "vec3" ||
    paramType === "color" ||
    paramType === "enum" ||
    paramType === "bool"
  );
}

export function hasKeyframeAtTime(
  track: TimelineTrack,
  time: number,
  epsilon = TIME_EPSILON,
): boolean {
  return track.keyframes.some((kf) => Math.abs(kf.time - time) <= epsilon);
}

export const useTimelineStore = create<TimelineStore>()(
  immer((set) => ({
    isPlaying: false,
    loop: true,
    duration: DEFAULT_DURATION,
    currentTime: 0,
    tracks: [],
    selectedTrackId: null,
    selectedKeyframeId: null,
    panelOpen: false,

    setPanelOpen(open) {
      set((state) => {
        state.panelOpen = open;
      });
    },

    setPlaying(playing) {
      set((state) => {
        state.isPlaying = playing;
      });
    },

    togglePlaying() {
      set((state) => {
        state.isPlaying = !state.isPlaying;
      });
    },

    stop() {
      set((state) => {
        state.isPlaying = false;
        state.currentTime = 0;
      });
    },

    setLoop(loop) {
      set((state) => {
        state.loop = loop;
      });
    },

    setDuration(duration) {
      set((state) => {
        const nextDuration = clampDuration(duration);
        state.duration = nextDuration;
        state.currentTime = clampTime(state.currentTime, nextDuration);
        for (const track of state.tracks) {
          track.keyframes = sortKeyframes(
            track.keyframes.map((kf) => ({
              ...kf,
              time: clampTime(kf.time, nextDuration),
            })),
          );
        }
      });
    },

    setCurrentTime(time) {
      set((state) => {
        state.currentTime = clampTime(time, state.duration);
      });
    },

    advance(delta) {
      if (!Number.isFinite(delta) || delta <= 0) return;

      set((state) => {
        if (!state.isPlaying) return;
        const duration = Math.max(state.duration, MIN_DURATION);
        const nextTime = state.currentTime + delta;

        if (state.loop) {
          state.currentTime = nextTime % duration;
          return;
        }

        if (nextTime >= duration) {
          state.currentTime = duration;
          state.isPlaying = false;
          return;
        }

        state.currentTime = nextTime;
      });
    },

    toggleKeyframe(input) {
      if (!isParamAnimatable(input.paramType)) return;

      set((state) => {
        const targetTime = clampTime(
          input.time ?? state.currentTime,
          state.duration,
        );
        let trackIndex = state.tracks.findIndex(
          (track) =>
            track.layerId === input.layerId &&
            track.paramKey === input.paramKey,
        );

        if (trackIndex < 0) {
          const track: TimelineTrack = {
            id: uuidv4(),
            layerId: input.layerId,
            paramKey: input.paramKey,
            paramLabel: input.paramLabel,
            paramType: input.paramType,
            enabled: true,
            interpolation: defaultInterpolationForType(input.paramType),
            keyframes: [],
          };
          state.tracks.push(track);
          trackIndex = state.tracks.length - 1;
        }

        const track = state.tracks[trackIndex];
        if (!track) return;
        const existingIndex = track.keyframes.findIndex(
          (kf) => Math.abs(kf.time - targetTime) <= TIME_EPSILON,
        );

        if (existingIndex >= 0) {
          const existingId = track.keyframes[existingIndex]?.id ?? null;
          track.keyframes.splice(existingIndex, 1);
          if (state.selectedKeyframeId === existingId) {
            state.selectedKeyframeId = null;
          }
          cleanupTrackAfterKeyframeMutation(state, trackIndex);
          return;
        }

        const keyframeId = uuidv4();
        track.enabled = true;
        track.keyframes.push({
          id: keyframeId,
          time: targetTime,
          value: cloneParamValue(input.value),
        });
        track.keyframes = sortKeyframes(track.keyframes);
        state.selectedTrackId = track.id;
        state.selectedKeyframeId = keyframeId;
      });
    },

    upsertKeyframe(input) {
      if (!isParamAnimatable(input.paramType)) return;

      set((state) => {
        const targetTime = clampTime(
          input.time ?? state.currentTime,
          state.duration,
        );
        let track = state.tracks.find(
          (item) =>
            item.layerId === input.layerId && item.paramKey === input.paramKey,
        );
        if (!track) {
          track = {
            id: uuidv4(),
            layerId: input.layerId,
            paramKey: input.paramKey,
            paramLabel: input.paramLabel,
            paramType: input.paramType,
            enabled: true,
            interpolation: defaultInterpolationForType(input.paramType),
            keyframes: [],
          };
          state.tracks.push(track);
        }

        const existing = track.keyframes.find(
          (kf) => Math.abs(kf.time - targetTime) <= TIME_EPSILON,
        );
        if (existing) {
          existing.value = cloneParamValue(input.value);
          state.selectedTrackId = track.id;
          state.selectedKeyframeId = existing.id;
          return;
        }

        const keyframeId = uuidv4();
        track.keyframes.push({
          id: keyframeId,
          time: targetTime,
          value: cloneParamValue(input.value),
        });
        track.keyframes = sortKeyframes(track.keyframes);
        state.selectedTrackId = track.id;
        state.selectedKeyframeId = keyframeId;
      });
    },

    setTrackEnabled(trackId, enabled) {
      set((state) => {
        const track = state.tracks.find((item) => item.id === trackId);
        if (!track) return;
        track.enabled = enabled;
      });
    },

    setTrackInterpolation(trackId, interpolation) {
      set((state) => {
        const track = state.tracks.find((item) => item.id === trackId);
        if (!track) return;
        track.interpolation = interpolation;
      });
    },

    setSelected(trackId, keyframeId = null) {
      set((state) => {
        state.selectedTrackId = trackId;
        state.selectedKeyframeId = keyframeId;
      });
    },

    setKeyframeTime(trackId, keyframeId, time) {
      set((state) => {
        const track = state.tracks.find((item) => item.id === trackId);
        if (!track) return;
        const keyframe = track.keyframes.find((item) => item.id === keyframeId);
        if (!keyframe) return;
        keyframe.time = clampTime(time, state.duration);
        track.keyframes = sortKeyframes(track.keyframes);
      });
    },

    removeKeyframe(trackId, keyframeId) {
      set((state) => {
        const trackIndex = state.tracks.findIndex(
          (item) => item.id === trackId,
        );
        if (trackIndex < 0) return;
        const track = state.tracks[trackIndex];
        if (!track) return;
        const keyframeIndex = track.keyframes.findIndex(
          (item) => item.id === keyframeId,
        );
        if (keyframeIndex < 0) return;
        track.keyframes.splice(keyframeIndex, 1);
        if (state.selectedKeyframeId === keyframeId) {
          state.selectedKeyframeId = null;
        }
        cleanupTrackAfterKeyframeMutation(state, trackIndex);
      });
    },

    clearLayerTracks(layerId) {
      set((state) => {
        const removedTrackIds = new Set(
          state.tracks
            .filter((track) => track.layerId === layerId)
            .map((track) => track.id),
        );
        if (removedTrackIds.size === 0) return;
        state.tracks = state.tracks.filter(
          (track) => track.layerId !== layerId,
        );
        if (
          state.selectedTrackId &&
          removedTrackIds.has(state.selectedTrackId)
        ) {
          state.selectedTrackId = null;
          state.selectedKeyframeId = null;
        }
      });
    },

    pruneTracks(layers) {
      set((state) => {
        const layerById = new Map(layers.map((layer) => [layer.id, layer]));
        state.tracks = state.tracks.filter((track) => {
          const layer = layerById.get(track.layerId);
          if (!layer) return false;
          const param = layer.params.find((p) => p.key === track.paramKey);
          if (!param || !isParamAnimatable(param.type)) return false;
          track.paramLabel = param.label;
          track.paramType = param.type;
          track.interpolation =
            param.type === "enum" || param.type === "bool"
              ? "step"
              : track.interpolation;
          return true;
        });

        if (
          state.selectedTrackId &&
          !state.tracks.some((track) => track.id === state.selectedTrackId)
        ) {
          state.selectedTrackId = null;
          state.selectedKeyframeId = null;
        }
      });
    },
  })),
);

export function getTrackForParam(
  tracks: TimelineTrack[],
  layerId: string,
  paramKey: string,
): TimelineTrack | null {
  return (
    tracks.find(
      (track) => track.layerId === layerId && track.paramKey === paramKey,
    ) ?? null
  );
}

export function keyframeExistsAtCurrentTime(
  tracks: TimelineTrack[],
  layerId: string,
  paramKey: string,
  time: number,
): boolean {
  const track = getTrackForParam(tracks, layerId, paramKey);
  if (!track) return false;
  return hasKeyframeAtTime(track, time);
}

export function valueMatchesCurrentKeyframe(
  track: TimelineTrack | null,
  time: number,
  value: ShaderParam["value"],
): boolean {
  if (!track) return false;
  const keyframe = track.keyframes.find(
    (kf) => Math.abs(kf.time - time) <= TIME_EPSILON,
  );
  if (!keyframe) return false;
  return valuesEqual(keyframe.value, value);
}

export function timelineTimeEpsilon(): number {
  return TIME_EPSILON;
}

export function getTimelineSnapshot() {
  const state = useTimelineStore.getState();
  return {
    isPlaying: state.isPlaying,
    loop: state.loop,
    duration: state.duration,
    currentTime: state.currentTime,
    tracks: state.tracks,
  };
}

export function hasAnyTimelineTracks(): boolean {
  return useTimelineStore.getState().tracks.length > 0;
}

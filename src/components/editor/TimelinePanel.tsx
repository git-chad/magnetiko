"use client";

import {
  CaretDown,
  CaretUp,
  Diamond,
  Pause,
  Play,
  Repeat,
  Stop,
  Trash,
} from "@phosphor-icons/react";
import * as React from "react";
import {
  Button,
  Input,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Text,
} from "@/components/ui";
import { cn } from "@/lib/utils";
import { useLayerStore } from "@/store/layerStore";
import type {
  TimelineInterpolation,
  TimelineTrack,
} from "@/store/timelineStore";
import { useTimelineStore } from "@/store/timelineStore";

const TRACK_LABEL_WIDTH = 220;

function formatTime(time: number): string {
  if (!Number.isFinite(time)) return "0.00s";
  return `${time.toFixed(2)}s`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toPercent(time: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return clamp((time / duration) * 100, 0, 100);
}

function getTrackSortIndex(
  layerParams: Array<{ key: string }>,
  track: TimelineTrack,
): number {
  const index = layerParams.findIndex((param) => param.key === track.paramKey);
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}

export function TimelinePanel() {
  const layers = useLayerStore((s) => s.layers);
  const selectedLayerId = useLayerStore((s) => s.selectedLayerId);
  const selectedLayer = useLayerStore((s) =>
    s.selectedLayerId
      ? (s.layers.find((layer) => layer.id === s.selectedLayerId) ?? null)
      : null,
  );

  const panelOpen = useTimelineStore((s) => s.panelOpen);
  const isPlaying = useTimelineStore((s) => s.isPlaying);
  const loop = useTimelineStore((s) => s.loop);
  const duration = useTimelineStore((s) => s.duration);
  const currentTime = useTimelineStore((s) => s.currentTime);
  const tracks = useTimelineStore((s) => s.tracks);
  const selectedTrackId = useTimelineStore((s) => s.selectedTrackId);
  const selectedKeyframeId = useTimelineStore((s) => s.selectedKeyframeId);

  const setPanelOpen = useTimelineStore((s) => s.setPanelOpen);
  const togglePlaying = useTimelineStore((s) => s.togglePlaying);
  const stop = useTimelineStore((s) => s.stop);
  const setLoop = useTimelineStore((s) => s.setLoop);
  const setDuration = useTimelineStore((s) => s.setDuration);
  const setCurrentTime = useTimelineStore((s) => s.setCurrentTime);
  const setTrackEnabled = useTimelineStore((s) => s.setTrackEnabled);
  const setTrackInterpolation = useTimelineStore(
    (s) => s.setTrackInterpolation,
  );
  const setSelected = useTimelineStore((s) => s.setSelected);
  const setKeyframeTime = useTimelineStore((s) => s.setKeyframeTime);
  const removeKeyframe = useTimelineStore((s) => s.removeKeyframe);
  const pruneTracks = useTimelineStore((s) => s.pruneTracks);

  React.useEffect(() => {
    pruneTracks(layers);
  }, [layers, pruneTracks]);

  const tracksForLayer = React.useMemo(() => {
    if (!selectedLayerId || !selectedLayer) return [];
    return tracks
      .filter((track) => track.layerId === selectedLayerId)
      .sort(
        (a, b) =>
          getTrackSortIndex(selectedLayer.params, a) -
          getTrackSortIndex(selectedLayer.params, b),
      );
  }, [selectedLayer, selectedLayerId, tracks]);

  const selectedTrack = React.useMemo(
    () => tracks.find((track) => track.id === selectedTrackId) ?? null,
    [selectedTrackId, tracks],
  );
  const selectedKeyframe = React.useMemo(
    () =>
      selectedTrack?.keyframes.find((kf) => kf.id === selectedKeyframeId) ??
      null,
    [selectedKeyframeId, selectedTrack],
  );

  const [durationInput, setDurationInput] = React.useState(duration.toFixed(2));
  React.useEffect(() => {
    setDurationInput(duration.toFixed(2));
  }, [duration]);

  const [selectedTimeInput, setSelectedTimeInput] = React.useState("");
  React.useEffect(() => {
    setSelectedTimeInput(
      selectedKeyframe ? selectedKeyframe.time.toFixed(2) : "",
    );
  }, [selectedKeyframe]);

  const timelineRef = React.useRef<HTMLDivElement>(null);
  const clientXToTime = React.useCallback(
    (clientX: number): number => {
      const rect = timelineRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return currentTime;
      const normalized = clamp((clientX - rect.left) / rect.width, 0, 1);
      return normalized * duration;
    },
    [currentTime, duration],
  );

  const beginScrub = React.useCallback(
    (clientX: number) => {
      const nextTime = clientXToTime(clientX);
      useTimelineStore.getState().setPlaying(false);
      setCurrentTime(nextTime);
    },
    [clientXToTime, setCurrentTime],
  );

  const handleScrubPointerDown = React.useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      beginScrub(event.clientX);

      const onMove = (moveEvent: PointerEvent) => {
        beginScrub(moveEvent.clientX);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [beginScrub],
  );

  const handleKeyframeDragStart = React.useCallback(
    (
      event: React.PointerEvent<HTMLButtonElement>,
      trackId: string,
      keyframeId: string,
    ) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();

      const timelineState = useTimelineStore.getState();
      timelineState.setPlaying(false);
      timelineState.setSelected(trackId, keyframeId);

      const onMove = (moveEvent: PointerEvent) => {
        const nextTime = clientXToTime(moveEvent.clientX);
        setKeyframeTime(trackId, keyframeId, nextTime);
        setCurrentTime(nextTime);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [clientXToTime, setCurrentTime, setKeyframeTime],
  );

  const timelineMarks = React.useMemo(() => {
    const count = Math.max(2, Math.min(16, Math.ceil(duration) + 1));
    return Array.from({ length: count }, (_, index) => {
      const normalized = index / (count - 1);
      return {
        value: normalized * duration,
        left: normalized * 100,
      };
    });
  }, [duration]);

  const handleDurationCommit = React.useCallback(() => {
    const parsed = Number.parseFloat(durationInput);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setDurationInput(duration.toFixed(2));
      return;
    }
    setDuration(parsed);
  }, [duration, durationInput, setDuration]);

  const handleSelectedTimeCommit = React.useCallback(() => {
    if (!selectedTrack || !selectedKeyframe) return;
    const parsed = Number.parseFloat(selectedTimeInput);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setSelectedTimeInput(selectedKeyframe.time.toFixed(2));
      return;
    }
    setKeyframeTime(selectedTrack.id, selectedKeyframe.id, parsed);
    setCurrentTime(parsed);
  }, [
    selectedKeyframe,
    selectedTimeInput,
    selectedTrack,
    setCurrentTime,
    setKeyframeTime,
  ]);

  return (
    <section
      className={cn(
        "shrink-0 border-t border-[var(--color-border)] bg-[var(--color-bg-raised)]/80 backdrop-blur-xl transition-[height] duration-150",
        panelOpen ? "h-60" : "h-10",
      )}
    >
      <div className="flex h-10 items-center gap-xs border-b border-[var(--color-border)] px-xs">
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={isPlaying ? "Pause timeline" : "Play timeline"}
          onClick={togglePlaying}
        >
          {isPlaying ? (
            <Pause size={13} weight="fill" />
          ) : (
            <Play size={13} weight="fill" />
          )}
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Stop timeline"
          onClick={stop}
        >
          <Stop size={13} />
        </Button>

        <div className="ml-2xs flex items-center gap-3xs">
          <Repeat size={12} className="text-[var(--color-fg-tertiary)]" />
          <Switch
            checked={loop}
            onCheckedChange={setLoop}
            aria-label="Loop timeline"
          />
          <Text variant="caption" color="tertiary">
            Loop
          </Text>
        </div>

        <div className="ml-xs flex items-center gap-3xs">
          <Text variant="caption" color="secondary">
            Duration
          </Text>
          <Input
            value={durationInput}
            onChange={(event) => setDurationInput(event.target.value)}
            onBlur={handleDurationCommit}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              handleDurationCommit();
            }}
            className="h-7 w-20"
            inputMode="decimal"
          />
          <Text variant="caption" color="disabled">
            sec
          </Text>
        </div>

        <div className="ml-auto flex items-center gap-xs">
          <Text variant="caption" color="secondary">
            {formatTime(currentTime)} / {formatTime(duration)}
          </Text>

          {selectedTrack && selectedKeyframe && (
            <>
              <Input
                value={selectedTimeInput}
                onChange={(event) => setSelectedTimeInput(event.target.value)}
                onBlur={handleSelectedTimeCommit}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  handleSelectedTimeCommit();
                }}
                className="h-7 w-20"
                inputMode="decimal"
                aria-label="Selected keyframe time"
              />
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Delete selected keyframe"
                onClick={() =>
                  removeKeyframe(selectedTrack.id, selectedKeyframe.id)
                }
              >
                <Trash size={12} />
              </Button>
            </>
          )}

          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={
              panelOpen ? "Collapse timeline panel" : "Expand timeline panel"
            }
            onClick={() => setPanelOpen(!panelOpen)}
          >
            {panelOpen ? <CaretDown size={13} /> : <CaretUp size={13} />}
          </Button>
        </div>
      </div>

      {panelOpen && (
        <div className="flex h-[calc(100%-2.5rem)] min-h-0 flex-col">
          <div className="grid grid-cols-[220px,1fr] border-b border-[var(--color-border)]">
            <div className="flex h-8 items-center gap-2xs px-xs">
              <Text
                variant="caption"
                color="disabled"
                className="uppercase tracking-widest"
              >
                Tracks
              </Text>
              {selectedLayer && (
                <Text variant="caption" color="tertiary" className="truncate">
                  {selectedLayer.name}
                </Text>
              )}
            </div>

            <div
              ref={timelineRef}
              className="relative h-8 cursor-ew-resize select-none"
              onPointerDown={handleScrubPointerDown}
            >
              {timelineMarks.map((mark) => (
                <div
                  key={`mark-${mark.left}`}
                  className="absolute bottom-0 top-0"
                  style={{ left: `${mark.left}%` }}
                >
                  <div className="h-full border-l border-[var(--color-border)]/70" />
                  <span className="absolute left-1 top-1 font-mono text-[10px] text-[var(--color-fg-disabled)]">
                    {mark.value.toFixed(1)}
                  </span>
                </div>
              ))}

              <div
                className="pointer-events-none absolute inset-y-0 w-px bg-[var(--color-accent)]"
                style={{ left: `${toPercent(currentTime, duration)}%` }}
              />
            </div>
          </div>

          <ScrollArea className="min-h-0 flex-1">
            {selectedLayer && tracksForLayer.length > 0 ? (
              <div>
                {tracksForLayer.map((track) => {
                  const interpolationDisabled =
                    track.paramType === "enum" || track.paramType === "bool";
                  const isTrackSelected = selectedTrackId === track.id;

                  return (
                    <div
                      key={track.id}
                      className={cn(
                        "grid grid-cols-[220px,1fr] border-b border-[var(--color-border)]/70",
                        isTrackSelected && "bg-[var(--color-bg-subtle)]/70",
                      )}
                    >
                      <div className="flex h-9 items-center gap-3xs px-xs">
                        <Switch
                          checked={track.enabled}
                          onCheckedChange={(checked) =>
                            setTrackEnabled(track.id, checked)
                          }
                          aria-label={`Enable ${track.paramLabel} track`}
                        />
                        <Text
                          variant="caption"
                          color="secondary"
                          className="min-w-0 flex-1 truncate"
                        >
                          {track.paramLabel}
                        </Text>
                        <Select
                          value={track.interpolation}
                          disabled={interpolationDisabled}
                          onValueChange={(value) =>
                            setTrackInterpolation(
                              track.id,
                              value as TimelineInterpolation,
                            )
                          }
                        >
                          <SelectTrigger className="h-7 w-[94px] text-[11px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="smooth">Smooth</SelectItem>
                            <SelectItem value="linear">Linear</SelectItem>
                            <SelectItem value="step">Step</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="relative h-9">
                        <button
                          type="button"
                          className="absolute inset-0 cursor-ew-resize bg-transparent"
                          aria-label={`Scrub timeline for ${track.paramLabel}`}
                          onPointerDown={handleScrubPointerDown}
                          onClick={() => setSelected(track.id, null)}
                        />

                        <div
                          className="pointer-events-none absolute inset-y-0 w-px bg-[var(--color-accent)]"
                          style={{
                            left: `${toPercent(currentTime, duration)}%`,
                          }}
                        />

                        {track.keyframes.map((keyframe) => {
                          const selected =
                            selectedTrackId === track.id &&
                            selectedKeyframeId === keyframe.id;
                          return (
                            <button
                              key={keyframe.id}
                              type="button"
                              aria-label={`${track.paramLabel} keyframe at ${keyframe.time.toFixed(2)} seconds`}
                              className={cn(
                                "absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-[var(--color-fg-tertiary)] transition-colors",
                                selected && "text-[var(--color-accent)]",
                              )}
                              style={{
                                left: `${toPercent(keyframe.time, duration)}%`,
                              }}
                              onPointerDown={(event) =>
                                handleKeyframeDragStart(
                                  event,
                                  track.id,
                                  keyframe.id,
                                )
                              }
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelected(track.id, keyframe.id);
                              }}
                            >
                              <Diamond
                                size={13}
                                weight={selected ? "fill" : "regular"}
                              />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center p-md">
                <Text
                  variant="caption"
                  color="disabled"
                  className="text-center"
                >
                  {selectedLayer
                    ? "No animated parameters yet. Add keyframes from the Properties panel."
                    : "Select a layer to animate shader parameters."}
                </Text>
              </div>
            )}
          </ScrollArea>
        </div>
      )}
    </section>
  );
}

export const TIMELINE_TRACK_LABEL_WIDTH = TRACK_LABEL_WIDTH;

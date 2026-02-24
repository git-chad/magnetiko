"use client";

import * as React from "react";

export interface PointerHistoryEntry {
  uvX: number;
  uvY: number;
  timestamp: number;
  isTouch: boolean;
}

export interface PointerClickEntry {
  uvX: number;
  uvY: number;
  timestamp: number;
  isTouch: boolean;
}

export interface MouseInteractionFrame {
  uvX: number;
  uvY: number;
  duvX: number;
  duvY: number;
  velocityX: number;
  velocityY: number;
  isActive: boolean;
  history: readonly PointerHistoryEntry[];
}

interface UseMouseInteractionOptions {
  targetRef: React.RefObject<HTMLElement | null>;
  historySize?: number;
  clickBufferSize?: number;
  initialUv?: { x: number; y: number };
}

type PendingPointer = {
  uvX: number;
  uvY: number;
  timestamp: number;
  isTouch: boolean;
  isActive: boolean;
};

type InteractionState = {
  uvX: number;
  uvY: number;
  duvX: number;
  duvY: number;
  velocityX: number;
  velocityY: number;
  isActive: boolean;
  lastTimestamp: number;
  rafId: number | null;
  pending: PendingPointer | null;
  history: PointerHistoryEntry[];
  clicks: PointerClickEntry[];
};

type InteractionApi = {
  getFrameData: () => MouseInteractionFrame;
  consumeClicks: () => PointerClickEntry[];
};

function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function eventUv(
  clientX: number,
  clientY: number,
  el: HTMLElement,
): { uvX: number; uvY: number } {
  const rect = el.getBoundingClientRect();
  const width = Math.max(rect.width, 1);
  const height = Math.max(rect.height, 1);

  return {
    uvX: clamp01((clientX - rect.left) / width),
    uvY: clamp01((clientY - rect.top) / height),
  };
}

export function useMouseInteraction({
  targetRef,
  historySize = 48,
  clickBufferSize = 10,
  initialUv = { x: 0.5, y: 0.5 },
}: UseMouseInteractionOptions): InteractionApi {
  const stateRef = React.useRef<InteractionState>({
    uvX: initialUv.x,
    uvY: initialUv.y,
    duvX: 0,
    duvY: 0,
    velocityX: 0,
    velocityY: 0,
    isActive: false,
    lastTimestamp: 0,
    rafId: null,
    pending: null,
    history: [],
    clicks: [],
  });

  const pushHistory = React.useCallback(
    (entry: PointerHistoryEntry) => {
      const s = stateRef.current;
      s.history.push(entry);
      if (s.history.length > historySize) {
        s.history.splice(0, s.history.length - historySize);
      }
    },
    [historySize],
  );

  const pushClick = React.useCallback(
    (entry: PointerClickEntry) => {
      const s = stateRef.current;
      s.clicks.push(entry);
      if (s.clicks.length > clickBufferSize) {
        s.clicks.splice(0, s.clicks.length - clickBufferSize);
      }
    },
    [clickBufferSize],
  );

  const processPending = React.useCallback(
    (nowMs: number) => {
      const s = stateRef.current;
      const pending = s.pending;
      s.pending = null;
      if (!pending) return;

      const dtSec =
        s.lastTimestamp > 0
          ? Math.max((pending.timestamp - s.lastTimestamp) / 1000, 1 / 240)
          : 1 / 60;

      const duvX = pending.uvX - s.uvX;
      const duvY = pending.uvY - s.uvY;

      s.uvX = pending.uvX;
      s.uvY = pending.uvY;
      s.duvX = pending.isActive ? duvX : 0;
      s.duvY = pending.isActive ? duvY : 0;
      s.velocityX = pending.isActive ? duvX / dtSec : 0;
      s.velocityY = pending.isActive ? duvY / dtSec : 0;
      s.isActive = pending.isActive;
      s.lastTimestamp = pending.timestamp || nowMs;

      pushHistory({
        uvX: pending.uvX,
        uvY: pending.uvY,
        timestamp: pending.timestamp || nowMs,
        isTouch: pending.isTouch,
      });
    },
    [pushHistory],
  );

  const scheduleProcess = React.useCallback(() => {
    const s = stateRef.current;
    if (s.rafId !== null) return;

    s.rafId = requestAnimationFrame((ts) => {
      stateRef.current.rafId = null;
      processPending(ts);
    });
  }, [processPending]);

  const setPending = React.useCallback(
    (pending: PendingPointer) => {
      stateRef.current.pending = pending;
      scheduleProcess();
    },
    [scheduleProcess],
  );

  React.useEffect(() => {
    const el = targetRef.current;
    if (!el) return;

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const { uvX, uvY } = eventUv(e.clientX, e.clientY, el);
      setPending({
        uvX,
        uvY,
        timestamp: performance.now(),
        isTouch: false,
        isActive: true,
      });
    };

    const onPointerEnter = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const { uvX, uvY } = eventUv(e.clientX, e.clientY, el);
      setPending({
        uvX,
        uvY,
        timestamp: performance.now(),
        isTouch: false,
        isActive: true,
      });
    };

    const onPointerLeave = () => {
      const s = stateRef.current;
      setPending({
        uvX: s.uvX,
        uvY: s.uvY,
        timestamp: performance.now(),
        isTouch: false,
        isActive: false,
      });
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const { uvX, uvY } = eventUv(e.clientX, e.clientY, el);
      pushClick({
        uvX,
        uvY,
        timestamp: performance.now(),
        isTouch: false,
      });
    };

    const onTouchStart = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      if (!t) return;
      const { uvX, uvY } = eventUv(t.clientX, t.clientY, el);
      const now = performance.now();

      setPending({
        uvX,
        uvY,
        timestamp: now,
        isTouch: true,
        isActive: true,
      });
      pushClick({ uvX, uvY, timestamp: now, isTouch: true });
      e.preventDefault();
    };

    const onTouchMove = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      if (!t) return;
      const { uvX, uvY } = eventUv(t.clientX, t.clientY, el);
      setPending({
        uvX,
        uvY,
        timestamp: performance.now(),
        isTouch: true,
        isActive: true,
      });
      e.preventDefault();
    };

    const onTouchEndOrCancel = () => {
      const s = stateRef.current;
      setPending({
        uvX: s.uvX,
        uvY: s.uvY,
        timestamp: performance.now(),
        isTouch: true,
        isActive: false,
      });
    };

    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerenter", onPointerEnter);
    el.addEventListener("pointerleave", onPointerLeave);
    el.addEventListener("pointerdown", onPointerDown);

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEndOrCancel, { passive: true });
    el.addEventListener("touchcancel", onTouchEndOrCancel, { passive: true });

    return () => {
      const rafId = stateRef.current.rafId;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        stateRef.current.rafId = null;
      }

      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerenter", onPointerEnter);
      el.removeEventListener("pointerleave", onPointerLeave);
      el.removeEventListener("pointerdown", onPointerDown);

      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEndOrCancel);
      el.removeEventListener("touchcancel", onTouchEndOrCancel);
    };
  }, [pushClick, setPending, targetRef]);

  const getFrameData = React.useCallback((): MouseInteractionFrame => {
    const s = stateRef.current;
    const frame: MouseInteractionFrame = {
      uvX: s.uvX,
      uvY: s.uvY,
      duvX: s.duvX,
      duvY: s.duvY,
      velocityX: s.velocityX,
      velocityY: s.velocityY,
      isActive: s.isActive,
      history: [...s.history],
    };

    // Deltas are consumed once per render frame.
    s.duvX = 0;
    s.duvY = 0;
    if (!s.isActive) {
      s.velocityX = 0;
      s.velocityY = 0;
    }

    return frame;
  }, []);

  const consumeClicks = React.useCallback((): PointerClickEntry[] => {
    const s = stateRef.current;
    if (s.clicks.length === 0) return [];
    const clicks = [...s.clicks];
    s.clicks.length = 0;
    return clicks;
  }, []);

  return { getFrameData, consumeClicks };
}


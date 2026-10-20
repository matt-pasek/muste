"use client";
import * as React from "react";

export type VirvaRgb3 = [number, number, number];

const FALLBACK: VirvaRgb3 = [0, 0, 0];

/**
 * A canvas cannot sample the page behind it, so every colour the lens needs has
 * to be handed to the shader as a number. Tokens are authored in oklch, and the
 * only reliable way to turn any CSS colour string into channels is to paint it.
 */
export function resolveColor(value: string): VirvaRgb3 {
  if (typeof document === "undefined") return FALLBACK;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return FALLBACK;
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return [(r ?? 0) / 255, (g ?? 0) / 255, (b ?? 0) / 255];
  } catch {
    return FALLBACK;
  }
}

export interface PauseGateOptions {
  target: Element;
  onPause: () => void;
  onResume: () => void;
  margin?: string;
}

export interface PauseGate {
  awake(): boolean;
  dispose(): void;
}

const DEFAULT_MARGIN = "20%";

/**
 * Whether the presence is allowed to draw. Idle is not the same as unseen: a
 * presence that is listening will happily burn frames in a background tab.
 *
 * It reports transitions only, never the current frame's state, so a resume
 * hands control back to a loop that picks up from its live values: nothing here
 * rewinds a choreography.
 */
export function createPauseGate(options: PauseGateOptions): PauseGate {
  const { target, onPause, onResume, margin = DEFAULT_MARGIN } = options;

  let onScreen = true;
  let awake = true;

  const sync = () => {
    const next = onScreen && !isHidden();
    if (next === awake) return;
    awake = next;
    if (next) onResume();
    else onPause();
  };

  const io =
    typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver(
          (entries) => {
            onScreen = entries[entries.length - 1]?.isIntersecting ?? true;
            sync();
          },
          { rootMargin: margin },
        );
  io?.observe(target);

  const onVisibility = () => sync();
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibility);
  }

  return {
    awake: () => awake,
    dispose() {
      io?.disconnect();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    },
  };
}

function isHidden(): boolean {
  return typeof document !== "undefined" && document.hidden;
}

const BACKOFF = [400, 900, 2000, 4000];
const MAX_ATTEMPTS = 6;

export function useContextRecovery(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
) {
  const [failed, setFailed] = React.useState(false);
  const [generation, setGeneration] = React.useState(0);
  const attempts = React.useRef(0);

  const retry = React.useCallback(() => {
    setFailed(false);
    setGeneration((n) => n + 1);
  }, []);

  React.useEffect(() => {
    if (!failed) return;

    const canvas = canvasRef.current;
    const onRestored = () => {
      attempts.current = 0;
      retry();
    };
    canvas?.addEventListener("webglcontextrestored", onRestored);

    let timer = 0;
    if (attempts.current < MAX_ATTEMPTS) {
      const wait = BACKOFF[Math.min(attempts.current, BACKOFF.length - 1)];
      attempts.current += 1;
      timer = window.setTimeout(retry, wait);
    }

    return () => {
      window.clearTimeout(timer);
      canvas?.removeEventListener("webglcontextrestored", onRestored);
    };
  }, [failed, canvasRef, retry]);

  const onContextLost = React.useCallback(() => setFailed(true), []);

  const onContextReady = React.useCallback(() => {
    attempts.current = 0;
  }, []);

  return { failed, generation, onContextLost, onContextReady };
}

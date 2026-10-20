"use client";
import { useReducedMotion } from "motion/react";
import * as React from "react";
import { cn } from "@usva-ui/react/cn";
import {
  createPauseGate,
  resolveColor,
  useContextRecovery,
} from "./virva-canvas.js";
import {
  createVirvaMotion,
  stepVirvaMotion,
  type VirvaState,
  virvaMotionForcing,
} from "./virva-geometry.js";
import {
  prepareVirvaColors,
  type VirvaColors,
  type VirvaRgb,
} from "./virva-optics.js";
import { createVirvaField } from "./virva-simulation.js";

export interface VirvaProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual state. Defaults to "idle". */
  state?: VirvaState;
  /** Normalized live input. Finite values are clamped to 0..1. */
  level?: number;
  /** Square side in CSS pixels. Defaults to 112. */
  size?: number;
  /** Accessible status text. Omit for a decorative presence. */
  label?: string;
  /** False or reduced motion renders a static shell without WebGL. */
  fluid?: boolean;
}

const DEFAULT_SIZE = 112;
const MAX_DPR = 2;
const MAX_DELTA_SECONDS = 1 / 15;

interface StaticRegion {
  color: string;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rotate: number;
  opacity: number;
}

const STATIC_REGIONS: Record<VirvaState, StaticRegion[]> = {
  idle: [
    {
      color: "accent",
      cx: 33,
      cy: 57,
      rx: 23,
      ry: 14,
      rotate: -12,
      opacity: 0.2,
    },
    { color: "info", cx: 52, cy: 53, rx: 25, ry: 17, rotate: 8, opacity: 0.22 },
    {
      color: "live",
      cx: 69,
      cy: 61,
      rx: 20,
      ry: 15,
      rotate: -18,
      opacity: 0.18,
    },
    { color: "ink", cx: 51, cy: 58, rx: 13, ry: 10, rotate: 0, opacity: 0.12 },
  ],
  listening: [
    {
      color: "accent",
      cx: 29,
      cy: 55,
      rx: 28,
      ry: 24,
      rotate: -18,
      opacity: 0.54,
    },
    {
      color: "info",
      cx: 48,
      cy: 48,
      rx: 29,
      ry: 25,
      rotate: 14,
      opacity: 0.62,
    },
    {
      color: "live",
      cx: 69,
      cy: 59,
      rx: 27,
      ry: 23,
      rotate: -11,
      opacity: 0.56,
    },
    { color: "ink", cx: 50, cy: 55, rx: 18, ry: 15, rotate: 5, opacity: 0.36 },
  ],
  thinking: [
    {
      color: "accent",
      cx: 31,
      cy: 45,
      rx: 31,
      ry: 27,
      rotate: 18,
      opacity: 0.58,
    },
    {
      color: "info",
      cx: 57,
      cy: 43,
      rx: 30,
      ry: 26,
      rotate: -20,
      opacity: 0.64,
    },
    {
      color: "live",
      cx: 63,
      cy: 68,
      rx: 31,
      ry: 24,
      rotate: 13,
      opacity: 0.58,
    },
    { color: "ink", cx: 49, cy: 52, rx: 21, ry: 18, rotate: -8, opacity: 0.42 },
  ],
  responding: [
    {
      color: "accent",
      cx: 27,
      cy: 51,
      rx: 29,
      ry: 25,
      rotate: -15,
      opacity: 0.5,
    },
    { color: "info", cx: 52, cy: 46, rx: 34, ry: 24, rotate: 8, opacity: 0.62 },
    { color: "live", cx: 73, cy: 60, rx: 34, ry: 22, rotate: -8, opacity: 0.7 },
    { color: "ink", cx: 55, cy: 53, rx: 22, ry: 16, rotate: 4, opacity: 0.38 },
  ],
};

function safeSize(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_SIZE;
}

function readColors(node: HTMLElement): VirvaColors {
  const styles = getComputedStyle(node);
  const token = (name: string, fallback?: string) =>
    styles.getPropertyValue(name).trim() ||
    (fallback ? styles.getPropertyValue(fallback).trim() : "");
  const color = (name: string, fallback?: string): VirvaRgb => {
    const raw = token(name, fallback);
    if (!raw.includes("var(")) return resolveColor(raw);

    const probe = document.createElement("span");
    probe.style.color = `var(${name}${fallback ? `, var(${fallback})` : ""})`;
    probe.style.position = "absolute";
    probe.style.pointerEvents = "none";
    node.append(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    return resolveColor(resolved);
  };

  return prepareVirvaColors({
    accent: color("--usva-accent"),
    info: color("--usva-info", "--usva-accent"),
    live: color("--usva-live", "--usva-accent"),
    ink: color("--usva-ink"),
    surface: color("--usva-surface-2", "--usva-surface"),
    backdrop: color("--usva-bg"),
  });
}

function StaticVirva({
  id,
  state,
  hidden,
}: {
  id: string;
  state: VirvaState;
  hidden: boolean;
}) {
  const regions = STATIC_REGIONS[state];

  return (
    <svg
      data-virva-shell=""
      aria-hidden="true"
      viewBox="0 0 100 100"
      className={cn(
        "pointer-events-none absolute inset-0 size-full overflow-visible transition-opacity duration-200",
        hidden && "opacity-0",
      )}
    >
      <defs>
        <clipPath id={`${id}-body`}>
          <path d="M17 25C28 9 50 7 67 14C86 22 94 42 88 61C82 81 62 93 40 88C18 84 6 68 9 48C10 39 12 31 17 25Z" />
        </clipPath>
        <radialGradient id={`${id}-glass`} cx="38%" cy="24%" r="82%">
          <stop
            offset="0"
            stopColor="var(--usva-surface-2)"
            stopOpacity="0.82"
          />
          <stop
            offset="0.62"
            stopColor="var(--usva-surface)"
            stopOpacity="0.72"
          />
          <stop offset="1" stopColor="var(--usva-bg)" stopOpacity="0.9" />
        </radialGradient>
        <filter id={`${id}-soft`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="5.4" />
        </filter>
      </defs>
      <path
        d="M17 25C28 9 50 7 67 14C86 22 94 42 88 61C82 81 62 93 40 88C18 84 6 68 9 48C10 39 12 31 17 25Z"
        fill={`url(#${id}-glass)`}
      />
      <g clipPath={`url(#${id}-body)`} filter={`url(#${id}-soft)`}>
        {regions.map((region, index) => (
          <ellipse
            key={`${region.color}:${region.cx}`}
            data-virva-region=""
            cx={region.cx}
            cy={region.cy}
            rx={region.rx}
            ry={region.ry}
            opacity={region.opacity}
            fill={`var(--usva-${region.color})`}
            transform={`rotate(${region.rotate} ${region.cx} ${region.cy})`}
            style={{ mixBlendMode: index === 3 ? "screen" : "plus-lighter" }}
          />
        ))}
      </g>
    </svg>
  );
}

export const Virva = React.forwardRef<HTMLDivElement, VirvaProps>(
  (
    {
      state = "idle",
      level,
      size = DEFAULT_SIZE,
      label,
      fluid = true,
      className,
      style,
      ...props
    },
    forwardedRef,
  ) => {
    const reduced = useReducedMotion();
    const rootRef = React.useRef<HTMLDivElement | null>(null);
    const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
    const stateRef = React.useRef(state);
    const levelRef = React.useRef(level);
    stateRef.current = state;
    levelRef.current = level;
    const shellId = React.useId().replaceAll(":", "");
    const dimension = safeSize(size);
    const [mounted, setMounted] = React.useState(false);
    React.useEffect(() => setMounted(true), []);
    const { failed, generation, onContextLost, onContextReady } =
      useContextRecovery(canvasRef);

    const wantsCanvas = fluid && !reduced && mounted;
    const runsFluid = wantsCanvas && !failed;

    React.useEffect(() => {
      // A recovered WebGL context increments generation to rebuild this field.
      void generation;
      if (!runsFluid) return;
      const canvas = canvasRef.current;
      const root = rootRef.current;
      if (!canvas || !root) return;

      const field = createVirvaField({
        canvas,
        colors: readColors(root),
        onContextLost,
      });
      if (!field) {
        onContextLost();
        return;
      }
      onContextReady();

      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      field.resize(dimension, dimension, dpr);

      let raf = 0;
      let stopped = false;
      let last = performance.now();
      let motion = createVirvaMotion(stateRef.current, levelRef.current);

      const tick = (now: number) => {
        if (stopped) return;
        const delta = Math.min(
          MAX_DELTA_SECONDS,
          Math.max(0, (now - last) / 1000 || 1 / 60),
        );
        last = now;
        motion = stepVirvaMotion(motion, {
          state: stateRef.current,
          level: levelRef.current,
          delta,
        });
        field.draw({
          time: motion.elapsed,
          delta,
          forcing: virvaMotionForcing(motion),
        });
        raf = requestAnimationFrame(tick);
      };

      const stop = () => cancelAnimationFrame(raf);
      const run = () => {
        last = performance.now();
        stop();
        raf = requestAnimationFrame(tick);
      };
      const gate = createPauseGate({
        target: root,
        onPause: stop,
        onResume: run,
      });

      const themeObserver =
        typeof MutationObserver === "undefined"
          ? null
          : new MutationObserver(() => field.setColors(readColors(root)));
      themeObserver?.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme", "class"],
      });

      run();
      return () => {
        stopped = true;
        gate.dispose();
        themeObserver?.disconnect();
        stop();
        field.dispose();
      };
    }, [dimension, generation, onContextLost, onContextReady, runsFluid]);

    const setRootRef = React.useCallback(
      (node: HTMLDivElement | null) => {
        rootRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      },
      [forwardedRef],
    );

    return (
      <div
        {...props}
        ref={setRootRef}
        role={label ? "status" : undefined}
        aria-live={label ? "polite" : undefined}
        aria-hidden={label ? undefined : true}
        data-state={state}
        data-fluid={runsFluid ? "on" : "off"}
        className={cn("relative isolate inline-block shrink-0", className)}
        style={{ width: dimension, height: dimension, ...style }}
      >
        <StaticVirva id={shellId} state={state} hidden={runsFluid} />
        {wantsCanvas ? (
          <canvas
            ref={canvasRef}
            className={cn(
              "pointer-events-none absolute inset-0 size-full overflow-visible",
              failed && "opacity-0",
            )}
          />
        ) : null}
        {label ? <span className="sr-only">{label}</span> : null}
      </div>
    );
  },
);
Virva.displayName = "Virva";

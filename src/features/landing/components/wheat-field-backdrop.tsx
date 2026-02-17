"use client";

import { useEffect, useRef, useState } from "react";

type VantaTopologyEffect = {
  destroy: () => void;
};

export function WheatFieldBackdrop() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const effectRef = useRef<VantaTopologyEffect | null>(null);
  const [allowAnimatedBackdrop, setAllowAnimatedBackdrop] = useState(false);
  const [vantaReady, setVantaReady] = useState(false);

  useEffect(() => {
    const widthQuery = window.matchMedia("(max-width: 900px)");
    const touchQuery = window.matchMedia("(pointer: coarse)");
    const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const update = () => {
      const shouldUseStatic = widthQuery.matches || touchQuery.matches || reducedQuery.matches;
      setAllowAnimatedBackdrop(!shouldUseStatic);
    };

    update();
    widthQuery.addEventListener("change", update);
    touchQuery.addEventListener("change", update);
    reducedQuery.addEventListener("change", update);

    return () => {
      widthQuery.removeEventListener("change", update);
      touchQuery.removeEventListener("change", update);
      reducedQuery.removeEventListener("change", update);
    };
  }, []);

  useEffect(() => {
    if (!allowAnimatedBackdrop) {
      if (effectRef.current) {
        effectRef.current.destroy();
        effectRef.current = null;
      }
      setVantaReady(false);
      return;
    }

    let mounted = true;
    let cancelled = false;

    const setup = async () => {
      const p5Module = await import("p5");
      const p5 = (p5Module as unknown as { default?: unknown }).default ?? p5Module;
      (window as unknown as { p5?: unknown }).p5 = p5;

      const vantaModule = await import("vanta/dist/vanta.topology.min");
      const TOPOLOGY = (vantaModule as unknown as { default: (config: Record<string, unknown>) => VantaTopologyEffect }).default;

      if (!mounted || !containerRef.current) return;

      effectRef.current = TOPOLOGY({
        el: containerRef.current,
        mouseControls: true,
        touchControls: true,
        gyroControls: false,
        minHeight: 200,
        minWidth: 200,
        scale: 1.1,
        scaleMobile: 1,
        color: 0xd8b561,
        backgroundColor: 0x0f1e16,
        points: 11,
        spacing: 19,
        showDots: true,
      });
      setVantaReady(true);
    };

    const setupWhenIdle = () => {
      setup().catch(() => {
        if (!mounted) return;
        setVantaReady(false);
      });
    };

    if ("requestIdleCallback" in window) {
      const idleId = (window as unknown as { requestIdleCallback: (cb: () => void, options?: { timeout: number }) => number }).requestIdleCallback(
        () => {
          if (cancelled) return;
          setupWhenIdle();
        },
        { timeout: 1200 },
      );
      return () => {
        mounted = false;
        cancelled = true;
        (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(idleId);
        if (effectRef.current) {
          effectRef.current.destroy();
          effectRef.current = null;
        }
      };
    }

    setupWhenIdle();

    return () => {
      mounted = false;
      cancelled = true;
      if (effectRef.current) {
        effectRef.current.destroy();
        effectRef.current = null;
      }
    };
  }, [allowAnimatedBackdrop]);

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {allowAnimatedBackdrop && <div ref={containerRef} className="h-full w-full" />}
      {!vantaReady && (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_24%,rgba(149,195,82,0.3),transparent_33%),radial-gradient(circle_at_82%_16%,rgba(214,179,96,0.25),transparent_35%),linear-gradient(140deg,rgba(9,16,25,0.9),rgba(14,38,28,0.88))]" />
      )}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(9,16,25,0.1),rgba(9,16,25,0.32))]" />
    </div>
  );
}

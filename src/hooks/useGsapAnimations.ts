"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";

export function useGsapReveal<T extends HTMLElement>(deps: unknown[] = []) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const prefersReducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      gsap.set(el, { opacity: 1, y: 0 });
      return;
    }
    gsap.fromTo(el, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out", overwrite: true });
    return () => {
      gsap.killTweensOf(el);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return ref;
}

export function useGsapStagger<T extends HTMLElement>(selector = "[data-stagger]", deps: unknown[] = []) {
  const parentRef = useRef<T>(null);

  useEffect(() => {
    const parent = parentRef.current;
    if (!parent) return;
    const prefersReducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const children = parent.querySelectorAll(selector);
    if (prefersReducedMotion) {
      gsap.set(children, { opacity: 1, y: 0 });
      return;
    }
    gsap.fromTo(children, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.08, ease: "power2.out", overwrite: true });
    return () => {
      gsap.killTweensOf(children);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selector, ...deps]);

  return parentRef;
}

export function useGsapRowIn<T extends HTMLElement>(selector = "tr", deps: unknown[] = []) {
  const tableRef = useRef<T>(null);

  useEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    const prefersReducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rows = table.querySelectorAll(selector);
    if (prefersReducedMotion) {
      gsap.set(rows, { opacity: 1, x: 0 });
      return;
    }
    gsap.fromTo(rows, { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: 0.45, stagger: 0.04, ease: "power2.out", overwrite: true });
    return () => {
      gsap.killTweensOf(rows);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selector, ...deps]);

  return tableRef;
}

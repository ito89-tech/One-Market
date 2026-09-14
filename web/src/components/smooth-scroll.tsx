"use client";

import { ReactLenis, useLenis } from "lenis/react";
import type { ReactNode } from "react";

function ScrollAtmosphere() {
  useLenis((lenis) => {
    const root = document.documentElement;
    root.style.setProperty("--scroll-y", String(lenis.scroll));
    root.style.setProperty("--scroll-progress", String(lenis.progress));
  });
  return null;
}

export function SmoothScroll({ children }: { children: ReactNode }) {
  return (
    <ReactLenis
      root
      options={{
        autoRaf: true,
        lerp: 0.08,
        duration: 1.15,
        easing: (t) => 1 - (1 - t) ** 3,
        smoothWheel: true,
        wheelMultiplier: 0.86,
        syncTouch: false,
        anchors: {
          offset: -88,
          duration: 1.05,
        },
        allowNestedScroll: true,
        respectReducedMotion: true,
        prevent: (node) =>
          Boolean(
            node.closest(
              "[data-lenis-prevent], textarea, select, [role='listbox']",
            ),
          ),
      }}
    >
      <ScrollAtmosphere />
      {children}
    </ReactLenis>
  );
}

"use client";

import { useEffect } from "react";

const HEIGHT_VAR = "--cart-visual-viewport-height";
const WIDTH_VAR = "--cart-visual-viewport-width";

function px(value: number): string {
  return `${Math.max(1, Math.round(value * 1000) / 1000)}px`;
}

export default function CartViewportSync() {
  useEffect(() => {
    const root = document.documentElement;
    let raf = 0;

    const sync = () => {
      raf = 0;
      const viewport = window.visualViewport;
      const height = viewport?.height ?? window.innerHeight;
      const width = viewport?.width ?? window.innerWidth;
      root.style.setProperty(HEIGHT_VAR, px(height));
      root.style.setProperty(WIDTH_VAR, px(width));
      root.dataset.cartVisualViewport = "synced";
    };

    const schedule = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(sync);
    };

    sync();
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("orientationchange", schedule, { passive: true });
    window.visualViewport?.addEventListener("resize", schedule, { passive: true });
    window.visualViewport?.addEventListener("scroll", schedule, { passive: true });

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
      root.style.removeProperty(HEIGHT_VAR);
      root.style.removeProperty(WIDTH_VAR);
      delete root.dataset.cartVisualViewport;
    };
  }, []);

  return null;
}

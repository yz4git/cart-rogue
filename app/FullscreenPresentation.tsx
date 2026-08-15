"use client";

import { useEffect } from "react";

type IosNavigator = Navigator & { standalone?: boolean };
type FullscreenCapableRoot = HTMLElement & {
  requestFullscreen?: (options?: { navigationUI?: "auto" | "show" | "hide" }) => Promise<void>;
  webkitRequestFullscreen?: () => void | Promise<void>;
};
type LockableOrientation = {
  lock?: (orientation: string) => Promise<void>;
};

function isStandaloneDisplay(): boolean {
  return window.matchMedia?.("(display-mode: standalone)").matches
    || (navigator as IosNavigator).standalone === true;
}

async function lockLandscapeIfAvailable(): Promise<void> {
  const orientation = screen.orientation as unknown as LockableOrientation | undefined;
  if (!orientation?.lock) return;
  try {
    await orientation.lock("landscape");
  } catch {
    // iPhone Home Screen web apps already honor the manifest orientation.
  }
}

async function requestBrowserFullscreen(): Promise<void> {
  if (isStandaloneDisplay()) {
    await lockLandscapeIfAvailable();
    return;
  }

  const root = document.documentElement as FullscreenCapableRoot;
  try {
    if (root.requestFullscreen) {
      await root.requestFullscreen({ navigationUI: "hide" });
      await lockLandscapeIfAvailable();
      return;
    }
    if (root.webkitRequestFullscreen) {
      await Promise.resolve(root.webkitRequestFullscreen());
      await lockLandscapeIfAvailable();
    }
  } catch {
    // Browsers that do not permit element fullscreen continue in normal mode.
  }
}

export default function FullscreenPresentation() {
  useEffect(() => {
    let attempted = false;
    const onFirstGesture = () => {
      if (attempted) return;
      attempted = true;
      void requestBrowserFullscreen();
    };

    if (isStandaloneDisplay()) void lockLandscapeIfAvailable();
    window.addEventListener("pointerdown", onFirstGesture, { capture: true, passive: true });
    window.addEventListener("keydown", onFirstGesture, { capture: true });
    return () => {
      window.removeEventListener("pointerdown", onFirstGesture, true);
      window.removeEventListener("keydown", onFirstGesture, true);
    };
  }, []);

  return null;
}

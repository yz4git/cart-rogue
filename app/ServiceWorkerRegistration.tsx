"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const swUrl = new URL("./sw.js", window.location.href);
    const hadController = Boolean(navigator.serviceWorker.controller);
    let refreshed = false;
    const onControllerChange = () => {
      if (!hadController || refreshed) return;
      refreshed = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    void navigator.serviceWorker.register(swUrl.pathname, { updateViaCache: "none" }).then((registration) => {
      void registration.update();
      registration.waiting?.postMessage({ type: "SKIP_WAITING" });
    }).catch(() => undefined);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, []);
  return null;
}

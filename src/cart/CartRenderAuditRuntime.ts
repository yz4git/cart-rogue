import * as THREE from "three";
import { collectCartRenderDiagnostics } from "./CartRenderDiagnostics";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";

interface RenderAuditDemo {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  updateVisuals(delta: number): void;
}

const installed = new WeakSet<object>();

function publishRenderDiagnostics(demo: RenderAuditDemo): void {
  const diagnostics = collectCartRenderDiagnostics(demo.scene);
  demo.renderer.domElement.dataset.cartRenderDiagnostics = JSON.stringify(diagnostics);
  demo.scene.userData.cartRenderDiagnostics = diagnostics;
}

export function installCartRenderAuditRuntime(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as RenderAuditDemo;
  const originalUpdate = prototype.updateVisuals;
  prototype.updateVisuals = function cartRenderAuditUpdate(this: RenderAuditDemo, delta: number): void {
    originalUpdate.call(this, delta);
    const key = this as unknown as object;
    if (installed.has(key)) return;

    const refresh = () => publishRenderDiagnostics(this);
    this.renderer.domElement.addEventListener("cart-render-audit-request", refresh);
    publishRenderDiagnostics(this);
    installed.add(key);
  };
}

installCartRenderAuditRuntime();

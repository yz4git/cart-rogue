import "./CartRoguePhase102FaceImages";
import "./CartRoguePhase102OperatorMix";
import type { CartArenaSession } from "./CartArenaSession";
import { CartGameplayAuditRecorder } from "./CartGameplayAudit";
import type { CartRenderDiagnostics } from "./CartRenderDiagnostics";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";

interface GameplayAuditDemo {
  renderer: { domElement: HTMLCanvasElement };
  scene: { userData: Record<string, unknown> };
  session: CartArenaSession;
  boost: boolean;
  updateVisuals(delta: number): void;
}

interface GameplayAuditState {
  recorder: CartGameplayAuditRecorder;
  installed: boolean;
}

const states = new WeakMap<object, GameplayAuditState>();

function publishGameplayAudit(demo: GameplayAuditDemo, recorder: CartGameplayAuditRecorder): void {
  const renderDiagnostics = demo.scene.userData.cartRenderDiagnostics as CartRenderDiagnostics | undefined;
  const report = recorder.report(renderDiagnostics);
  demo.renderer.domElement.dataset.cartGameplayAudit = JSON.stringify(report);
  demo.scene.userData.cartGameplayAudit = report;
}

export function installCartGameplayAuditRuntime(): void {
  const prototype = CartRogueWebGLDemo.prototype as unknown as GameplayAuditDemo;
  const originalUpdate = prototype.updateVisuals;
  prototype.updateVisuals = function gameplayAuditUpdate(this: GameplayAuditDemo, delta: number): void {
    originalUpdate.call(this, delta);
    const key = this as unknown as object;
    let state = states.get(key);
    if (!state) {
      state = { recorder: new CartGameplayAuditRecorder(), installed: false };
      states.set(key, state);
    }

    state.recorder.record(this.session.snapshot(), delta, { boostRequested: this.boost });
    if (!state.installed) {
      const refresh = () => publishGameplayAudit(this, state?.recorder ?? new CartGameplayAuditRecorder());
      this.renderer.domElement.addEventListener("cart-gameplay-audit-request", refresh);
      state.installed = true;
    }
    publishGameplayAudit(this, state.recorder);
  };
}

installCartGameplayAuditRuntime();

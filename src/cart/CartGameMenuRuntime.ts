import "./CartRoguePhase103ConfigBalance";
import "./CartRoguePhase104ImpactAoeOverhaul";
import "./CartRoguePhase105EnemyIntelligenceBalance";
import "./CartRoguePhase106EncounterDirector2";
import "./CartRoguePhase107VisualHierarchyArcade";
import "./CartRoguePhase108CoreLoopBridge";
import "./CartRoguePhase108CoreLoopRebuild";
import "./CartRoguePhase109HandlingSmashDamage";
import "./CartRoguePhase110TurboDominoCoreLoop";
import "./CartRoguePhase111AudioOverdrive";
import { CartRogueCanvasPreview } from "./CartRogueCanvasPreview";
import { CartRogueWebGLDemo } from "./CartRogueWebGLDemo";

const MENU_PAUSE_EVENT = "cart-rogue-menu-pause";
const MENU_RESUME_EVENT = "cart-rogue-menu-resume";
const PATCHED_KEY = "__cartGameMenuRuntimePatched__";

interface MenuControllableDemo {
  setSteering(value: number): void;
  setBoost(active: boolean): void;
  setBrake(active: boolean): void;
  pause(): void;
  resume(): void;
  dispose(): void;
}

interface MenuBinding {
  pause: () => void;
  resume: () => void;
}

const bindings = new WeakMap<object, MenuBinding>();

function bindMenuEvents(instance: MenuControllableDemo): void {
  if (typeof window === "undefined" || bindings.has(instance as object)) return;

  const pause = () => {
    instance.setSteering(0);
    instance.setBoost(false);
    instance.setBrake(false);
    instance.pause();
  };
  const resume = () => instance.resume();

  window.addEventListener(MENU_PAUSE_EVENT, pause);
  window.addEventListener(MENU_RESUME_EVENT, resume);
  bindings.set(instance as object, { pause, resume });
}

function unbindMenuEvents(instance: MenuControllableDemo): void {
  if (typeof window === "undefined") return;
  const binding = bindings.get(instance as object);
  if (!binding) return;
  window.removeEventListener(MENU_PAUSE_EVENT, binding.pause);
  window.removeEventListener(MENU_RESUME_EVENT, binding.resume);
  bindings.delete(instance as object);
}

function patchDemoPrototype(prototype: MenuControllableDemo): void {
  const marker = prototype as unknown as Record<string, unknown>;
  if (marker[PATCHED_KEY]) return;
  marker[PATCHED_KEY] = true;

  const originalSetSteering = prototype.setSteering;
  prototype.setSteering = function patchedSetSteering(this: MenuControllableDemo, value: number): void {
    bindMenuEvents(this);
    originalSetSteering.call(this, value);
  };

  const originalSetBoost = prototype.setBoost;
  prototype.setBoost = function patchedSetBoost(this: MenuControllableDemo, active: boolean): void {
    bindMenuEvents(this);
    originalSetBoost.call(this, active);
  };

  const originalSetBrake = prototype.setBrake;
  prototype.setBrake = function patchedSetBrake(this: MenuControllableDemo, active: boolean): void {
    bindMenuEvents(this);
    originalSetBrake.call(this, active);
  };

  const originalDispose = prototype.dispose;
  prototype.dispose = function patchedDispose(this: MenuControllableDemo): void {
    unbindMenuEvents(this);
    originalDispose.call(this);
  };
}

patchDemoPrototype(CartRogueWebGLDemo.prototype as unknown as MenuControllableDemo);
patchDemoPrototype(CartRogueCanvasPreview.prototype as unknown as MenuControllableDemo);
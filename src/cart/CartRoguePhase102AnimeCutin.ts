import type { CartArenaSessionSnapshot } from "./CartArenaSession";
import { CartArenaSession } from "./CartArenaSession";
import { getCartRunDifficulty } from "./CartRunDifficulty";
import { isCartTurboHuntEnabled } from "./CartRoguePhase67TurboHunt";
import { getCartThreatDodgeState } from "./CartRoguePhase84ThreatDodge";

export type CartFaceEditorExpressionId =
  | "neutral"
  | "smile"
  | "happy"
  | "angry"
  | "sad"
  | "surprised"
  | "serious"
  | "blink";

export interface CartFaceEditorSerializablePolygonLayer {
  id: string;
  zIndex: number;
  positions: number[];
  colors: number[];
  indices: number[];
}

/**
 * Compatible read-only subset of yz4git/face-editor's CharacterBundle v1.
 * Cart Rogue intentionally consumes the exported polygon mesh instead of
 * importing the editor's part library/compiler, keeping the runtime small.
 */
export interface CartFaceEditorCharacterBundle {
  format: "face-editor-polygon-character";
  formatVersion: 1;
  definition?: unknown;
  expressions?: {
    active: CartFaceEditorExpressionId;
    set?: unknown;
  };
  mesh: {
    version: 1;
    layers: CartFaceEditorSerializablePolygonLayer[];
    bounds: { minX: number; minY: number; maxX: number; maxY: number };
  };
}

export type CartCutinCharacterId = "driver" | "operator";
export type CartCutinEventId =
  | "run_start"
  | "hard_start"
  | "titan_spawn"
  | "hard_critical"
  | "low_life"
  | "perfect_dodge"
  | "turbo_start"
  | "recovery";

export interface CartCutinEventDefinition {
  id: CartCutinEventId;
  characterId: CartCutinCharacterId;
  expression: CartFaceEditorExpressionId;
  line: string;
  priority: number;
  durationMs: number;
  cooldownMs: number;
  side: "left" | "right";
  interruptible: boolean;
}

export interface CartCutinInstance extends CartCutinEventDefinition {
  serial: number;
  startedAt: number;
  expiresAt: number;
}

export interface CartCutinQueueState {
  active: CartCutinInstance | null;
  pending: CartCutinInstance[];
  cooldownUntil: Record<string, number>;
  nextSerial: number;
}

export type CartCutinPortraitSource =
  | { kind: "face-editor-bundle"; bundle: CartFaceEditorCharacterBundle }
  | { kind: "image"; src: string; alt?: string };

export interface CartCutinCharacterDefinition {
  id: CartCutinCharacterId;
  displayName: string;
  accent: string;
  side: "left" | "right";
}

export const CART_ANIME_CUTIN_EVENT = "cart-anime-cutin";
export const CART_ANIME_CUTIN_SYSTEM = "anime-cutin-face-editor-compatible-v1";
export const CART_ANIME_CUTIN_MAX_PENDING = 2;
export const CART_FACE_EDITOR_BUNDLE_FORMAT = "face-editor-polygon-character";

export const CART_CUTIN_CHARACTERS: Record<CartCutinCharacterId, CartCutinCharacterDefinition> = {
  driver: { id: "driver", displayName: "DRIVER", accent: "#2f78ed", side: "right" },
  operator: { id: "operator", displayName: "OPERATOR", accent: "#ff5a9f", side: "left" },
};

export const CART_CUTIN_EVENTS: Record<CartCutinEventId, CartCutinEventDefinition> = {
  run_start: {
    id: "run_start",
    characterId: "driver",
    expression: "serious",
    line: "行くよ！",
    priority: 10,
    durationMs: 1350,
    cooldownMs: 60000,
    side: "right",
    interruptible: true,
  },
  hard_start: {
    id: "hard_start",
    characterId: "operator",
    expression: "serious",
    line: "油断しないで！",
    priority: 35,
    durationMs: 1500,
    cooldownMs: 60000,
    side: "left",
    interruptible: true,
  },
  titan_spawn: {
    id: "titan_spawn",
    characterId: "operator",
    expression: "surprised",
    line: "大型反応！ 来るよ！",
    priority: 100,
    durationMs: 1850,
    cooldownMs: 60000,
    side: "left",
    interruptible: false,
  },
  hard_critical: {
    id: "hard_critical",
    characterId: "operator",
    expression: "angry",
    line: "次の一撃で終わる！",
    priority: 90,
    durationMs: 1700,
    cooldownMs: 15000,
    side: "left",
    interruptible: true,
  },
  low_life: {
    id: "low_life",
    characterId: "driver",
    expression: "sad",
    line: "危ない…！ 回復しないと！",
    priority: 75,
    durationMs: 1600,
    cooldownMs: 15000,
    side: "right",
    interruptible: true,
  },
  perfect_dodge: {
    id: "perfect_dodge",
    characterId: "driver",
    expression: "happy",
    line: "今の完璧！",
    priority: 60,
    durationMs: 1050,
    cooldownMs: 5000,
    side: "right",
    interruptible: true,
  },
  turbo_start: {
    id: "turbo_start",
    characterId: "driver",
    expression: "angry",
    line: "押し切る！",
    priority: 30,
    durationMs: 900,
    cooldownMs: 6500,
    side: "right",
    interruptible: true,
  },
  recovery: {
    id: "recovery",
    characterId: "operator",
    expression: "happy",
    line: "回復セル確認！",
    priority: 25,
    durationMs: 1000,
    cooldownMs: 6000,
    side: "left",
    interruptible: true,
  },
};

export function createCartCutinQueueState(): CartCutinQueueState {
  return { active: null, pending: [], cooldownUntil: {}, nextSerial: 1 };
}

function startInstance(instance: CartCutinInstance, now: number): CartCutinInstance {
  return { ...instance, startedAt: now, expiresAt: now + instance.durationMs };
}

export function enqueueCartCutin(
  state: CartCutinQueueState,
  definition: CartCutinEventDefinition,
  now: number,
): "shown" | "interrupted" | "queued" | "cooldown" | "dropped" {
  const cooldown = state.cooldownUntil[definition.id] ?? 0;
  if (now < cooldown) return "cooldown";

  const instance: CartCutinInstance = {
    ...definition,
    serial: state.nextSerial++,
    startedAt: 0,
    expiresAt: 0,
  };
  state.cooldownUntil[definition.id] = now + definition.cooldownMs;

  if (!state.active) {
    state.active = startInstance(instance, now);
    return "shown";
  }

  if (definition.priority > state.active.priority && state.active.interruptible) {
    state.active = startInstance(instance, now);
    return "interrupted";
  }

  if (state.pending.length >= CART_ANIME_CUTIN_MAX_PENDING) return "dropped";
  if (state.pending.some((candidate) => candidate.id === definition.id)) return "dropped";
  state.pending.push(instance);
  state.pending.sort((a, b) => b.priority - a.priority || a.serial - b.serial);
  return "queued";
}

export function advanceCartCutinQueue(state: CartCutinQueueState, now: number): boolean {
  if (state.active && now < state.active.expiresAt) return false;
  const previousSerial = state.active?.serial ?? -1;
  const next = state.pending.shift() ?? null;
  state.active = next ? startInstance(next, now) : null;
  return previousSerial !== (state.active?.serial ?? -1);
}

export function resetCartCutinQueue(state: CartCutinQueueState): void {
  state.active = null;
  state.pending.length = 0;
  state.cooldownUntil = {};
  state.nextSerial = 1;
}

const portraitRegistry = new Map<
  CartCutinCharacterId,
  Partial<Record<CartFaceEditorExpressionId, CartCutinPortraitSource>>
>();

export function registerCartCutinFaceEditorBundle(
  characterId: CartCutinCharacterId,
  bundle: CartFaceEditorCharacterBundle,
  expression: CartFaceEditorExpressionId = bundle.expressions?.active ?? "neutral",
): boolean {
  if (bundle.format !== CART_FACE_EDITOR_BUNDLE_FORMAT || bundle.formatVersion !== 1 || bundle.mesh?.version !== 1) return false;
  const current = portraitRegistry.get(characterId) ?? {};
  current[expression] = { kind: "face-editor-bundle", bundle };
  portraitRegistry.set(characterId, current);
  return true;
}

export function registerCartCutinImagePortrait(
  characterId: CartCutinCharacterId,
  expression: CartFaceEditorExpressionId,
  src: string,
): void {
  const current = portraitRegistry.get(characterId) ?? {};
  current[expression] = { kind: "image", src };
  portraitRegistry.set(characterId, current);
}

interface FallbackProfile {
  skin: string;
  hair: string;
  eyes: string;
  jacket: string;
  accent: string;
  hairSide: -1 | 1;
}

const FALLBACK_PROFILES: Record<CartCutinCharacterId, FallbackProfile> = {
  driver: {
    skin: "#f6c9a7",
    hair: "#243a70",
    eyes: "#48c8ff",
    jacket: "#2f78ed",
    accent: "#ff5b50",
    hairSide: 1,
  },
  operator: {
    skin: "#f5c8ae",
    hair: "#5c356f",
    eyes: "#64d9c8",
    jacket: "#fff0d7",
    accent: "#ff5a9f",
    hairSide: -1,
  },
};

function colorFloats(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

interface FallbackLayerDraft {
  id: string;
  zIndex: number;
  positions: number[];
  colors: number[];
  indices: number[];
}

function layerDraft(id: string, zIndex: number): FallbackLayerDraft {
  return { id, zIndex, positions: [], colors: [], indices: [] };
}

function addTriangle(
  layer: FallbackLayerDraft,
  points: readonly (readonly [number, number])[],
  color: string,
): void {
  const base = layer.positions.length / 3;
  const rgb = colorFloats(color);
  for (const [x, y] of points) {
    layer.positions.push(x, y, 0);
    layer.colors.push(...rgb);
  }
  layer.indices.push(base, base + 1, base + 2);
}

function addQuad(
  layer: FallbackLayerDraft,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
): void {
  addTriangle(layer, [[x0, y0], [x1, y0], [x1, y1]], color);
  addTriangle(layer, [[x0, y0], [x1, y1], [x0, y1]], color);
}

function buildFallbackFaceEditorBundle(
  characterId: CartCutinCharacterId,
  expression: CartFaceEditorExpressionId,
): CartFaceEditorCharacterBundle {
  const p = FALLBACK_PROFILES[characterId];
  const back = layerDraft("hair-back", 1);
  const body = layerDraft("jacket", 2);
  const face = layerDraft("face", 3);
  const hair = layerDraft("hair-front", 4);
  const eyes = layerDraft("eyes", 5);
  const brows = layerDraft("brows", 6);
  const mouth = layerDraft("mouth", 7);
  const accent = layerDraft("accent", 8);

  addTriangle(back, [[-0.73, 0.32], [0.73, 0.32], [0, 1.24]], p.hair);
  addQuad(back, -0.72, -0.16, 0.72, 0.46, p.hair);
  if (p.hairSide > 0) addTriangle(back, [[0.48, 0.35], [1.04, 0.08], [0.62, -0.62]], p.hair);
  else addTriangle(back, [[-0.48, 0.35], [-1.04, 0.08], [-0.62, -0.62]], p.hair);

  addTriangle(body, [[-0.92, -1.12], [0.92, -1.12], [0.63, -0.28]], p.jacket);
  addTriangle(body, [[-0.92, -1.12], [0.63, -0.28], [-0.63, -0.28]], p.jacket);
  addTriangle(accent, [[-0.1, -0.38], [0.48, -0.94], [0.12, -1.1]], p.accent);

  addTriangle(face, [[-0.61, 0.66], [0.61, 0.66], [0.48, -0.14]], p.skin);
  addTriangle(face, [[-0.61, 0.66], [0.48, -0.14], [0, -0.42]], p.skin);
  addTriangle(face, [[-0.61, 0.66], [0, -0.42], [-0.48, -0.14]], p.skin);

  addTriangle(hair, [[-0.66, 0.62], [-0.48, 1.02], [0.07, 0.76]], p.hair);
  addTriangle(hair, [[-0.48, 1.02], [0.62, 0.66], [0.07, 0.76]], p.hair);
  addTriangle(hair, [[-0.18, 0.84], [0.23, 1.03], [0.16, 0.58]], p.hair);

  const eyeY = expression === "surprised" ? 0.33 : expression === "sad" ? 0.27 : 0.3;
  const eyeH = expression === "blink" ? 0.025 : expression === "surprised" ? 0.13 : 0.085;
  for (const side of [-1, 1] as const) {
    const cx = side * 0.27;
    addTriangle(eyes, [[cx - 0.14, eyeY], [cx + 0.14, eyeY], [cx, eyeY - eyeH]], "#ffffff");
    if (expression !== "blink") {
      addTriangle(eyes, [[cx - 0.055, eyeY - 0.01], [cx + 0.055, eyeY - 0.01], [cx, eyeY - eyeH * 0.92]], p.eyes);
    }
  }

  const angry = expression === "angry" || expression === "serious";
  const sad = expression === "sad";
  for (const side of [-1, 1] as const) {
    const cx = side * 0.28;
    const tilt = angry ? side * -0.05 : sad ? side * 0.045 : 0;
    addTriangle(
      brows,
      [[cx - 0.14, 0.49 + tilt], [cx + 0.14, 0.49 - tilt], [cx + 0.13, 0.525 - tilt]],
      p.hair,
    );
  }

  if (expression === "happy" || expression === "smile") {
    addTriangle(mouth, [[-0.18, -0.04], [0.18, -0.04], [0, -0.2]], "#b64f66");
  } else if (expression === "surprised") {
    addQuad(mouth, -0.09, -0.19, 0.09, 0.02, "#9d435b");
  } else if (expression === "angry" || expression === "sad") {
    addTriangle(mouth, [[-0.16, -0.14], [0.16, -0.14], [0, -0.07]], "#8f4051");
  } else {
    addQuad(mouth, -0.14, -0.105, 0.14, -0.07, "#8f4051");
  }

  return {
    format: CART_FACE_EDITOR_BUNDLE_FORMAT,
    formatVersion: 1,
    expressions: { active: expression },
    mesh: {
      version: 1,
      bounds: { minX: -1.08, minY: -1.14, maxX: 1.08, maxY: 1.26 },
      layers: [back, body, face, hair, eyes, brows, mouth, accent],
    },
  };
}

const fallbackBundleCache = new Map<string, CartFaceEditorCharacterBundle>();

function portraitSourceFor(
  characterId: CartCutinCharacterId,
  expression: CartFaceEditorExpressionId,
): CartCutinPortraitSource {
  const registered = portraitRegistry.get(characterId);
  const direct = registered?.[expression] ?? registered?.serious ?? registered?.neutral;
  if (direct) return direct;
  const key = `${characterId}:${expression}`;
  let bundle = fallbackBundleCache.get(key);
  if (!bundle) {
    bundle = buildFallbackFaceEditorBundle(characterId, expression);
    fallbackBundleCache.set(key, bundle);
  }
  return { kind: "face-editor-bundle", bundle };
}

export function renderCartFaceEditorBundleToCanvas(
  bundle: CartFaceEditorCharacterBundle,
  canvas: HTMLCanvasElement,
): boolean {
  if (
    bundle.format !== CART_FACE_EDITOR_BUNDLE_FORMAT
    || bundle.formatVersion !== 1
    || bundle.mesh?.version !== 1
    || !Array.isArray(bundle.mesh.layers)
  ) return false;

  const context = canvas.getContext("2d");
  if (!context) return false;
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);

  const bounds = bundle.mesh.bounds;
  const fullWidth = Math.max(0.001, bounds.maxX - bounds.minX);
  const fullHeight = Math.max(0.001, bounds.maxY - bounds.minY);
  // Face Editor exports a full upper-body character. For dialogue cut-ins we crop
  // the lowest ~32% while retaining shoulders, face, hair and tall hairstyles.
  const portraitMinY = Math.max(bounds.minY, bounds.maxY - fullHeight * 0.68);
  const portraitHeight = Math.max(0.001, bounds.maxY - portraitMinY);
  const scale = Math.min((width * 0.94) / fullWidth, (height * 0.96) / portraitHeight);
  const offsetX = width * 0.5 - ((bounds.minX + bounds.maxX) * 0.5) * scale;
  const offsetY = height * 0.04 + bounds.maxY * scale;

  const layers = [...bundle.mesh.layers].sort((a, b) => a.zIndex - b.zIndex);
  for (const layer of layers) {
    const { positions, colors, indices } = layer;
    for (let i = 0; i + 2 < indices.length; i += 3) {
      const ia = indices[i] * 3;
      const ib = indices[i + 1] * 3;
      const ic = indices[i + 2] * 3;
      if (ic + 2 >= positions.length || ia + 2 >= colors.length) continue;
      const r = Math.round(Math.max(0, Math.min(1, colors[ia])) * 255);
      const g = Math.round(Math.max(0, Math.min(1, colors[ia + 1])) * 255);
      const b = Math.round(Math.max(0, Math.min(1, colors[ia + 2])) * 255);
      context.fillStyle = `rgb(${r} ${g} ${b})`;
      context.beginPath();
      context.moveTo(positions[ia] * scale + offsetX, offsetY - positions[ia + 1] * scale);
      context.lineTo(positions[ib] * scale + offsetX, offsetY - positions[ib + 1] * scale);
      context.lineTo(positions[ic] * scale + offsetX, offsetY - positions[ic + 1] * scale);
      context.closePath();
      context.fill();
    }
  }
  return true;
}

interface CutinPresenter {
  root: HTMLDivElement;
  canvas: HTMLCanvasElement;
  speaker: HTMLDivElement;
  line: HTMLDivElement;
  expression: HTMLDivElement;
  currentSerial: number;
}

let presenter: CutinPresenter | null = null;
let runtimeTimer: ReturnType<typeof setTimeout> | null = null;
const runtimeQueue = createCartCutinQueueState();
let runtimeSession: object | null = null;

const CUTIN_STYLE_ID = "cart-anime-cutin-style-v1";
const CUTIN_ROOT_ID = "cart-anime-cutin-v1";

function ensureCutinStyle(): void {
  if (typeof document === "undefined" || document.getElementById(CUTIN_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = CUTIN_STYLE_ID;
  style.textContent = `
#${CUTIN_ROOT_ID}{position:fixed;z-index:72;top:max(calc(env(safe-area-inset-top) + 22px),22px);right:max(calc(env(safe-area-inset-right) + 12px),12px);width:min(44vw,430px);height:clamp(108px,42vh,158px);pointer-events:none;opacity:0;transform:translateX(112%);transition:transform .2s cubic-bezier(.2,.9,.25,1),opacity .14s ease;filter:drop-shadow(0 7px 12px rgba(22,37,67,.24));font-family:ui-rounded,"Arial Rounded MT Bold",system-ui,sans-serif;color:#182746;contain:layout paint style}
#${CUTIN_ROOT_ID}[data-side="left"]{left:max(calc(env(safe-area-inset-left) + 12px),12px);right:auto;transform:translateX(-112%)}
#${CUTIN_ROOT_ID}[data-visible="true"]{opacity:1;transform:translateX(0)}
#${CUTIN_ROOT_ID} .cart-cutin-shell{position:absolute;inset:0;display:flex;align-items:stretch;overflow:hidden;clip-path:polygon(8% 0,100% 0,92% 100%,0 100%);background:linear-gradient(118deg,rgba(255,255,255,.97),rgba(245,249,255,.95));border:3px solid var(--cart-cutin-accent,#2f78ed)}
#${CUTIN_ROOT_ID}[data-side="left"] .cart-cutin-shell{clip-path:polygon(0 0,92% 0,100% 100%,8% 100%)}
#${CUTIN_ROOT_ID} .cart-cutin-portrait{width:38%;min-width:104px;height:100%;background:linear-gradient(160deg,var(--cart-cutin-accent,#2f78ed),#d8f5ff 78%);clip-path:polygon(0 0,100% 0,82% 100%,0 100%)}
#${CUTIN_ROOT_ID}[data-side="left"] .cart-cutin-portrait{order:2;clip-path:polygon(18% 0,100% 0,100% 100%,0 100%)}
#${CUTIN_ROOT_ID} canvas{display:block;width:100%;height:100%}
#${CUTIN_ROOT_ID} .cart-cutin-copy{flex:1;min-width:0;padding:13px 22px 10px 12px;display:flex;flex-direction:column;justify-content:center;gap:4px}
#${CUTIN_ROOT_ID}[data-side="left"] .cart-cutin-copy{padding-left:22px;padding-right:10px}
#${CUTIN_ROOT_ID} .cart-cutin-speaker{font-size:clamp(11px,1.45vw,15px);font-weight:950;letter-spacing:.12em;color:var(--cart-cutin-accent,#2f78ed)}
#${CUTIN_ROOT_ID} .cart-cutin-line{font-size:clamp(17px,2.45vw,27px);font-weight:950;line-height:1.08;white-space:normal;text-wrap:balance;text-shadow:0 1px 0 #fff}
#${CUTIN_ROOT_ID} .cart-cutin-expression{align-self:flex-start;margin-top:2px;padding:2px 7px;border-radius:999px;background:var(--cart-cutin-accent,#2f78ed);color:#fff;font-size:9px;font-weight:900;letter-spacing:.08em}
#${CUTIN_ROOT_ID}[data-priority="critical"] .cart-cutin-shell{animation:cartCutinCritical .18s linear 2}
@keyframes cartCutinCritical{0%,100%{transform:translateX(0)}50%{transform:translateX(4px)}}
@media(max-height:360px){#${CUTIN_ROOT_ID}{top:max(calc(env(safe-area-inset-top) + 9px),9px);width:min(45vw,390px);height:112px}#${CUTIN_ROOT_ID} .cart-cutin-copy{padding-top:8px;padding-bottom:7px}#${CUTIN_ROOT_ID} .cart-cutin-line{font-size:clamp(15px,2.2vw,21px)}#${CUTIN_ROOT_ID} .cart-cutin-expression{display:none}}
@media(max-width:650px){#${CUTIN_ROOT_ID}{width:min(54vw,360px)}}
`;
  document.head.appendChild(style);
}

function ensurePresenter(): CutinPresenter | null {
  if (typeof document === "undefined") return null;
  if (presenter && presenter.root.isConnected) return presenter;
  ensureCutinStyle();
  const root = document.createElement("div");
  root.id = CUTIN_ROOT_ID;
  root.dataset.cartAnimeCutin = CART_ANIME_CUTIN_SYSTEM;
  root.dataset.visible = "false";
  root.setAttribute("aria-live", "polite");

  const shell = document.createElement("div");
  shell.className = "cart-cutin-shell";
  const portrait = document.createElement("div");
  portrait.className = "cart-cutin-portrait";
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 220;
  portrait.appendChild(canvas);
  const copy = document.createElement("div");
  copy.className = "cart-cutin-copy";
  const speaker = document.createElement("div");
  speaker.className = "cart-cutin-speaker";
  const line = document.createElement("div");
  line.className = "cart-cutin-line";
  const expression = document.createElement("div");
  expression.className = "cart-cutin-expression";
  copy.append(speaker, line, expression);
  shell.append(portrait, copy);
  root.appendChild(shell);
  document.body.appendChild(root);
  presenter = { root, canvas, speaker, line, expression, currentSerial: -1 };
  return presenter;
}

function drawImagePortrait(source: Extract<CartCutinPortraitSource, { kind: "image" }>, canvas: HTMLCanvasElement): void {
  if (typeof Image === "undefined") return;
  const image = new Image();
  image.decoding = "async";
  image.onload = () => {
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const scale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.drawImage(image, (canvas.width - width) * 0.5, (canvas.height - height) * 0.5, width, height);
  };
  image.src = source.src;
}

function renderPortrait(instance: CartCutinInstance, canvas: HTMLCanvasElement): void {
  const source = portraitSourceFor(instance.characterId, instance.expression);
  if (source.kind === "face-editor-bundle") {
    renderCartFaceEditorBundleToCanvas(source.bundle, canvas);
  } else {
    // Keep a deterministic bundle visible until an image asset has decoded.
    renderCartFaceEditorBundleToCanvas(buildFallbackFaceEditorBundle(instance.characterId, instance.expression), canvas);
    drawImagePortrait(source, canvas);
  }
}

function hidePresenter(): void {
  if (!presenter) return;
  presenter.root.dataset.visible = "false";
  presenter.currentSerial = -1;
}

function syncPresenter(): void {
  if (typeof window === "undefined") return;
  const active = runtimeQueue.active;
  if (!active) {
    hidePresenter();
    return;
  }
  const view = ensurePresenter();
  if (!view || view.currentSerial === active.serial) return;
  const character = CART_CUTIN_CHARACTERS[active.characterId];
  view.currentSerial = active.serial;
  view.root.dataset.side = active.side;
  view.root.dataset.visible = "true";
  view.root.dataset.event = active.id;
  view.root.dataset.character = active.characterId;
  view.root.dataset.expression = active.expression;
  view.root.dataset.priority = active.priority >= 75 ? "critical" : "normal";
  view.root.style.setProperty("--cart-cutin-accent", character.accent);
  view.speaker.textContent = character.displayName;
  view.line.textContent = active.line;
  view.expression.textContent = active.expression.toUpperCase();
  renderPortrait(active, view.canvas);
  window.dispatchEvent(new CustomEvent<CartCutinInstance>(CART_ANIME_CUTIN_EVENT, { detail: { ...active } }));
}

function scheduleRuntimeAdvance(): void {
  if (runtimeTimer !== null) clearTimeout(runtimeTimer);
  runtimeTimer = null;
  const active = runtimeQueue.active;
  if (!active || typeof window === "undefined") return;
  const delay = Math.max(16, active.expiresAt - Date.now() + 8);
  runtimeTimer = setTimeout(() => {
    runtimeTimer = null;
    advanceCartCutinQueue(runtimeQueue, Date.now());
    syncPresenter();
    scheduleRuntimeAdvance();
  }, delay);
}

export function enqueueCartAnimeCutin(eventId: CartCutinEventId, now = Date.now()): string {
  advanceCartCutinQueue(runtimeQueue, now);
  const result = enqueueCartCutin(runtimeQueue, CART_CUTIN_EVENTS[eventId], now);
  syncPresenter();
  scheduleRuntimeAdvance();
  return result;
}

interface Phase102PreviousSnapshot {
  gas: number;
  boostActive: boolean;
  huntBossSpawned: boolean;
  resourceCollected: Map<string, boolean>;
}

interface Phase102SessionState {
  started: boolean;
  previous: Phase102PreviousSnapshot | null;
  perfectDodgeSerial: number;
}

interface Phase102ExtendedSnapshot extends CartArenaSessionSnapshot {
  huntBossSpawned?: boolean;
}

interface Phase102Session {
  snapshot(): CartArenaSessionSnapshot;
}

const sessionState = new WeakMap<object, Phase102SessionState>();

function snapshotMemory(snapshot: Phase102ExtendedSnapshot): Phase102PreviousSnapshot {
  return {
    gas: snapshot.gas,
    boostActive: snapshot.boostActive,
    huntBossSpawned: Boolean(snapshot.huntBossSpawned),
    resourceCollected: new Map(snapshot.resources.map((resource) => [resource.id, resource.collected])),
  };
}

function newlyCollectedGas(previous: Phase102PreviousSnapshot, snapshot: Phase102ExtendedSnapshot): boolean {
  return snapshot.resources.some(
    (resource) => resource.kind === "gas"
      && resource.collected
      && previous.resourceCollected.get(resource.id) === false,
  );
}

function processCutinSnapshot(session: CartArenaSession, snapshot: Phase102ExtendedSnapshot): void {
  if (!isCartTurboHuntEnabled(session)) return;
  const key = session as unknown as object;
  let state = sessionState.get(key);
  const threat = getCartThreatDodgeState(session);
  if (!state) {
    state = { started: false, previous: null, perfectDodgeSerial: threat.perfectDodgeSerial };
    sessionState.set(key, state);
  }

  if (runtimeSession !== key) {
    runtimeSession = key;
    resetCartCutinQueue(runtimeQueue);
    if (runtimeTimer !== null) clearTimeout(runtimeTimer);
    runtimeTimer = null;
    hidePresenter();
  }

  const difficulty = getCartRunDifficulty();
  if (!state.started) {
    state.started = true;
    enqueueCartAnimeCutin(difficulty === "hard" ? "hard_start" : "run_start");
  }

  const previous = state.previous;
  if (previous) {
    if (snapshot.huntBossSpawned && !previous.huntBossSpawned) enqueueCartAnimeCutin("titan_spawn");

    if (difficulty === "hard" && snapshot.gas <= 0.34 && previous.gas > 0.34) {
      enqueueCartAnimeCutin("hard_critical");
    } else if (difficulty === "normal" && snapshot.gas <= 0.3 && previous.gas > 0.3) {
      enqueueCartAnimeCutin("low_life");
    }

    if (threat.perfectDodgeSerial > state.perfectDodgeSerial) enqueueCartAnimeCutin("perfect_dodge");
    if (newlyCollectedGas(previous, snapshot)) enqueueCartAnimeCutin("recovery");
    if (snapshot.boostActive && !previous.boostActive) enqueueCartAnimeCutin("turbo_start");
  }

  state.perfectDodgeSerial = threat.perfectDodgeSerial;
  state.previous = snapshotMemory(snapshot);
}

export function installCartRoguePhase102AnimeCutin(): void {
  const prototype = CartArenaSession.prototype as unknown as Phase102Session;
  const previousSnapshot = prototype.snapshot;
  prototype.snapshot = function phase102AnimeCutinSnapshot(this: Phase102Session): CartArenaSessionSnapshot {
    const snapshot = previousSnapshot.call(this);
    processCutinSnapshot(this as unknown as CartArenaSession, snapshot as Phase102ExtendedSnapshot);
    return snapshot;
  };
}

installCartRoguePhase102AnimeCutin();

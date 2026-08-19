export interface CartRogueConfig {
  cameraDistance: number;
}

export const CART_ROGUE_CONFIG_STORAGE_KEY = "cart-rogue.config.v1";
export const CART_ROGUE_CONFIG_EVENT = "cart-rogue-config-changed";
export const CART_ROGUE_CAMERA_DISTANCE_MIN = 1;
export const CART_ROGUE_CAMERA_DISTANCE_MAX = 1.6;
export const CART_ROGUE_CAMERA_DISTANCE_STEP = 0.05;

export const DEFAULT_CART_ROGUE_CONFIG: CartRogueConfig = {
  cameraDistance: 1,
};

function clampCameraDistance(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_CART_ROGUE_CONFIG.cameraDistance;
  return Math.min(CART_ROGUE_CAMERA_DISTANCE_MAX, Math.max(CART_ROGUE_CAMERA_DISTANCE_MIN, numeric));
}

export function parseCartRogueConfig(value: unknown): CartRogueConfig {
  if (!value || typeof value !== "object") return { ...DEFAULT_CART_ROGUE_CONFIG };
  const input = value as Partial<CartRogueConfig>;
  return {
    cameraDistance: clampCameraDistance(input.cameraDistance),
  };
}

export function loadCartRogueConfig(): CartRogueConfig {
  if (typeof window === "undefined") return { ...DEFAULT_CART_ROGUE_CONFIG };
  try {
    const raw = window.localStorage.getItem(CART_ROGUE_CONFIG_STORAGE_KEY);
    return raw ? parseCartRogueConfig(JSON.parse(raw)) : { ...DEFAULT_CART_ROGUE_CONFIG };
  } catch {
    return { ...DEFAULT_CART_ROGUE_CONFIG };
  }
}

export function saveCartRogueConfig(value: CartRogueConfig): CartRogueConfig {
  const normalized = parseCartRogueConfig(value);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(CART_ROGUE_CONFIG_STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // Storage can be unavailable in private/restricted contexts; the runtime
      // still receives the in-memory setting through the event below.
    }
    window.dispatchEvent(new CustomEvent<CartRogueConfig>(CART_ROGUE_CONFIG_EVENT, { detail: normalized }));
  }
  return normalized;
}

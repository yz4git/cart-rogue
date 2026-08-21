import {
  CART_ANIME_CUTIN_EVENT,
  CART_CUTIN_EVENTS,
  type CartCutinEventDefinition,
  type CartCutinEventId,
  type CartCutinInstance,
} from "./CartRoguePhase102AnimeCutin";

type SpeakerVariant = Pick<
  CartCutinEventDefinition,
  "characterId" | "expression" | "line" | "side"
>;

/**
 * Presentation-only speaker rotation.
 * High-frequency moments deliberately lean toward OPERATOR while still
 * returning to DRIVER often enough that the player character keeps a voice.
 * Cycles are deterministic so audits and replays stay stable.
 */
export const CART_CUTIN_SPEAKER_CYCLES: Record<CartCutinEventId, readonly SpeakerVariant[]> = {
  run_start: [
    { characterId: "operator", expression: "serious", line: "ルート確認、スタート！", side: "left" },
    { characterId: "driver", expression: "serious", line: "行くよ！", side: "right" },
    { characterId: "operator", expression: "happy", line: "準備OK、行こう！", side: "left" },
  ],
  hard_start: [
    { characterId: "operator", expression: "serious", line: "油断しないで！", side: "left" },
  ],
  titan_spawn: [
    { characterId: "operator", expression: "surprised", line: "大型反応！ 来るよ！", side: "left" },
  ],
  hard_critical: [
    { characterId: "operator", expression: "angry", line: "次の一撃で終わる！", side: "left" },
  ],
  low_life: [
    { characterId: "operator", expression: "surprised", line: "GASが危険域！ 回復して！", side: "left" },
    { characterId: "driver", expression: "sad", line: "危ない…！ 回復しないと！", side: "right" },
    { characterId: "operator", expression: "serious", line: "無理しないで、回復優先！", side: "left" },
  ],
  perfect_dodge: [
    { characterId: "operator", expression: "happy", line: "ナイス回避！", side: "left" },
    { characterId: "driver", expression: "happy", line: "今の完璧！", side: "right" },
    { characterId: "operator", expression: "smile", line: "その調子！", side: "left" },
  ],
  turbo_start: [
    { characterId: "operator", expression: "serious", line: "ターボ、今！", side: "left" },
    { characterId: "driver", expression: "angry", line: "押し切る！", side: "right" },
    { characterId: "operator", expression: "happy", line: "そのまま突っ切って！", side: "left" },
    { characterId: "operator", expression: "serious", line: "出力上昇、行けるよ！", side: "left" },
  ],
  recovery: [
    { characterId: "operator", expression: "happy", line: "回復セル確認！", side: "left" },
  ],
};

export const CART_CUTIN_OPERATOR_MIX_SHARE = (() => {
  const variants = Object.values(CART_CUTIN_SPEAKER_CYCLES).flat();
  return variants.filter((variant) => variant.characterId === "operator").length / variants.length;
})();

const cycleIndex = new Map<CartCutinEventId, number>();

export function cartCutinSpeakerVariant(
  eventId: CartCutinEventId,
  index = cycleIndex.get(eventId) ?? 0,
): SpeakerVariant {
  const cycle = CART_CUTIN_SPEAKER_CYCLES[eventId];
  return cycle[index % cycle.length];
}

function applySpeakerVariant(eventId: CartCutinEventId, index: number): void {
  Object.assign(CART_CUTIN_EVENTS[eventId], cartCutinSpeakerVariant(eventId, index));
}

export function resetCartCutinSpeakerMix(): void {
  cycleIndex.clear();
  for (const eventId of Object.keys(CART_CUTIN_SPEAKER_CYCLES) as CartCutinEventId[]) {
    applySpeakerVariant(eventId, 0);
  }
}

export function rotateCartCutinSpeaker(eventId: CartCutinEventId): SpeakerVariant {
  const next = (cycleIndex.get(eventId) ?? 0) + 1;
  cycleIndex.set(eventId, next);
  applySpeakerVariant(eventId, next);
  return cartCutinSpeakerVariant(eventId, next);
}

export function installCartRoguePhase102OperatorMix(): void {
  resetCartCutinSpeakerMix();
  if (typeof window === "undefined") return;
  window.addEventListener(CART_ANIME_CUTIN_EVENT, (event) => {
    const detail = (event as CustomEvent<CartCutinInstance>).detail;
    if (!detail?.id) return;
    // Later phases may register presentation events without widening the Phase102
    // compile-time union. Leave those events to their owning phase instead of
    // indexing the deterministic speaker table with an unknown runtime id.
    if (!(detail.id in CART_CUTIN_SPEAKER_CYCLES)) return;
    rotateCartCutinSpeaker(detail.id);
  });
}

installCartRoguePhase102OperatorMix();

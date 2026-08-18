"use client";

import "../src/cart/CartRogueRuntime";
import CartRogueGame from "./CartRogueGame";
import CartTurboHuntHudOverlay from "./CartTurboHuntHudOverlay";
import CartCombatReadabilityPass from "./CartCombatReadabilityPass";

export default function CartRogueGamePhase13() {
  return <>
    <CartRogueGame />
    <CartTurboHuntHudOverlay />
    <CartCombatReadabilityPass />
  </>;
}

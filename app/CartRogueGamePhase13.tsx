"use client";

import { useState } from "react";
import "../src/cart/CartRogueRuntime";
import "../src/cart/CartGameMenuRuntime";
import CartRogueGame from "./CartRogueGame";
import CartTurboHuntHudOverlay from "./CartTurboHuntHudOverlay";
import CartCombatReadabilityPass from "./CartCombatReadabilityPass";
import CartGameMenu from "./CartGameMenu";

export default function CartRogueGamePhase13() {
  const [started, setStarted] = useState(false);

  return <>
    {started && <>
      <CartRogueGame />
      <CartTurboHuntHudOverlay />
      <CartCombatReadabilityPass />
    </>}
    <CartGameMenu started={started} onStart={() => setStarted(true)} />
  </>;
}

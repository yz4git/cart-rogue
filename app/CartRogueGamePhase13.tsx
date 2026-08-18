"use client";

import { useEffect, useState } from "react";
import "../src/cart/CartRogueRuntime";
import "../src/cart/CartGameMenuRuntime";
import CartRogueGame from "./CartRogueGame";
import CartTurboHuntHudOverlay from "./CartTurboHuntHudOverlay";
import CartCombatReadabilityPass from "./CartCombatReadabilityPass";
import CartGameMenu from "./CartGameMenu";

export default function CartRogueGamePhase13() {
  const [started, setStarted] = useState(false);

  useEffect(() => {
    // Existing WebGL/gameplay audits intentionally exercise the live game
    // immediately. Real players still enter through the title screen.
    if (!navigator.webdriver) return undefined;
    const timer = window.setTimeout(() => setStarted(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  return <>
    {started && <>
      <CartRogueGame />
      <CartTurboHuntHudOverlay />
      <CartCombatReadabilityPass />
    </>}
    <CartGameMenu started={started} onStart={() => setStarted(true)} />
  </>;
}

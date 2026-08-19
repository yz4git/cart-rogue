"use client";

import { Fragment, useEffect, useState } from "react";
import "../src/cart/CartRogueRuntime";
import "../src/cart/CartGameMenuRuntime";
import { setCartRunDifficulty, type CartRunDifficulty } from "../src/cart/CartRunDifficulty";
import CartRogueGame from "./CartRogueGame";
import CartTurboHuntHudOverlay from "./CartTurboHuntHudOverlay";
import CartCombatReadabilityPass from "./CartCombatReadabilityPass";
import CartGameMenu from "./CartGameMenu";

export default function CartRogueGamePhase13() {
  const [started, setStarted] = useState(false);
  const [runKey, setRunKey] = useState(0);

  const startRun = (difficulty: CartRunDifficulty) => {
    setCartRunDifficulty(difficulty);
    setRunKey((value) => value + 1);
    setStarted(true);
  };

  useEffect(() => {
    // Existing WebGL/gameplay audits intentionally exercise the live game
    // immediately on NORMAL. Real players still enter through the title screen.
    if (!navigator.webdriver) return undefined;
    const timer = window.setTimeout(() => {
      setCartRunDifficulty("normal");
      setStarted(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  return <>
    {started && (
      <Fragment key={runKey}>
        <CartRogueGame />
        <CartTurboHuntHudOverlay />
        <CartCombatReadabilityPass />
      </Fragment>
    )}
    <CartGameMenu
      started={started}
      onStart={startRun}
      onReturnTitle={() => setStarted(false)}
    />
  </>;
}

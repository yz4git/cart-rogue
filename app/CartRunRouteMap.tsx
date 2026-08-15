"use client";

import {
  cartUpcomingRouteChoices,
  cartWorldNodeById,
  type CartRouteChoice,
  type CartRouteType,
} from "../src/cart/CartWorldGraph";
import styles from "./CartRunRouteMap.module.css";

interface Props {
  nodeId: string;
  gateLocked: boolean;
}

const TYPE_LABEL: Record<CartRouteType, string> = {
  combat: "BRAWL",
  elite: "ELITE",
  service: "FUEL",
  scrap: "SCRAP",
  event: "EVENT",
  boss: "BOSS",
  transit: "ROAD",
};

function routeSide(choice: CartRouteChoice): string {
  if (choice.lane === "left") return "← LEFT";
  if (choice.lane === "right") return "RIGHT →";
  return "CENTER";
}

export default function CartRunRouteMap({ nodeId, gateLocked }: Props) {
  const currentNode = cartWorldNodeById(nodeId);
  if (!currentNode || currentNode.next.length < 2) return null;

  const choices = cartUpcomingRouteChoices(nodeId);
  if (choices.length < 2) return null;
  return (
    <aside className={styles.panel} aria-label="Upcoming route fork">
      <div className={styles.head}>
        <span>RUN MAP · ROUTE FORK</span>
        <strong>{gateLocked ? "CLEAR ROOM TO UNLOCK" : "STEER INTO A ROUTE"}</strong>
      </div>
      <div className={styles.branches}>
        {choices.map((choice) => (
          <div key={choice.nodeId} className={`${styles.branch} ${styles[choice.routeType]}`}>
            <div className={styles.side}>{routeSide(choice)}</div>
            <div className={styles.type}>{TYPE_LABEL[choice.routeType]}</div>
            <strong>{choice.label}</strong>
            <small>{choice.rewardHint}</small>
            <div className={styles.danger} aria-label={`Danger ${choice.danger} of 3`}>
              {Array.from({ length: 3 }, (_, index) => <i key={index} className={index < choice.danger ? styles.hot : ""} />)}
            </div>
          </div>
        ))}
      </div>
      <div className={styles.merge}><span>●</span><i /><b>MERGE</b><i /><span>●</span></div>
    </aside>
  );
}

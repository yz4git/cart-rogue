import "./app/globals.css";
import { createRoot } from "react-dom/client";
import RallyGame from "./app/RallyGame";

const mount = document.getElementById("root");
if (!mount) throw new Error("Voxel Rally mount element is missing");
createRoot(mount).render(<RallyGame />);

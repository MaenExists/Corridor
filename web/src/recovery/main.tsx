import { createRoot } from "react-dom/client";
import "leaflet/dist/leaflet.css";
import "@fontsource-variable/inter";
import "./recovery.css";
import { RecoveryMap } from "./RecoveryMap";

createRoot(document.getElementById("root")!).render(<RecoveryMap/>);

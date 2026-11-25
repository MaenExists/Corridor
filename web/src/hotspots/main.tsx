import { createRoot } from "react-dom/client";
import "leaflet/dist/leaflet.css";
import "@fontsource-variable/inter";
import "../recovery/recovery.css";
import "./hotspots.css";
import { HotspotMap } from "./HotspotMap";

createRoot(document.getElementById("root")!).render(<HotspotMap/>);

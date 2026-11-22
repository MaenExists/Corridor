import { createRoot } from "react-dom/client";
import "leaflet/dist/leaflet.css";
import "./companion/companion.css";
import "./companion/integration.css";
import { Workspace } from "./companion/Workspace";

createRoot(document.getElementById("root")!).render(<Workspace/>);

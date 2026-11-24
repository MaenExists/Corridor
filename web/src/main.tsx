import { createRoot } from "react-dom/client";
import "leaflet/dist/leaflet.css";
import "@fontsource-variable/inter";
import "./companion/companion.css";
import "./companion/integration.css";
import "./dashboard/dashboard.css";
import "./dashboard/showcase.css";
import { Dashboard } from "./dashboard/Dashboard";

createRoot(document.getElementById("root")!).render(<Dashboard/>);

// Copy the pitch deck (../Presentation) into public/ppt so the app serves it at /ppt.
// Screenshots are converted to WebP to keep the download small; the deck is told to load .webp.
// public/ppt is gitignored: the deck's data and screenshots are derived artifacts, rebuilt here before each build.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const src = path.resolve(import.meta.dirname, "../../Presentation");
const out = path.resolve(import.meta.dirname, "../public/ppt");
if (!existsSync(path.join(src, "index.html"))) { console.log("ppt: no Presentation/ found, skipped"); process.exit(0); }

mkdirSync(path.join(out, "assets/shots"), { recursive: true });
let html = readFileSync(path.join(src, "index.html"), "utf8");
html = html.replace("<head>", '<head>\n<base href="/ppt/">\n<meta name="robots" content="noindex, nofollow">');
writeFileSync(path.join(out, "index.html"), html);
writeFileSync(path.join(out, "deck.js"),
  readFileSync(path.join(src, "deck.js"), "utf8").replace("assets/shots/${it[0]}.png", "assets/shots/${it[0]}.webp"));
cpSync(path.join(src, "style.css"), path.join(out, "style.css"));
cpSync(path.join(src, "assets/fonts"), path.join(out, "assets/fonts"), { recursive: true });

const data = path.join(src, "assets/data.js");
if (existsSync(data)) cpSync(data, path.join(out, "assets/data.js"));
else console.warn("ppt: assets/data.js missing (run python3 Presentation/tools/build_data.py); charts will be empty");

const shots = path.join(src, "assets/shots");
let converted = 0;
for (const f of existsSync(shots) ? readdirSync(shots).filter(f => f.endsWith(".png")) : []) {
  const from = path.join(shots, f), to = path.join(out, "assets/shots", f.replace(/\.png$/, ".webp"));
  if (existsSync(to) && statSync(to).mtimeMs >= statSync(from).mtimeMs) continue;
  execFileSync("magick", [from, "-resize", "2400x2400>", "-quality", "82", to]);
  converted++;
}
console.log(`ppt: deck copied to public/ppt (${converted} screenshots converted)`);

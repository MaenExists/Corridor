# Offline demo rehearsal

After setup, run `make demo` and open http://127.0.0.1:5173/?offline=1 on the same machine. The overview, main map and review desk start on the bundled satellite archive. The detailed atlas keeps its local boundaries and place search. The offline session disables both online tile providers, including when switching out of and back into the synthetic track.

Open http://127.0.0.1:5173 without the query flag for the existing OpenStreetMap default. Offline rehearsal still needs the local demo server; it does not download tiles or cache the website for later use. Attribution links are still available to open manually.

This changes how the map loads, not how forecasts are fitted, scored or explained. It uses only the synthetic demo and makes no change to the private track.

Verified on the migrated machine: synthetic data, evaluation, replay and forecasts regenerated; 17 automated tests, the production build and the full Chromium review flow passed. A separate browser session blocked and counted external requests during offline rehearsal and saw none.

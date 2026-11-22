# Satellite dashboard and review desk
Run `make setup && make demo`, then open http://127.0.0.1:5173. **Overview** and **Review desk** implement the two visual references in Corridor's existing app.
The workspace uses neutral black backgrounds. The Kerala map defaults to OpenStreetMap streets, with real zoom levels and attribution. Map **Layers** offers online NASA detail and the bundled NASA Landsat/Blue Marble archive. The archive is also the fallback when online tiles fail. The district inspector sits beside or below the map instead of covering it.
The cards, charts, district inspector and review alerts use the existing synthetic archive, batch model and local inbox. The app does not simulate live agency access, risk scores or readiness percentages.
**Patterns, Evidence, Scenarios, Methodology** open the held-out replay, source and review workflows, arithmetic what-ifs, and the coverage audit.
Practice receipts reveal only review status. Analyst notes are structured, local and key-gated. Neither feeds forecasts. Real data remains a separate private aggregate view.
The browser suite checks the OpenStreetMap default, zoom, provider fallback, forecast drill-downs, scenarios, receipt tracking, key-gated activity, briefs, and real aggregate suppression.

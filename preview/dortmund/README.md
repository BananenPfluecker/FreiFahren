# Dortmund browser-only preview

The independent static preview is under `preview/dortmund/`; it does not call FreiFahren's production API, use D1, or modify the main frontend.

## Data flow
1. Download the official October 2026 VRR GTFS ZIP in `.github/workflows/dortmund-pages.yml`.
2. Run `tools/gtfs/dortmund_import.py` and its unit tests.
3. The importer also exports `line_geometries.json` and `source_info.json` as browser-preview sidecars. Convert the resulting `stations.csv`, `lines.csv`, `line_stations.csv` into `data/dortmund.json` using `preview/dortmund/build_data.py`.
4. Deploy the independent HTML/JS/JSON directory through GitHub Pages Actions only if the validation succeeds.

## Limitations
- Solid route polylines use the most frequent available GTFS shape for the exact selected route, direction, and stop pattern. Shapes are sorted by point sequence and split when leaving the preview bounds. Missing/invalid shapes fall back to dashed straight connections; the map reports coverage. The uploaded VRR feed version 20261013 contains a header-only shapes.txt, so all current connections remain schematic. No road-routing approximation is presented as a transit route.
- No live reports, authentication, report submission, backend API, D1, or real-time GTFS.
- Basemap tiles use OpenStreetMap's public tile server for small-scale testing, subject to its usage policy; attribution is shown. Leaflet assets load from a third-party CDN.
- A GitHub Pages repository setting must select **GitHub Actions** as the publishing source. The workflow file lives only on the feature branch; GitHub may not show a manual dispatch control until a workflow exists on the default branch. The push trigger is scoped to the feature branch.
- If Pages is disabled, deployment is not enabled, the official ZIP URL changes, or the importer rejects the feed, no successful deployment occurs. Inspect the Actions logs.
- Do not use the upstream production Worker or Wrangler configuration for this preview.

The expected Pages URL, *only after a successful deployment*, is `https://bananenpfluecker.github.io/FreiFahren/`.

<!-- Trigger Pages preview rebuild after GitHub Pages settings change (2026-11-05). -->

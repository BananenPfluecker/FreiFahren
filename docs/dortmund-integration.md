# Dortmund integration status

This branch registers Dortmund as an independent city in the shared city registry. It does **not** deploy anything or modify production data.

## Implemented
- Dortmund city profile (map, route filters, reporting, Telegram defaults)
- City registry entry
- Reserved D1 binding name `DB_DORTMUND` (not provisioned)

## Required before it works end to end
1. Create a D1 database in your **own** Cloudflare account, and configure its real database ID in a fork-specific Wrangler configuration. Do not deploy the upstream `wrangler.jsonc` unchanged: it contains upstream service bindings, domains and database IDs.
2. Add the D1 binding in local Worker and test/preview configurations.
3. Build/host a Dortmund tile-server style, or point the map to a verified existing style.
4. Import VRR GTFS stops/routes/trips/stop_times into `stations`, `lines`, `line_stations`, and generate route `segments`. The current seed pipeline is **OSM-based**; GTFS import is not yet wired in.
5. Check service-area bounds, operators, and line naming against a current VRR GTFS dataset.
6. Run typechecks, tests, and build. No CI verification has been performed for this branch.

This is a non-production scaffold, not a finished Dortmund deployment.

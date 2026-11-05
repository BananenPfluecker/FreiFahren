# Private Dortmund reporting app

Custom source for the existing owner-private Sites app, extending the Sites Vinext starter. Copy app/, db/, lib/, tests/ and drizzle/ into the starter, copy the parent index.html, app.css, app.js and map-logic.mjs to public/map/, and generate public/map/data/dortmund.json with the importer/build script. In the copied map-logic test, change its import from ../../map-logic.mjs to ../public/map/map-logic.mjs. Keep the existing Site identity and audience, with `d1: "DB"` and `r2: null`. No upstream production Worker, credentials or database IDs are used.

The root page hosts the map with `?reports=1`. GitHub Pages omits that flag and stays a network-only frontend. Its workflow copies all four assets and runs the reporting/warning tests with Node 22. Tests in the GitHub checkout run via `node --test preview/dortmund/site/tests/*.test.mjs` without dependencies. SQLite is used only as a local D1 adapter; data fixtures are created through the real Request handlers.

## Meldungen und Rückmeldungen

- Reports with the same stop group, line and direction merge. Stop groups combine equal names within 150 metres; incompatible or unknown line/direction combinations stay separate. This avoids guessing which vehicle is meant.
- Each authenticated actor contributes at most one positive sighting. A repeated positive observation refreshes its timestamp without increasing the distinct-actor count.
- One clear vote newer than the last sighting marks a report disputed. Two different actors reporting clear after the last sighting mark it resolved. An uncertain vote does not extend expiry or resolve a report.
- Positive sightings expire after 60 minutes without another positive observation. Resolved reports are hidden by default and can be displayed explicitly. A new sighting reopens a resolved/expired group without carrying previous confidence into the new episode.
- Deleting an own sighting retracts only that actor's observation; others remain. No automatic erasure of old stored records is implemented.
- Idempotent action IDs, atomic D1 batches and a unique group key protect against duplicate requests and concurrent inserts. Sightings have a one-minute actor cooldown, feedback ten seconds. The immutable 0000 migration remains unchanged; 0001 is additive. Local and hosted migration histories remain separate.

The trusted Sites identity header is hashed as the actor key. GET never exposes actor keys. The development actor exists only in development builds. Auth, same-origin writes and station/line/endpoint validation remain enforced. Distinct accounts are not a guarantee of distinct real persons or truth; no editorial verification is claimed.

## Freiwillige Hinweise

Device-local preferences configure light/dark/automatic appearance, radius (300/600/1000 m), audio, vibration and optional system notices. Location is requested only by explicit action, retained only in memory, and can be disabled. It is not sent to the report API. Warning relevance uses distance, current line/direction and visible stops; unknown line/direction remains explicitly labelled. No real route-ahead inference is made from schematic lines.

Warnings run only while the page is visible, with an accurate enough location (<=200 m), a successful refresh less than 90 seconds old, and no active five-minute mute. Each event is warned once per session; a newer sighting may warn again after at least 15 minutes. Background/screen-lock reliability, native car integration and real-device audio/vibration delivery are not guaranteed. Optional browser permissions are never requested on startup. Offline cached data is marked stale and cannot trigger warnings.

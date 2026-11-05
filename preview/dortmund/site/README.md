# Private Dortmund reporting app

Custom source for the existing private Sites app. These files extend the Sites Vinext starter. Copy app/, db/, lib/, tests/ and drizzle/ into that starter; copy the parent index.html, app.css and app.js to public/map/ and generate public/map/data/dortmund.json with the existing importer/build script. Keep the existing Sites project identity and owner-only audience, remove static hosting and declare a new `d1: "DB"` binding with `r2: null`. No upstream production Worker, database IDs or credentials are used.

The root page hosts the map with `?reports=1`. The GitHub Pages preview omits this flag and stays a network-only frontend, linking to the private reporting app. No Pages request is sent to upstream production APIs.

Generate later migrations with the starter's `db:generate`; never modify applied migrations. Publish through Sites so schema migrations run before the app. Local testing uses the starter's local D1 migration command and its separate preview database. The built-in Node SQLite API adapter test drives the actual Request handler without manual data inserts: `node --test tests/reports-api.test.mjs`.

Server identity comes from Sites' trusted `oai-authenticated-user-id` header. A preview-only actor is enabled only in development builds. Reports contain a hashed actor key, station ID, optional line/direction and server timestamp. GET returns only the last 60 minutes, marks the caller's own records, and never returns the actor key. Own reports may be deleted. Auth, origin, payload, station/line/direction validation, one-minute cooldown, and idempotent request IDs protect writes. Test records are isolated from Berlin/upstream production. Older records are hidden, not automatically deleted.

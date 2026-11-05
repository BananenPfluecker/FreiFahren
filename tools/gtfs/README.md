# Dortmund / VRR GTFS (experimental)

Run from repository root with Python 3.10+ (standard library only):

```bash
python tools/gtfs/dortmund_import.py /path/to/vrr_gtfs.zip --out dortmund-gtfs-export
python -m unittest discover -s tools/gtfs -p 'test_*.py'
```

The importer reads `stops.txt`, `routes.txt`, `trips.txt` and `stop_times.txt` from a local GTFS ZIP. It selects U41–U49, S-Bahn line names matching S+number and three-digit buses that have stops within the configurable Dortmund bounding box. It exports `stations.csv`, `lines.csv`, `line_stations.csv` and traceability mappings.

**Limitations:** Bounding box is not a DSW21 operator filter; the ZIP may contain routes from other VRR operators. One longest trip per endpoint pair is chosen; branches, circular services, GTFS extended route types, stop platforms, trip validity, and shape geometry are not modeled comprehensively. Hash IDs are deterministic only as long as GTFS source IDs remain stable. These CSVs are **not** automatically applied to D1; no production database is modified. Route segments are missing, so do not treat this export as a complete seed. Inspect source data and test before integrating into the OSM-based seed pipeline.

To deploy the fork independently, provision your own D1 database and map tiles, then replace upstream service bindings, API domains and credentials. Do not deploy the upstream Wrangler configuration unchanged.

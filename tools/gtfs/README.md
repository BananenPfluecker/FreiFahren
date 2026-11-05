# Dortmund / VRR GTFS converter

Python 3.10+; standard library only. Run from repository root:

```bash
python tools/gtfs/dortmund_import.py /path/to/vrr_gtfs.zip --out dortmund-gtfs-export
python -m unittest discover -s tools/gtfs -p 'test_*.py'
```

The converter reads agency, stops, routes, trips and stop_times. It selects DSW21-operated U41–U49 and three-digit buses, plus DB Regio-operated S-Bahn lines using GTFS route type 109 (or 2), if they have at least two stops in the Dortmund bounding box. S-Bahn can be disabled with `--no-sbahn`. `--bbox WEST SOUTH EAST NORTH` changes the bounds.

It groups trips by route and GTFS direction, removes exact duplicates and subsequence patterns, then keeps up to four common patterns per route/direction (adjust with `--max-variants`). This deliberately loses some infrequent short turns and branches; it is **not a full schedule importer**.

Outputs: `stations.csv`, `lines.csv`, `line_stations.csv`, `gtfs_route_mapping.csv`, `gtfs_stop_mapping.csv`.

Tested with a supplied VRR GTFS feed (October 2026): 1,805 stations, 258 variants, 5,641 memberships; S1, S2, S4, S5 present. Two synthetic regression tests passed locally. No missing station references or duplicate line/station memberships were found in that export.

**Not ready for production:** No route shapes or segments are generated; the supplied `shapes.txt` was effectively empty. GTFS stop IDs can change between feed versions, and line IDs depend on stop sequences. Database updates require a migration strategy that preserves existing report references. The converter does not write to D1, Cloudflare or GitHub. Do not deploy the upstream Wrangler config unchanged.

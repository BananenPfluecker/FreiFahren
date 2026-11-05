#!/usr/bin/env python3
"""Convert a VRR GTFS ZIP into Dortmund FreiFahren reference CSVs (offline, no DB writes)."""
import argparse
import csv
import hashlib
import io
import re
import zipfile
from collections import defaultdict
from pathlib import Path

BBOX = (7.25, 51.36, 7.72, 51.67)  # west, south, east, north
MODES = {0: "tram", 1: "light_rail", 2: "train", 3: "bus"}
LINE_RE = re.compile(r"^(?:U4[1-9]|S\s?\d+|\d{3})$", re.I)


def rows(zf, name):
    matches = [n for n in zf.namelist() if n.rsplit("/", 1)[-1].lower() == name]
    if len(matches) != 1:
        raise ValueError(f"Expected exactly one {name} in ZIP; found {len(matches)}")
    with zf.open(matches[0]) as stream:
        yield from csv.DictReader(io.TextIOWrapper(stream, encoding="utf-8-sig", newline=""))


def key(prefix, value):
    return prefix + hashlib.sha256(value.encode("utf-8")).hexdigest()[:14]


def save(path, columns, records):
    with path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=columns)
        writer.writeheader()
        writer.writerows(records)


def convert(source, output, bbox):
    west, south, east, north = bbox
    with zipfile.ZipFile(source) as zf:
        all_stops = {r["stop_id"]: r for r in rows(zf, "stops.txt") if r.get("stop_id")}
        in_area = set()
        for stop_id, stop in all_stops.items():
            try:
                lat, lon = float(stop["stop_lat"]), float(stop["stop_lon"])
            except (ValueError, KeyError, TypeError):
                continue
            if west <= lon <= east and south <= lat <= north:
                in_area.add(stop_id)

        def parent_id(stop_id):
            stop = all_stops[stop_id]
            parent = stop.get("parent_station", "").strip()
            return parent if parent in all_stops and parent in in_area else stop_id

        routes = {}
        for route in rows(zf, "routes.txt"):
            short = (route.get("route_short_name") or "").strip().upper().replace(" ", "")
            if not LINE_RE.fullmatch(short):
                continue
            try:
                gtfs_type = int(route["route_type"])
            except (ValueError, KeyError, TypeError):
                continue
            if gtfs_type not in MODES:
                continue
            if short.startswith("U"):
                mode = "light_rail"
            elif short.startswith("S"):
                mode = "train"
            else:
                mode = "bus"
            routes[route["route_id"]] = (short, mode, route.get("route_color", ""))

        trips = {}
        for trip in rows(zf, "trips.txt"):
            if trip.get("route_id") in routes:
                trips[trip["trip_id"]] = trip["route_id"]

        by_trip = defaultdict(list)
        for row in rows(zf, "stop_times.txt"):
            trip_id = row.get("trip_id")
            stop_id = row.get("stop_id")
            if trip_id not in trips or stop_id not in in_area:
                continue
            try:
                seq = int(row["stop_sequence"])
            except (KeyError, ValueError, TypeError):
                continue
            by_trip[trip_id].append((seq, parent_id(stop_id)))

        # Choose a representative trip for each line + direction pattern.
        # This is not a full service-pattern or geometry importer.
        patterns = {}
        for trip_id, points in by_trip.items():
            ordered = [s for _, s in sorted(points)]
            unique = list(dict.fromkeys(ordered))
            if len(unique) < 2:
                continue
            route_id = trips[trip_id]
            signature = (route_id, unique[0], unique[-1])
            if signature not in patterns or len(unique) > len(patterns[signature]):
                patterns[signature] = unique

        selected_stops = {s for seq in patterns.values() for s in seq}
        stations = []
        for original in sorted(selected_stops):
            stop = all_stops[original]
            stations.append(dict(
                id=key("s", original),
                name=stop.get("stop_name", "")[:255],
                lat=stop["stop_lat"],
                lng=stop["stop_lon"],
            ))

        lines, memberships, mapping = [], [], []
        by_route = defaultdict(list)
        for (route_id, first, last), seq in patterns.items():
            by_route[route_id].append((first, last, seq))
        for route_id in sorted(by_route):
            short, mode, raw_color = routes[route_id]
            variants = sorted(by_route[route_id], key=lambda x: (x[0], x[1]))
            for variant_number, (_, _, seq) in enumerate(variants, 1):
                original = route_id + ":" + str(variant_number)
                line_id = key("l", original)
                color = "#" + raw_color if re.fullmatch(r"[0-9a-fA-F]{6}", raw_color) else "#000000"
                lines.append(dict(id=line_id, name=short, type=mode, isCircular=0, color=color))
                mapping.append(dict(gtfs_route_id=route_id, line_id=line_id, line_name=short))
                memberships.extend(dict(lineId=line_id, stationId=key("s", s), order=i)
                                   for i, s in enumerate(seq))

        output.mkdir(parents=True, exist_ok=True)
        save(output / "stations.csv", ["id", "name", "lat", "lng"], stations)
        save(output / "lines.csv", ["id", "name", "type", "isCircular", "color"], lines)
        save(output / "line_stations.csv", ["lineId", "stationId", "order"], memberships)
        save(output / "gtfs_route_mapping.csv", ["gtfs_route_id", "line_id", "line_name"], mapping)
        save(output / "gtfs_stop_mapping.csv", ["gtfs_stop_id", "station_id"],
             [dict(gtfs_stop_id=s, station_id=key("s", s)) for s in sorted(selected_stops)])
        print(f"Exported {len(stations)} stations, {len(lines)} line variants, "
              f"{len(memberships)} line/station links to {output}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("gtfs_zip", type=Path)
    parser.add_argument("--out", type=Path, default=Path("dortmund-gtfs-export"))
    parser.add_argument("--bbox", nargs=4, type=float, default=BBOX,
                        metavar=("WEST", "SOUTH", "EAST", "NORTH"))
    args = parser.parse_args()
    convert(args.gtfs_zip, args.out, args.bbox)


if __name__ == "__main__":
    main()

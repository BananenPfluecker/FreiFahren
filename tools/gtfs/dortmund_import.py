#!/usr/bin/env python3
"""Offline VRR GTFS to FreiFahren Dortmund CSV; no database or network writes."""
import argparse
import csv
import hashlib
import io
import json
import math
import re
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

BBOX = (7.25, 51.36, 7.72, 51.67)
LINE_RE = re.compile(r'^(?:U4[1-9]|S\d+|\d{3})$', re.I)


def rows(zf, name):
    matches = [n for n in zf.namelist() if n.rsplit('/', 1)[-1].lower() == name]
    if len(matches) != 1:
        raise ValueError(f'Expected exactly one {name}; found {len(matches)}')
    with zf.open(matches[0]) as stream:
        yield from csv.DictReader(io.TextIOWrapper(stream, encoding='utf-8-sig', newline=''))


def key(prefix, value):
    return prefix + hashlib.sha256(value.encode('utf-8')).hexdigest()[:14]


def save(path, columns, records):
    with path.open('w', newline='', encoding='utf-8') as file:
        writer = csv.DictWriter(file, fieldnames=columns)
        writer.writeheader()
        writer.writerows(records)


def is_subsequence(small, large):
    iterator = iter(large)
    return all(any(item == candidate for candidate in iterator) for item in small)


def choose_patterns(frequencies, max_variants):
    """Keep common non-redundant stop sequences; preserve major branches."""
    ranked = sorted(frequencies.items(), key=lambda pair: (-pair[1], -len(pair[0]), pair[0]))
    chosen = []
    for sequence, count in ranked:
        if any(is_subsequence(sequence, prior) for prior in chosen):
            continue
        if chosen and count < max(2, ranked[0][1] // 20):
            continue
        chosen.append(sequence)
        if len(chosen) == max_variants:
            break
    return chosen


def optional_rows(zf, name):
    if not any(n.rsplit('/', 1)[-1].lower() == name for n in zf.namelist()):
        return iter(())
    return rows(zf, name)


def shape_segments(points, bbox):
    west, south, east, north = bbox
    segments, current = [], []
    for _, lat, lng in sorted(points):
        if south <= lat <= north and west <= lng <= east:
            if not current or current[-1] != [lat, lng]:
                current.append([lat, lng])
        else:
            if len(current) > 1:
                segments.append(current)
            current = []
    if len(current) > 1:
        segments.append(current)
    return segments


def convert(source, output, bbox=BBOX, include_sbahn=True, max_variants=4):
    west, south, east, north = bbox
    if max_variants < 1:
        raise ValueError('max_variants must be positive')
    with zipfile.ZipFile(source) as zf:
        agencies = {r['agency_id']: r.get('agency_name', '') for r in rows(zf, 'agency.txt')}
        allowed_agencies = {a for a, name in agencies.items() if 'DSW21' in name.upper()}
        sbahn_agencies = {a for a, name in agencies.items() if 'DB REGIO' in name.upper()}
        if not allowed_agencies:
            raise ValueError('No DSW21 agency in this GTFS feed')
        stops = {r['stop_id']: r for r in rows(zf, 'stops.txt') if r.get('stop_id')}
        in_area = set()
        for sid, stop in stops.items():
            try:
                lat, lon = float(stop['stop_lat']), float(stop['stop_lon'])
            except (ValueError, KeyError, TypeError):
                continue
            if west <= lon <= east and south <= lat <= north:
                in_area.add(sid)

        def canonical(sid):
            parent = stops[sid].get('parent_station', '').strip()
            return parent if parent in in_area else sid

        routes = {}
        for route in rows(zf, 'routes.txt'):
            name = (route.get('route_short_name') or '').strip().upper().replace(' ', '')
            agency = route.get('agency_id', '')
            try:
                gtfs_type = int(route['route_type'])
            except (ValueError, KeyError, TypeError):
                continue
            if not LINE_RE.fullmatch(name):
                continue
            is_sbahn = include_sbahn and name.startswith('S') and gtfs_type in (2, 109) and agency in sbahn_agencies
            is_dsw = agency in allowed_agencies and (
                (name.startswith('U') and gtfs_type in (0, 1)) or
                (name.isdigit() and gtfs_type == 3)
            )
            if not (is_dsw or is_sbahn):
                continue
            mode = 'train' if is_sbahn else 'light_rail' if name.startswith('U') else 'bus'
            routes[route['route_id']] = (name, mode, route.get('route_color', ''))

        trips, trip_shapes = {}, {}
        for trip in rows(zf, 'trips.txt'):
            if trip.get('route_id') in routes:
                trips[trip['trip_id']] = (trip['route_id'], trip.get('direction_id', ''))
                trip_shapes[trip['trip_id']] = trip.get('shape_id', '').strip()

        by_trip = defaultdict(list)
        for stop_time in rows(zf, 'stop_times.txt'):
            tid, sid = stop_time.get('trip_id'), stop_time.get('stop_id')
            if tid not in trips or sid not in in_area:
                continue
            try:
                order = int(stop_time['stop_sequence'])
            except (ValueError, KeyError, TypeError):
                continue
            by_trip[tid].append((order, canonical(sid)))

        patterns = defaultdict(Counter)
        pattern_shapes = defaultdict(Counter)
        for tid, points in by_trip.items():
            ordered = [sid for _, sid in sorted(points)]
            unique = tuple(dict.fromkeys(ordered))
            if len(unique) >= 2:
                patterns[trips[tid]][unique] += 1
                if trip_shapes[tid]:
                    pattern_shapes[(*trips[tid], unique)][trip_shapes[tid]] += 1

        selected = {}
        for (rid, direction), frequencies in sorted(patterns.items()):
            for seq in choose_patterns(frequencies, max_variants):
                selected[(rid, direction, seq)] = frequencies[seq]

        needed_shapes = {sid for pattern in selected for sid in pattern_shapes[pattern]}
        shape_points, invalid_shapes = defaultdict(list), set()
        for point in optional_rows(zf, 'shapes.txt'):
            sid = point.get('shape_id')
            if sid not in needed_shapes:
                continue
            try:
                lat, lng = float(point['shape_pt_lat']), float(point['shape_pt_lon'])
                order = int(point['shape_pt_sequence'])
                if not (math.isfinite(lat) and math.isfinite(lng) and -90 <= lat <= 90 and -180 <= lng <= 180):
                    raise ValueError('Invalid shape coordinate')
            except (ValueError, KeyError, TypeError):
                invalid_shapes.add(sid)
                continue
            shape_points[sid].append((order, lat, lng))
        geometries = {}
        for sid, points in shape_points.items():
            # Reject a damaged shape as a whole instead of bridging missing points.
            if sid not in invalid_shapes and len({p[0] for p in points}) == len(points):
                geometries[sid] = shape_segments(points, bbox)

        selected_stops = {sid for _, _, seq in selected for sid in seq}
        stations = [dict(id=key('s', sid), name=stops[sid].get('stop_name', '')[:255],
                         lat=stops[sid]['stop_lat'], lng=stops[sid]['stop_lon'])
                    for sid in sorted(selected_stops)]
        lines, memberships, mapping, line_geometries = [], [], [], {}
        for rid, direction, seq in sorted(selected):
            name, mode, raw_color = routes[rid]
            line_id = key('l', rid + '|' + direction + '|' + '|'.join(seq))
            for sid, _ in sorted(pattern_shapes[(rid, direction, seq)].items(), key=lambda p: (-p[1], p[0])):
                if geometries.get(sid):
                    line_geometries[line_id] = {'shapeId': sid, 'segments': geometries[sid]}
                    break
            color = '#' + raw_color if re.fullmatch(r'[0-9a-fA-F]{6}', raw_color) else '#000000'
            lines.append(dict(id=line_id, name=name, type=mode, isCircular=0, color=color))
            mapping.append(dict(gtfs_route_id=rid, direction_id=direction,
                                line_id=line_id, line_name=name, trip_count=selected[(rid, direction, seq)]))
            memberships.extend(dict(lineId=line_id, stationId=key('s', sid), order=i)
                               for i, sid in enumerate(seq))

        output.mkdir(parents=True, exist_ok=True)
        (output / 'line_geometries.json').write_text(json.dumps(line_geometries, separators=(',', ':')), encoding='utf-8')
        info = next(optional_rows(zf, 'feed_info.txt'), {})
        (output / 'source_info.json').write_text(json.dumps({
            'publisher': info.get('feed_publisher_name', 'VRR'),
            'version': info.get('feed_version', ''),
            'startDate': info.get('feed_start_date', ''),
            'endDate': info.get('feed_end_date', ''),
        }), encoding='utf-8')
        save(output / 'stations.csv', ['id', 'name', 'lat', 'lng'], stations)
        save(output / 'lines.csv', ['id', 'name', 'type', 'isCircular', 'color'], lines)
        save(output / 'line_stations.csv', ['lineId', 'stationId', 'order'], memberships)
        save(output / 'gtfs_route_mapping.csv', ['gtfs_route_id', 'direction_id', 'line_id', 'line_name', 'trip_count'], mapping)
        save(output / 'gtfs_stop_mapping.csv', ['gtfs_stop_id', 'station_id'],
             [dict(gtfs_stop_id=sid, station_id=key('s', sid)) for sid in sorted(selected_stops)])
        print(f'Exported {len(stations)} stations, {len(lines)} variants, '
              f'{len(memberships)} memberships to {output}')
        return len(stations), len(lines), len(memberships)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('gtfs_zip', type=Path)
    parser.add_argument('--out', type=Path, default=Path('dortmund-gtfs-export'))
    parser.add_argument('--bbox', nargs=4, type=float, default=BBOX,
                        metavar=('WEST', 'SOUTH', 'EAST', 'NORTH'))
    parser.add_argument('--no-sbahn', action='store_true')
    parser.add_argument('--max-variants', type=int, default=4)
    args = parser.parse_args()
    convert(args.gtfs_zip, args.out, args.bbox, not args.no_sbahn, args.max_variants)


if __name__ == '__main__':
    main()

#!/usr/bin/env python3
"""Convert an offline Dortmund CSV export into the browser preview."""
import csv
import json
import math
import sys
from datetime import datetime
from pathlib import Path


def build(src, dst):
    def read(name):
        with (src / name).open(encoding='utf-8-sig', newline='') as file:
            return list(csv.DictReader(file))

    def read_json(name):
        path = src / name
        return json.loads(path.read_text(encoding='utf-8')) if path.exists() else {}

    stations = []
    for station in read('stations.csv'):
        try:
            lat, lng = float(station['lat']), float(station['lng'])
        except (ValueError, KeyError):
            continue
        if 51.36 <= lat <= 51.67 and 7.25 <= lng <= 7.72:
            stations.append({'id': station['id'], 'name': station['name'], 'lat': lat, 'lng': lng})
    valid = {s['id'] for s in stations}
    members = {}
    for row in read('line_stations.csv'):
        if row['stationId'] in valid:
            members.setdefault(row['lineId'], []).append((int(row['order']), row['stationId']))
    geometries = read_json('line_geometries.json')
    lines = []
    for line in read('lines.csv'):
        ids = [sid for _, sid in sorted(members.get(line['id'], []))]
        if len(ids) < 2:
            continue
        item = {'name': line['name'], 'type': line['type'], 'color': line['color'], 'stationIds': ids}
        geometry = geometries.get(line['id'], {}).get('segments', [])
        if geometry:
            if not all(len(segment) >= 2 and all(
                len(point) == 2 and all(isinstance(v, (float, int)) and math.isfinite(v) for v in point)
                and 51.36 <= point[0] <= 51.67 and 7.25 <= point[1] <= 7.72
                for point in segment) for segment in geometry):
                raise ValueError('Invalid geometry for ' + line['id'])
            item['geometry'] = geometry
        lines.append(item)
    if not stations or not lines:
        raise ValueError('Refusing to publish empty Dortmund data')
    source = read_json('source_info.json')

    def date(value):
        try:
            return datetime.strptime(value, '%Y%m%d').strftime('%d.%m.%Y')
        except (ValueError, TypeError):
            return None

    version, start, end = date(source.get('version')), date(source.get('startDate')), date(source.get('endDate'))
    source_date = 'VRR-GTFS' + (' · Version ' + version if version else ' · Version unbekannt')
    if start and end:
        source_date += ' · Zeitraum ' + start + '–' + end
    payload = {'stations': stations, 'lines': lines, 'sourceDate': source_date, 'source': source,
               'geometryVariants': sum(bool(line.get('geometry')) for line in lines)}
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':'), allow_nan=False), encoding='utf-8')
    print(f"Validated {len(stations)} stations, {len(lines)} variants; {payload['geometryVariants']} with GTFS geometry; wrote {dst}")
    return payload


if __name__ == '__main__':
    build(*map(Path, sys.argv[1:3]))

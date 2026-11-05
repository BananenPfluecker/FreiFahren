#!/usr/bin/env python3
"""Convert the existing Dortmund importer CSV export into a browser-only preview."""
import csv, json, sys
from pathlib import Path
src,dst=map(Path,sys.argv[1:3])
def read(name):
    with (src/name).open(encoding='utf-8-sig',newline='') as f:return list(csv.DictReader(f))
stations=[]
for s in read('stations.csv'):
    try:lat,lng=float(s['lat']),float(s['lng'])
    except (ValueError,KeyError):continue
    if 51.36<=lat<=51.67 and 7.25<=lng<=7.72:stations.append({'id':s['id'],'name':s['name'],'lat':lat,'lng':lng})
valid={s['id'] for s in stations}
members={}
for r in read('line_stations.csv'):
    if r['stationId'] in valid:members.setdefault(r['lineId'],[]).append((int(r['order']),r['stationId']))
lines=[]
for l in read('lines.csv'):
    ids=[sid for _,sid in sorted(members.get(l['id'],[]))]
    if len(ids)>1:lines.append({'name':l['name'],'type':l['type'],'color':l['color'],'stationIds':ids})
if not stations or not lines:raise SystemExit('Refusing to publish empty Dortmund data')
dst.parent.mkdir(parents=True,exist_ok=True)
dst.write_text(json.dumps({'stations':stations,'lines':lines,'sourceDate':'VRR-GTFS (Datum siehe Workflow-Eingabe)'},ensure_ascii=False,separators=(',',':')),encoding='utf-8')
print(f'Validated {len(stations)} stations and {len(lines)} variants; wrote {dst}')

"""Synthetic GTFS regression tests for Dortmund."""
import csv
import importlib.util
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

SCRIPT = Path(__file__).with_name('dortmund_import.py')
spec = importlib.util.spec_from_file_location('dortmund_import', SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def make_csv(headers, records):
    import io
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(headers)
    writer.writerows(records)
    return buf.getvalue()


class DortmundImportTest(unittest.TestCase):
    def test_operator_filter_and_sbahn_109(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            feed = root / 'feed.zip'
            with zipfile.ZipFile(feed, 'w') as z:
                z.writestr('agency.txt', make_csv(['agency_id', 'agency_name'], [
                    ['dsw', 'DSW21-Dortmunder Stadtwerke AG'],
                    ['db', 'DB Regio AG NRW'],
                    ['other', 'Another Operator'],
                ]))
                z.writestr('stops.txt', make_csv(
                    ['stop_id', 'stop_name', 'stop_lat', 'stop_lon', 'parent_station'],
                    [['a', 'Kampstraße', '51.514', '7.46', ''],
                     ['b', 'Stadtgarten', '51.51', '7.465', ''],
                     ['c', 'Hbf', '51.52', '7.46', '']]))
                z.writestr('routes.txt', make_csv(
                    ['route_id', 'agency_id', 'route_short_name', 'route_type', 'route_color'],
                    [['u', 'dsw', 'U41', '1', '002c9d'],
                     ['s', 'db', 'S1', '109', ''],
                     ['foreign', 'other', 'U42', '1', '']]))
                z.writestr('trips.txt', make_csv(
                    ['route_id', 'trip_id', 'direction_id', 'shape_id'],
                    [['u', 'u1', '0', 'curve'], ['u', 'u2', '0', 'curve'],
                     ['s', 's1', '1', 'missing'], ['foreign', 'f1', '0', 'foreign']]))
                z.writestr('shapes.txt', make_csv(
                    ['shape_id', 'shape_pt_lat', 'shape_pt_lon', 'shape_pt_sequence'],
                    [['curve', 51.52, 7.46, 30], ['curve', 51.514, 7.46, 10],
                     ['curve', 51.51, 7.465, 20], ['foreign', 51.5, 7.4, 1]]))
                z.writestr('feed_info.txt', make_csv(
                    ['feed_publisher_name', 'feed_version', 'feed_start_date', 'feed_end_date'],
                    [['VRR', '20261013', '20260901', '20270228']]))
                z.writestr('stop_times.txt', make_csv(
                    ['trip_id', 'stop_id', 'stop_sequence'],
                    [[trip, stop, i] for trip in ['u1', 'u2', 's1', 'f1']
                     for i, stop in enumerate(['a', 'b', 'c'], 1)]))
            out = root / 'out'
            self.assertEqual(module.convert(feed, out), (3, 2, 6))
            with (out / 'lines.csv').open(encoding='utf-8') as file:
                lines = list(csv.DictReader(file))
            self.assertEqual({line['name'] for line in lines}, {'U41', 'S1'})
            self.assertEqual({line['type'] for line in lines}, {'light_rail', 'train'})
            with (out / 'line_stations.csv').open(encoding='utf-8') as file:
                links = list(csv.DictReader(file))
            self.assertEqual(len(links), len({(r['lineId'], r['stationId']) for r in links}))
            geometries = json.loads((out / 'line_geometries.json').read_text())
            uid = next(line['id'] for line in lines if line['name'] == 'U41')
            self.assertEqual(set(geometries), {uid})
            self.assertEqual(geometries[uid]['segments'], [[[51.514, 7.46], [51.51, 7.465], [51.52, 7.46]]])
            build_path = SCRIPT.parents[2] / 'preview/dortmund/build_data.py'
            build_spec = importlib.util.spec_from_file_location('build_data', build_path)
            builder = importlib.util.module_from_spec(build_spec)
            build_spec.loader.exec_module(builder)
            payload = builder.build(out, root / 'site/data.json')
            self.assertEqual(payload['geometryVariants'], 1)
            self.assertIn('13.10.2026', payload['sourceDate'])
            self.assertIn('28.02.2027', payload['sourceDate'])
            self.assertNotIn('geometry', next(line for line in payload['lines'] if line['name'] == 'S1'))
            (out / 'line_geometries.json').unlink()
            (out / 'source_info.json').unlink()
            self.assertEqual(builder.build(out, root / 'legacy.json')['geometryVariants'], 0)
            with zipfile.ZipFile(feed) as z:
                entries = {name: z.read(name) for name in z.namelist() if name != 'shapes.txt'}
            header = ['shape_id', 'shape_pt_lat', 'shape_pt_lon', 'shape_pt_sequence']
            cases = {
                'absent': None,
                'empty': make_csv(header, []),
                'invalid': make_csv(header, [['curve', 51.5, 7.4, 1], ['curve', 'NaN', 7.4, 2], ['curve', 51.51, 7.41, 3]]),
                'duplicate-sequence': make_csv(header, [['curve', 51.5, 7.4, 1], ['curve', 51.51, 7.41, 1]]),
            }
            for label, shape_content in cases.items():
                with self.subTest(shapes=label):
                    with zipfile.ZipFile(feed, 'w') as z:
                        for name, content in entries.items():
                            z.writestr(name, content)
                        if shape_content is not None:
                            z.writestr('shapes.txt', shape_content)
                    self.assertEqual(module.convert(feed, out), (3, 2, 6))
                    self.assertEqual(json.loads((out / 'line_geometries.json').read_text()), {})

    def test_shape_exits_do_not_bridge_across_outside_area(self):
        self.assertEqual(module.shape_segments([
            (1, 51.5, 7.4), (2, 51.51, 7.41), (3, 52, 8),
            (4, 51.52, 7.42), (5, 51.53, 7.43)], module.BBOX),
            [[[51.5, 7.4], [51.51, 7.41]], [[51.52, 7.42], [51.53, 7.43]]])

    def test_consolidation(self):
        patterns = {('a', 'b', 'c'): 100, ('a', 'c'): 30,
                    ('a', 'd', 'c'): 20, ('a', 'e', 'c'): 1}
        self.assertEqual(module.choose_patterns(patterns, 4),
                         [('a', 'b', 'c'), ('a', 'd', 'c')])


if __name__ == '__main__':
    unittest.main()

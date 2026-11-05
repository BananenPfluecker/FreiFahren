"""Synthetic GTFS regression tests for Dortmund."""
import csv
import importlib.util
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
                    ['route_id', 'trip_id', 'direction_id'],
                    [['u', 'u1', '0'], ['u', 'u2', '0'],
                     ['s', 's1', '1'], ['foreign', 'f1', '0']]))
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

    def test_consolidation(self):
        patterns = {('a', 'b', 'c'): 100, ('a', 'c'): 30,
                    ('a', 'd', 'c'): 20, ('a', 'e', 'c'): 1}
        self.assertEqual(module.choose_patterns(patterns, 4),
                         [('a', 'b', 'c'), ('a', 'd', 'c')])


if __name__ == '__main__':
    unittest.main()

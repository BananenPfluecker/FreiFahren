"""Synthetic, dependency-free smoke test for the Dortmund GTFS converter."""
import csv
import importlib.util
import tempfile
import unittest
import zipfile
from pathlib import Path

SCRIPT = Path(__file__).with_name("dortmund_import.py")
spec = importlib.util.spec_from_file_location("dortmund_import", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def make_csv(headers, rows):
    import io
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(headers)
    writer.writerows(rows)
    return buf.getvalue()


class DortmundImportTest(unittest.TestCase):
    def test_extracts_only_local_matching_routes(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            feed = root / "feed.zip"
            with zipfile.ZipFile(feed, "w") as z:
                z.writestr("stops.txt", make_csv(
                    ["stop_id", "stop_name", "stop_lat", "stop_lon", "parent_station"],
                    [["a", "Kampstraße", "51.514", "7.46", ""],
                     ["b", "Stadtgarten", "51.51", "7.465", ""],
                     ["x", "Outside", "50.0", "7.0", ""]]))
                z.writestr("routes.txt", make_csv(
                    ["route_id", "route_short_name", "route_type", "route_color"],
                    [["u41", "U41", "1", "FF0000"], ["other", "RE1", "2", ""]]))
                z.writestr("trips.txt", make_csv(
                    ["route_id", "trip_id"], [["u41", "trip1"], ["other", "trip2"]]))
                z.writestr("stop_times.txt", make_csv(
                    ["trip_id", "stop_id", "stop_sequence"],
                    [["trip1", "a", "1"], ["trip1", "b", "2"],
                     ["trip1", "x", "3"], ["trip2", "a", "1"]]))
            output = root / "out"
            module.convert(feed, output, module.BBOX)
            with (output / "stations.csv").open(encoding="utf-8") as file:
                stations = list(csv.DictReader(file))
            with (output / "lines.csv").open(encoding="utf-8") as file:
                lines = list(csv.DictReader(file))
            self.assertEqual({s["name"] for s in stations}, {"Kampstraße", "Stadtgarten"})
            self.assertEqual(len(lines), 1)
            self.assertEqual(lines[0]["name"], "U41")
            self.assertEqual(lines[0]["type"], "light_rail")
            self.assertTrue(all(len(r["id"]) <= 16 for r in stations + lines))


if __name__ == "__main__":
    unittest.main()

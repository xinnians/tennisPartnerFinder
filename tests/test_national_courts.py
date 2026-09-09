"""Meaningful importer edge cases; no network, hosted DB, or source file writes."""
import csv
import io
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from national_courts import ACCESS, FIELDS, build, capture, classification, dumps

ADMIN = {'sourceUrl': 'https://api.nlsc.gov.tw/other/ListCounty', 'fetchedAt': '2026-09-09',
         'counties': [{'code': '63000', 'name': '臺北市', 'districts': [{'townname': '中正區'}]},
                      {'code': '09007', 'name': '連江縣', 'districts': [{'townname': '南竿鄉'}]},
                      {'code': '09020', 'name': '金門縣', 'districts': [{'townname': '金城鎮'}]}]}


def row(**changes):
    return {'sourceRow': 2, 'cityCode': '63000', 'district': '中正區', 'name': '測試網球場',
            'facility': '網球場', 'address': '臺北市中正區測試路1號', 'lat': '25.02', 'lng': '121.51',
            'website': 'https://example.gov.tw/', 'access': next(iter(ACCESS)),
            'rental': '不開放對外場地租借', 'hours': '日間', 'closureSignal': 'none', **changes}


def output(rows):
    return build({'meta': {'fetchedAt': '2026-09-09', 'sourceRowCount': len(rows)}, 'rows': rows}, ADMIN, [])[0]['records']


class NationalCourtsTests(unittest.TestCase):
    def test_csv_quotes_newlines_bom_and_private_fields_are_not_retained(self):
        stream = io.StringIO(newline='')
        writer = csv.DictWriter(stream, fieldnames=[*FIELDS.values(), '場館實際管理人姓名', '場館實際管理人電話', '運動場館介紹'])
        writer.writeheader()
        item = {FIELDS[k]: v for k, v in row().items() if k in FIELDS}
        item.update({'場館名稱': '網球,場\n分館', '場館實際管理人姓名': 'DO_NOT_KEEP',
                     '場館實際管理人電話': '0912345678', '運動場館介紹': '場地已廢除，不再使用。DO_NOT_KEEP'})
        writer.writerow(item)
        writer.writerow({**item, '場館名稱': '籃球場', '設施項目': '籃球場'})
        result = capture(('\ufeff' + stream.getvalue()).encode(), '2026-09-09', 'date')
        self.assertEqual(result['meta']['sourceRowCount'], 2)
        self.assertEqual(result['meta']['candidateRowCount'], 1)
        self.assertEqual(result['rows'][0]['name'], '網球,場\n分館')
        self.assertEqual(result['rows'][0]['closureSignal'], 'retirement_mentioned')
        self.assertNotIn('DO_NOT_KEEP', dumps(result))
        self.assertNotIn('0912345678', dumps(result))

    def test_csv_schema_changes_fail_closed(self):
        with self.assertRaises(ValueError):
            capture('場館名稱\n網球場\n'.encode(), '2026-09-09', None)

    def test_snapshot_cannot_silently_gain_private_fields(self):
        with self.assertRaises(ValueError):
            output([row(managerName='private')])

    def test_closed_rental_does_not_cancel_free_access_and_nothing_is_published(self):
        item = output([row()])[0]
        self.assertEqual(item['reportedAccess'], 'free')
        self.assertEqual(item['reportedRental'], 'closed')
        self.assertNotIn('access_rental_conflict', item['flags'])
        self.assertEqual(item['reviewStatus'], 'unreviewed')
        self.assertFalse(item['guidePublished'])
        self.assertFalse(item['sessionsEnabled'])
        self.assertIsNone(item['sourceRecordId'])

    def test_island_code_padding_and_conflicting_county_are_preserved(self):
        item = output([row(cityCode='9007', district='金城鎮', address='金門縣金城鎮光前路94號')])[0]
        self.assertEqual(item['city'], '連江縣')
        self.assertEqual(item['cityCode'], '09007')
        self.assertIn('address_city_conflict', item['flags'])
        self.assertIn('district_not_in_county', item['flags'])
        self.assertEqual(item['reviewQueue'], 'resolve_issues')

    def test_nonfinite_swapped_coordinates_and_untrusted_url_are_not_accepted(self):
        for value in ['NaN', 'Infinity', '121.5', '', '0']:
            with self.subTest(value=value):
                item = output([row(lat=value, website='javascript:alert(1)')])[0]
                self.assertIsNone(item['lat'])
                self.assertIsNone(item['website'])
                self.assertIn('invalid_or_outside_tw_coordinate', item['flags'])
                dumps(item)

    def test_facility_classification_is_not_inferred_from_venue_name(self):
        for facility, expected in [('籃球場', 'name_only'), ('網球練習壁', 'practice_wall'),
                                   ('軟式網球場', 'soft_tennis'), ('籃球場、網球場', 'shared_or_ambiguous'),
                                   ('網球館頂樓戶外球場-籃球場', 'shared_or_ambiguous'), ('網球場(館)', 'tennis_candidate')]:
            self.assertEqual(classification(row(facility=facility)), expected)

    def test_nearby_different_facilities_and_duplicate_rows_are_not_merged(self):
        items = output([row(), row(sourceRow=3, name='另一館'), row(sourceRow=4)])
        self.assertEqual(len(items), 3)
        self.assertEqual(len({r['candidateId'] for r in items}), 3)
        self.assertTrue(all('possible_same_site' in r['flags'] for r in items))

    def test_missing_in_source_does_not_delete_existing_catalogue(self):
        catalogue = [{'slug': 'existing', 'name': '既有球場', 'city': '台北市', 'lat': 25.1, 'lng': 121.6}]
        original = json.dumps(catalogue)
        _, report = build({'meta': {}, 'rows': []}, ADMIN, catalogue)
        self.assertEqual(json.dumps(catalogue), original)
        self.assertEqual(report['catalogueCoverage'][0]['candidateIds'], [])
        self.assertEqual(len(report['byCity']), 3)


if __name__ == '__main__':
    unittest.main()

"""Offline national tennis inventory. Never writes the production catalogue or SQL.

Capture strips nonessential personal fields; --check rebuilds committed outputs offline.
Source rows identify a dated CSV record, not a provider-issued venue ID.
"""
import argparse
import csv
import hashlib
import io
import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'data/national'
SOURCE_URL = 'https://ws.sports.gov.tw/FS01/FilePath/1/relfile/164/10269/5a511d68-e6b8-42ee-a449-acc395135268.csv'
FIELDS = {
    'cityCode': '縣市', 'district': '行政區', 'name': '場館名稱',
    'facility': '設施項目', 'address': '地址', 'lat': '緯度', 'lng': '經度',
    'website': '場館官方網站', 'access': '開放情形', 'rental': '租借資訊',
    'hours': '開放時間',
}
ACCESS = {'免費對外開放使用': 'free', '付費對外開放使用': 'paid', '不對外開放使用': 'closed'}
RENTAL = {'免費對外場地租借': 'free', '付費對外場地租借': 'paid', '不開放對外場地租借': 'closed'}


def dumps(value):
    return json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n'


def digest(value):
    return hashlib.sha256(value).hexdigest()


def clean(value):
    text = str(value or '').strip()
    return '' if text.upper() in ('NULL', 'NONE', 'N/A') else text


def normal(value):
    return re.sub(r'[\s　·．.（）()－—-]', '', clean(value).replace('台', '臺'))


def capture(raw, fetched_at, last_modified):
    rows = csv.DictReader(io.StringIO(raw.decode('utf-8-sig'), newline=''))
    if not set(FIELDS.values()).issubset(rows.fieldnames or []):
        raise ValueError('CSV schema changed; review source columns before importing')
    selected = []
    total = 0
    for index, row in enumerate(rows, start=2):
        total += 1
        if not any(re.search(r'網球|軟網', row.get(key, '')) for key in ('場館名稱', '設施項目')):
            continue
        item = {key: row[col] for key, col in FIELDS.items()}
        notes = row.get('開放及休館時間補充說明', '') + row.get('運動場館介紹', '')
        item['closureSignal'] = ('retirement_mentioned' if re.search(r'場地已廢除|已拆除|永久停用|已廢止', notes)
                                 else 'works_mentioned' if re.search(r'施工|整修|修繕|改建', notes) else 'none')
        selected.append({'sourceRow': index, **item})
    return {'meta': {'dataset': '22849', 'sourceUrl': SOURCE_URL,
                     'datasetUrl': 'https://data.gov.tw/dataset/22849',
                     'license': '政府資料開放授權條款-第1版', 'fetchedAt': fetched_at,
                     'sourceLastModified': last_modified, 'sourceSha256': digest(raw),
                     'sourceRowCount': total, 'candidateRowCount': len(selected),
                     'sourceRecordIdAvailable': False,
                     'selection': 'name or facility contains 網球 or 軟網; not a verified court count'},
            'rows': selected}


def coordinate(value, low, high):
    try:
        n = float(clean(value))
        return n if math.isfinite(n) and low <= n <= high else None
    except ValueError:
        return None


def classification(row):
    facility = normal(row['facility'])
    if not re.search(r'網球|軟網', facility):
        return 'name_only'
    if '壁' in facility:
        return 'practice_wall'
    if re.search(r'軟式|軟網', facility):
        return 'soft_tennis'
    if re.search(r'籃球|排球|羽球|躲避|棒球|跑道|共用|排網|籃網', facility):
        return 'shared_or_ambiguous'
    return 'tennis_candidate'


def distance(a, b):
    if any(p.get(k) is None for p in (a, b) for k in ('lat', 'lng')):
        return None
    x = math.radians(a['lat']); y = math.radians(b['lat'])
    v = math.sin((y-x)/2)**2 + math.cos(x)*math.cos(y)*math.sin(math.radians(b['lng']-a['lng'])/2)**2
    return 6371000 * 2 * math.asin(min(1, math.sqrt(v)))


def build(snapshot, admin, catalogue):
    allowed = {'sourceRow', 'closureSignal', *FIELDS}
    if any(set(row) != allowed for row in snapshot['rows']):
        raise ValueError('Snapshot must contain only the approved anonymous source fields')
    counties = {c['code'].zfill(5): c for c in admin['counties']}
    records = []
    seen = Counter()
    for raw in snapshot['rows']:
        code = clean(raw['cityCode']).zfill(5)
        county = counties.get(code)
        city = county['name'] if county else None
        district = clean(raw['district'])
        address = clean(raw['address'])
        lat, lng = coordinate(raw['lat'], 20, 27), coordinate(raw['lng'], 117, 123)
        flags = []
        if not city:
            flags.append('unknown_city_code')
        if not county or normal(district) not in {normal(t['townname']) for t in county['districts']}:
            flags.append('district_not_in_county')
        if not address:
            flags.append('missing_address')
        mentioned = [c['name'] for c in counties.values() if normal(c['name']) in normal(address)]
        if mentioned and city not in mentioned:
            flags.append('address_city_conflict')
        if address and district and normal(district) not in normal(address):
            flags.append('address_district_unconfirmed')
        if lat is None or lng is None:
            flags.append('invalid_or_outside_tw_coordinate')
        website = clean(raw['website'])
        try:
            url = urlparse(website)
            usable = url.scheme in ('https', 'http') and bool(url.hostname) and not url.username and not url.password
        except ValueError:
            usable = False
        if not usable:
            flags.append('missing_or_invalid_website')
        access = ACCESS.get(clean(raw['access']), 'unknown')
        rental = RENTAL.get(clean(raw['rental']), 'unknown')
        if 'unknown' in (access, rental):
            flags.append('unknown_access_or_rental')
        if access == 'closed' and rental in ('free', 'paid'):
            flags.append('access_rental_conflict')
        kind = classification(raw)
        if kind != 'tennis_candidate':
            flags.append(kind)
        if raw['closureSignal'] != 'none':
            flags.append(raw['closureSignal'])
        if re.search(r'國小|國中|高中|高職|大學|學院|學校|校區|中學|工商|家商|家事|高農|高工', raw['name']):
            flags.append('school_access_review')
        key = digest('|'.join(normal(raw[k]) for k in ('cityCode', 'district', 'name', 'address', 'facility')).encode())[:20]
        seen[key] += 1
        record_id = f'candidate-{key}' + (f'-row-{raw["sourceRow"]}' if seen[key] > 1 else '')
        records.append({'candidateId': record_id, 'sourceRecordId': None, 'sourceRow': raw['sourceRow'],
                        'cityCode': code, 'city': city, 'district': district, 'name': clean(raw['name']),
                        'facility': clean(raw['facility']), 'address': address, 'lat': lat, 'lng': lng,
                        'website': website if usable else None, 'classification': kind,
                        'reportedAccess': access, 'reportedRental': rental,
                        'reviewStatus': 'unreviewed', 'guidePublished': False, 'sessionsEnabled': False,
                        'flags': flags, 'catalogueCandidates': []})
    pairs = []
    for i, a in enumerate(records):
        for b in records[i+1:]:
            same_name = normal(a['name']) == normal(b['name'])
            same_address = bool(a['address']) and normal(a['address']) == normal(b['address'])
            meters = distance(a, b)
            near = meters is not None and meters <= 80
            if (same_name and a['cityCode'] == b['cityCode']) or same_address or near:
                reasons = [label for yes, label in [(same_name, 'same_name'), (same_address, 'same_address'), (near, 'within_80m')] if yes]
                pairs.append({'a': a['candidateId'], 'b': b['candidateId'], 'reasons': reasons,
                              'distanceMeters': round(meters) if meters is not None else None})
                for item in (a, b):
                    if 'possible_same_site' not in item['flags']:
                        item['flags'].append('possible_same_site')
    coverage = []
    for court in catalogue:
        matches = []
        for r in records:
            if normal(r['city']) != normal(court['city']):
                continue
            same = normal(r['name']) == normal(court['name'])
            meters = distance(r, court)
            if same or (meters is not None and meters <= 120):
                match = {'slug': court['slug'], 'reason': 'same_name' if same else 'within_120m',
                         'distanceMeters': round(meters) if meters is not None else None}
                r['catalogueCandidates'].append(match)
                matches.append(r['candidateId'])
        coverage.append({'slug': court['slug'], 'name': court['name'], 'city': court['city'], 'candidateIds': matches})
    for r in records:
        critical = {'unknown_city_code', 'district_not_in_county', 'address_city_conflict',
                    'invalid_or_outside_tw_coordinate', 'access_rental_conflict', 'retirement_mentioned'}
        r['reviewQueue'] = ('resolve_issues' if critical.intersection(r['flags']) or r['classification'] != 'tennis_candidate'
                            else 'verify_public_access' if r['reportedAccess'] in ('free', 'paid')
                            else 'verify_restrictions')
        r['flags'].sort()
    by_city = []
    for code, c in sorted(counties.items()):
        items = [r for r in records if r['cityCode'] == code]
        by_city.append({'city': c['name'], 'candidateRows': len(items),
                        'tennisCandidates': sum(r['classification'] == 'tennis_candidate' for r in items),
                        'reportedPublicAccess': sum(r['reportedAccess'] in ('free', 'paid') for r in items),
                        'issueQueue': sum(r['reviewQueue'] == 'resolve_issues' for r in items), 'publishReady': 0})
    meta = {**snapshot['meta'], 'administrativeSourceUrl': admin['sourceUrl'], 'administrativeFetchedAt': admin['fetchedAt'],
            'snapshotSha256': digest(dumps(snapshot).encode()), 'administrativeSnapshotSha256': digest(dumps(admin).encode()),
            'coordinateCheck': 'finite and broad Taiwan/islands bbox only; no point-in-polygon verification',
            'deduplication': 'suggestions only; no records merged; candidate IDs are local, not provider IDs'}
    report = {'meta': meta, 'summary': {'candidateRows': len(records), 'publishReady': 0,
                                       'classifications': dict(Counter(r['classification'] for r in records)),
                                       'access': dict(Counter(r['reportedAccess'] for r in records)),
                                       'reviewQueues': dict(Counter(r['reviewQueue'] for r in records)),
                                       'flags': dict(sorted(Counter(f for r in records for f in r['flags']).items())),
                                       'possibleSameSitePairs': len(pairs),
                                       'catalogueCourts': len(catalogue),
                                       'catalogueWithCandidates': sum(bool(c['candidateIds']) for c in coverage)},
              'byCity': by_city, 'possibleSameSitePairs': pairs, 'catalogueCoverage': coverage}
    return {'meta': meta, 'records': records}, report


def markdown(report):
    s = report['summary']
    lines = ['# 全台網球候選資料品質報告', '', f"來源擷取：{report['meta']['fetchedAt']}。來源原檔 {report['meta']['sourceRowCount']:,} 列，關鍵字候選 {s['candidateRows']} 列。",
             '', '**這是待審底稿，不是全台完整球場數；可直接發布 0 筆，未開放全台約球。**', '',
             '[運動部來源](https://data.gov.tw/dataset/22849) 採年度更新；[國土測繪中心縣市／行政區](https://data.gov.tw/dataset/102011) 用於文字對照。', '',
             '## 分類與查核', '', *[f'- {k}：{v}' for k, v in s['classifications'].items()], '',
             '名稱命中但設施非網球、練習壁、軟網與混合設施保留獨立分類，不能自動當一般網球場。免費／付費開放與是否受理租借分開保留。', '',
             f"疑似同地點配對 {s['possibleSameSitePairs']} 組，只提示、不合併；同址不同設施可合法並存。",
             f"既有正式目錄 {s['catalogueCourts']} 座，其中 {s['catalogueWithCandidates']} 座找到同名或 120m 內候選；其餘不是不存在，不能據此停用。", '',
             '## 縣市分布', '', '| 縣市 | 候選列 | 一般網球候選 | 來源稱對外開放 | 優先釐清問題 | 可發布 |', '| --- | ---: | ---: | ---: | ---: | ---: |']
    lines += [f"| {r['city']} | {r['candidateRows']} | {r['tennisCandidates']} | {r['reportedPublicAccess']} | {r['issueQueue']} | 0 |" for r in report['byCity']]
    lines += ['', '## 問題旗標（同筆可重複計）', '', *[f'- `{k}`：{v}' for k, v in s['flags'].items()], '',
              '## 下一輪處理', '', '1. 先釐清縣市／地址衝突、異常座標、已廢除訊號、名稱誤入與重複候選；不自動修正位置。',
              '2. 再查官方營運／租借入口與對外使用條件，校園另核對一般民眾資格；每筆保留欄位來源及人工查核日期。',
              '3. 來源名稱／地址均可能改動；本地衍生 ID 不是永久官方 ID。未經審核不得取代既有球場 ID、發布 seed 或自動合併。',
              '4. 經緯度只做有限數值及臺灣含離島大範圍檢查，尚未逐點驗證是否在縣市界內；網址只有語法檢查，未逐一驗證存活。',
              '5. 全台底稿缺某縣市或某球場不代表當地沒有網球；下輪需補地方政府與場館資料。', '',
              '原始必要欄位見 `data/national/source-22849.json`；個別旗標與候選對照見 `inventory.json`／`quality-report.json`。管理人姓名、電話、照片與完整介紹未納入。', '',
              '離線重現：`python3 scripts/national_courts.py --check`。本報告由腳本產生，不手改數字。', '']
    return '\n'.join(lines)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--capture-csv', type=Path)
    p.add_argument('--fetched-at')
    p.add_argument('--last-modified', default=None)
    modes = p.add_mutually_exclusive_group()
    modes.add_argument('--write', action='store_true')
    modes.add_argument('--check', action='store_true')
    args = p.parse_args()
    if args.capture_csv:
        if not args.write or not args.fetched_at or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', args.fetched_at):
            p.error('capture requires --write and --fetched-at YYYY-MM-DD')
        snapshot = capture(args.capture_csv.read_bytes(), args.fetched_at, args.last_modified)
        (BASE / 'source-22849.json').write_text(dumps(snapshot))
    snapshot = json.loads((BASE / 'source-22849.json').read_text())
    admin = json.loads((BASE / 'administrative-areas.json').read_text())
    catalogue = json.loads((ROOT / 'data/courts.json').read_text())['courts']
    inventory, report = build(snapshot, admin, catalogue)
    outputs = {BASE / 'inventory.json': dumps(inventory), BASE / 'quality-report.json': dumps(report),
               ROOT / 'docs/growth/national-courts-quality-2026-09-09.md': markdown(report)}
    for path, text in outputs.items():
        if args.write:
            path.write_text(text)
        elif not path.exists() or path.read_text() != text:
            raise SystemExit(f'Generated inventory differs: {path.relative_to(ROOT)}')
    print(dumps(report['summary']))


if __name__ == '__main__':
    main()

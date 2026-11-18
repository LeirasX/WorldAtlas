"""Prepare private CSVs and, with the specified Natural Earth input, the public snapshot."""
import argparse
import csv
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONTINENTS = {
    'africa': 'Africa', 'asia': 'Asia', 'europe': 'Europe',
    'north_america': 'North America', 'oceania': 'Oceania', 'south_america': 'South America',
}
FIELDS = dict(zip(['Area', 'Pop.', '/km²', 'Net €', 'Rent €', 'Left €', 'Lang.', 'Climate', 'Society'],
                  ['area', 'population', 'density', 'net', 'rent', 'left', 'language', 'climate', 'society']))
SOURCE_NAMES = {
    'Central African Rep.': 'Central African Republic', 'Congo Rep.': 'Republic of the Congo',
    'DR Congo': 'Democratic Republic of the Congo', 'Dominican Rep.': 'Dominican Republic',
    'St Kitts & Nevis': 'Saint Kitts and Nevis', 'St Lucia': 'Saint Lucia',
    'St Vincent & Gren.': 'Saint Vincent and the Grenadines',
}
ALIASES = {
    'USA': 'USA|America|United States of America', 'GBR': 'UK|Britain|Great Britain',
    'NLD': 'Holland', 'CZE': 'Czech Republic', 'TUR': 'Turkey|Türkiye',
    'KOR': 'Republic of Korea|South Korea', 'PRK': 'DPRK|North Korea',
    'VAT': 'Holy See|Vatican', 'PSE': 'State of Palestine', 'CPV': 'Cape Verde',
    'CIV': 'Ivory Coast', 'MMR': 'Burma', 'SWZ': 'Swaziland',
}
PROVENANCE = {
    'net': {
        'source': ('Salary source', 'wage_url', 'Wage source', 'Wage source URL'),
        'year': ('Salary period', 'wage_year', 'Wage year', 'Wage reference year', 'Wage reference'),
        'basis': ('Salary reference', 'wage_source', 'Wage basis', 'Wage definition and calculation', 'Salary type and coverage'),
        'confidence': ('Wage confidence', 'Salary confidence'),
    },
    'rent': {
        'source': ('Rent source', 'rent_url', 'Rent source URL'),
        'year': ('Rent period', 'rent_year', 'Rent year', 'Rent reference year', 'Rent reference'),
        'basis': ('Rent reference', 'rent_source', 'Rent basis', 'Rent definition and calculation', 'Rental type and evidence'),
        'confidence': ('Rent confidence',),
    },
    'essentials': {'source': ('Cost URL', 'Essentials source', 'Cost-of-living source', 'Cost-index source')},
    'population': {'source': ('Population source',), 'year': ('Population year',)},
}
SOURCE_VALUES = {
    'net': ('Net €', 'net_eur', 'Estimated net monthly EUR', 'Net € (estimated)'),
    'rent': ('Rent €', 'rent_eur', 'Estimated rent monthly EUR', 'Rent € (estimated)'),
    'left': ('Left €', 'left_eur', 'Monthly leftover EUR (model)', 'Left € (modeled)'),
    'essentials': ('Essentials €', 'essentials_eur', 'Monthly total essentials EUR (model)', 'Essentials € (modeled)'),
}

def key(value):
    text = unicodedata.normalize('NFKD', value).casefold().replace('&', ' and ')
    return re.sub('[^a-z0-9]', '', text)

def read(path):
    with path.open(encoding='utf-8-sig', newline='') as file:
        return list(csv.DictReader(file))

def write(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    headers = dict.fromkeys(field for row in rows for field in row)
    with path.open('w', encoding='utf-8', newline='') as file:
        writer = csv.DictWriter(file, headers, lineterminator='\n')
        writer.writeheader()
        writer.writerows(rows)

def first(row, fields):
    return next((row[field] for field in fields if row.get(field)), '')

def simplify_coordinates(data):
    if isinstance(data[0], (float, int)):
        return [round(coord, 4) for coord in data[:2]]
    return [simplify_coordinates(item) for item in data]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--natural-earth', type=Path, help='Natural Earth 5.1.2 Admin 0 Countries GeoJSON')
    args = parser.parse_args()
    features = json.loads(args.natural_earth.read_text())['features'] if args.natural_earth else []
    by_alpha2 = {item['properties']['ISO_A2_EH']: item['properties'] for item in features}
    by_alpha2.pop('-99', None)
    public = ROOT / 'Data/public'
    for slug, continent in CONTINENTS.items():
        originals = list((ROOT / 'Context/OriginalData').glob(f'{slug}_*_countries_2026.csv'))
        if len(originals) != 1:
            raise ValueError(f'Expected one original CSV for {continent}')
        original = originals[0]
        sources = ROOT / 'Context/Sources' / original.name.replace('_countries_', '_sources_confidence_')
        source_lookup = {key(next(iter(row.values()))): row for row in read(sources)}
        registry = {row['alpha2']: row for row in read(public / f'{slug}.csv')} if not features else {}
        local_rows, public_rows = [], []
        for row in read(original):
            flag, name = row['Country'].split(' ', 1)
            alpha2 = ''.join(chr(ord(part) - 127397) for part in flag)
            if features:
                props = by_alpha2[alpha2]
                iso = props['ISO_A3_EH']
                entry = {'id': iso, 'alpha2': alpha2, 'country': SOURCE_NAMES.get(name, name),
                         'flag': flag, 'continent': continent, 'aliases': ALIASES.get(iso, '')}
                public_rows.append(dict(entry, population=f"~{props['POP_EST']}" if props['POP_EST'] > 0 else '',
                                        population__year=props['POP_YEAR'],
                                        population__source='https://www.naturalearthdata.com/downloads/50m-cultural-vectors/',
                                        income_group=props['INCOME_GRP'].split('. ', 1)[-1]))
            else:
                entry = {k: registry[alpha2][k] for k in ('id', 'alpha2', 'country', 'flag', 'continent', 'aliases')}
            provenance = source_lookup[key(SOURCE_NAMES.get(name, name))]
            local = dict(entry)
            local.update({FIELDS.get(field, field): value for field, value in row.items() if field != 'Country'})
            for metric, keys in SOURCE_VALUES.items():
                field = next((field for field in keys if provenance.get(field)), '')
                source_value = provenance.get(field, '')
                if source_value:
                    local[f'{metric}__sourceValue'] = source_value
                    if 'estimated' in field.lower() or 'model' in field.lower():
                        local[f'{metric}__estimated'] = 'true'
                    if metric == 'essentials':
                        local[metric] = source_value if source_value.upper() in ('N/A', 'NA', '—') else f'~{source_value.lstrip(chr(126))}'
            for metric, fields in PROVENANCE.items():
                for attribute, keys in fields.items():
                    local[f'{metric}__{attribute}'] = first(provenance, keys)
            confidence = first(provenance, ('Confidence', 'Overall confidence', 'financial_confidence'))
            caveat = first(provenance, ('Caveats', 'Data quality caveat', 'Caution', 'notes'))
            for metric in ('net', 'rent', 'essentials', 'left'):
                local[f'{metric}__confidence'] = local.get(f'{metric}__confidence') or confidence
                local[f'{metric}__notes'] = caveat
            local['research__record'] = json.dumps(provenance, ensure_ascii=False)
            local_rows.append(local)
        write(ROOT / 'Data/local' / f'{slug}.csv', local_rows)
        if features:
            write(public / f'{slug}.csv', public_rows)

    if features:
        outlines = []
        for item in features:
            props = item['properties']
            outline = {
                'id': props['ISO_A3_EH'] if props['ISO_A3_EH'] != '-99' else props['ADM0_A3'],
                'name': props['NAME'], 'point': [props['LABEL_X'], props['LABEL_Y']],
                'polygons': simplify_coordinates(item['geometry']['coordinates']),
            }
            if item['geometry']['type'] == 'Polygon':
                outline['polygons'] = [outline['polygons']]
            outlines.append(outline)
        (ROOT / 'public/world-map.json').write_text(json.dumps(outlines, separators=(',', ':')))

if __name__ == '__main__':
    main()

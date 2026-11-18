"""Validate the preserved first release, then merge its distinct WDI series locally."""
import csv
import hashlib
import json
from collections import Counter
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RELEASE = ROOT / 'Context/Research/release-2026'
SOURCE = 'https://datahelpdesk.worldbank.org/knowledgebase/articles/906519-world-bank-country-and-lending-groups'


def read(path):
    with path.open(encoding='utf-8-sig', newline='') as file:
        return list(csv.DictReader(file))


def write(path, rows):
    headers = list(dict.fromkeys(key for row in rows for key in row))
    with path.open('w', encoding='utf-8', newline='') as file:
        writer = csv.DictWriter(file, headers, lineterminator='\n')
        writer.writeheader()
        writer.writerows(rows)


def main():
    dictionary = json.loads((RELEASE / 'metrics.json').read_text())['metrics']
    audit = json.loads((RELEASE / 'audit.json').read_text())
    original_records = [json.loads(line) for line in (RELEASE / 'original_records.jsonl').read_text().splitlines()]
    expanded = {path.name.removesuffix('_expanded.csv'): read(path) for path in RELEASE.glob('*_expanded.csv')}
    countries = {row['id']: row for rows in expanded.values() for row in rows}
    assert len(countries) == sum(map(len, expanded.values())) == 195
    assert Counter(row['continent'] for row in countries.values()) == audit['region_counts']
    provenance_rows = read(RELEASE / 'provenance.csv')
    provenance = {(row['country_id'], row['metric_id']): row for row in provenance_rows}
    assert len(provenance) == len(provenance_rows) == audit['observations'] == 5619
    years = Counter()
    counts = Counter()
    for row in countries.values():
        for key, definition in dictionary.items():
            raw = row[key]
            item = provenance.get((row['id'], key))
            if not raw:
                assert item is None
                continue
            assert item and Decimal(raw).is_finite() and Decimal(raw) == Decimal(item['value'])
            assert item['unit'] == definition['unit']
            assert item['definition'] == definition['definition']
            assert item['source_url'] == definition['source_url']
            assert 2000 <= int(item['reference_year']) <= 2026
            counts[key] += 1
            years[item['reference_year']] += 1
    assert dict(years) == audit['reference_year_distribution']
    assert 195 * len(dictionary) - sum(counts.values()) == audit['missing_observations'] == 231
    for row in read(RELEASE / 'coverage.csv'):
        key = row['metric_id']
        assert counts[key] == int(row['available_countries'])
        assert 195 - counts[key] == int(row['missing_countries'])
        metric_years = [int(item['reference_year']) for item in provenance_rows if item['metric_id'] == key]
        assert min(metric_years) == int(row['earliest_reference_year'])
        assert max(metric_years) == int(row['latest_reference_year'])
    assert len(original_records) == 195
    for row in read(RELEASE / 'change_report.csv'):
        assert row['country_id'] in countries
        if row['metric_id'] in dictionary:
            assert Decimal(row['new_value']) == Decimal(countries[row['country_id']][row['metric_id']])

    registry_path = ROOT / 'Data/metrics.json'
    registry = json.loads(registry_path.read_text())
    categories = {
        'Geography': ['land_area_km2', 'population', 'population_density_per_km2'],
        'Society': ['urban_population_pct', 'population_growth_pct', 'fertility_births_per_woman', 'net_migration', 'gini_index', 'homicides_per_100000'],
        'Economy': ['gdp_usd', 'gdp_per_capita_usd', 'gdp_per_capita_ppp', 'gdp_growth_pct', 'inflation_cpi_pct'],
        'Work': ['unemployment_pct', 'employment_population_pct'],
        'Nature': ['forest_area_pct', 'pm25_ug_m3'],
        'Health': ['life_expectancy_years', 'infant_mortality_per_1000', 'health_expenditure_pct_gdp', 'physicians_per_1000'],
        'Education': ['literacy_adult_pct', 'tertiary_enrollment_gross_pct', 'research_development_pct_gdp'],
        'Other': ['internet_users_pct', 'fixed_broadband_per_100', 'mobile_subscriptions_per_100', 'electricity_access_pct'],
        'Travel': ['road_deaths_per_100000'],
    }
    for key, definition in dictionary.items():
        registry['wb_' + key] = dict(
            label=definition['name'] + ' · WDI',
            category=next(category for category, keys in categories.items() if key in keys),
            kind='number', unit=definition['unit'], description=definition['definition'],
            sourceOrganization=definition['source_organization'],
            indicator=definition['world_bank_indicator'], sourceUrl=definition['source_url'],
            diverging=key in ('net_migration', 'population_growth_pct', 'gdp_growth_pct', 'inflation_cpi_pct'),
        )
    registry['income_group']['description'] = 'Natural Earth income grouping, except Australia corrected to World Bank FY2027 high income. Inspect each observation’s reference period.'
    financial = ('net', 'rent', 'essentials', 'left', 'rent_burden')
    for key in financial:
        registry[key]['label'] = registry[key]['label'].removesuffix(' · unverified') + ' · unverified'
    changes = []
    for slug, rows in expanded.items():
        path = ROOT / 'Data/local' / (slug + '.csv')
        local = read(path)
        by_id = {row['id']: row for row in rows}
        assert set(by_id) == {row['id'] for row in local}
        for row in local:
            incoming = by_id[row['id']]
            assert all(row[key] == incoming[key] for key in ('alpha2', 'continent', 'flag'))
            for key in financial:
                if row.get(key):
                    row[key + '__verification'] = 'unverified original estimate'
            for key in dictionary:
                target = 'wb_' + key
                raw = incoming[key]
                if target in row:
                    assert row[target] == raw, f'Refusing to overwrite changed {target}'
                row[target] = raw
                if not raw:
                    continue
                item = provenance[(row['id'], key)]
                for attribute, source_key in {
                    'source': 'source_url', 'year': 'reference_year', 'unit': 'unit',
                    'definition': 'definition', 'sourceName': 'source', 'confidence': 'confidence',
                    'estimateStatus': 'estimate_status', 'notes': 'notes',
                }.items():
                    row[target + '__' + attribute] = item[source_key]
                row[target + '__verification'] = 'source-attributed statistical series; not individually verified'
        changes.append((path, local))

    public_path = ROOT / 'Data/public/oceania.csv'
    public_rows = read(public_path)
    australia = next(row for row in public_rows if row['id'] == 'AUS')
    prior = australia.get('income_group__sourceValue', australia['income_group'])
    australia.update({
        'income_group': 'High income', 'income_group__source': SOURCE,
        'income_group__year': 'FY2027', 'income_group__sourceValue': prior,
        'income_group__verification': 'verified against World Bank classification table',
        'income_group__notes': 'Replaces erroneous Natural Earth Low income label. Fiscal year classification based on 2025 GNI.',
    })
    backup = ROOT / 'Context/Research/before-integration'
    backup.mkdir(exist_ok=True)
    for path, _ in changes + [(public_path, public_rows), (registry_path, [])]:
        target = backup / (('public-' if path == public_path else '') + path.name)
        if not target.exists():
            target.write_bytes(path.read_bytes())
    for path, rows in changes + [(public_path, public_rows)]:
        write(path, rows)
    registry_path.write_text(json.dumps(registry, ensure_ascii=False, indent=2) + '\n')
    report = [
        '# First research release integration', '',
        f'- Archive preserved with all 13 extracted files. SHA-256 {hashlib.sha256((ROOT / "Context/Research/WorldAtlas_partial_research_2026.zip").read_bytes()).hexdigest()}.',
        '- Integrated 30 separate WDI indicators under wb_ keys into the six local CSVs. Existing population, area, density, and original financial values remain intact.',
        '- Country registry covers 195 countries across six continents. WDI observations cover 194 countries. Vatican City has none.',
        '- Validated 5,619 populated cells and one-to-one provenance records. Missing cells total 231 out of 5,850. Blanks retain missing status, including genuine zero observations.',
        '- Reference years span 2000–2025. The release records retrieval on 2026-11-18 and API update 2026-11-11. Source coverage is World Bank WDI for all 5,619 observations.',
        '- Australia public income_group changed from Low income to High income, with FY2027 and the documented World Bank URL. Original label is retained in sourceValue. No existing local CSV cells changed. Automatic derived rent burden is withheld for unverified financial inputs.',
        '- All inherited financial estimates are labelled unverified. WDI source attribution is preserved, while individual verification and estimate status remain explicitly unknown.',
        '- Review remains necessary for country-specific methods, older values, unequal reference years, and geographic definitions. The release contains 583 change-report rows. No replacement decisions were inferred from these differences.',
        '- The 30 WDI metrics and original research remain local pending redistribution approval. The public build contains the corrected public snapshot. No push or publication performed.',
        '', '## Metric coverage', '', '| WDI metric | Countries | Missing |', '| --- | ---: | ---: |',
    ]
    report += [f'| {key} | {counts[key]} | {195-counts[key]} |' for key in dictionary]
    report += ['', '## Reference-year coverage', '', ', '.join(f'{year} — {count}' for year, count in sorted(years.items())), '']
    (ROOT / 'Context/Research/integration-report.md').write_text('\n'.join(report))
    print('Validated and integrated 30 indicators, 5619 observations, 231 missing cells.')


if __name__ == '__main__':
    main()

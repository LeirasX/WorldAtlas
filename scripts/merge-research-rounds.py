"""Validate four preserved releases and merge dated, scoped local observations."""
import calendar
import csv
import json
import re
from collections import Counter
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RESEARCH = ROOT / 'Context/Research'
SLUGS = ('africa', 'asia', 'europe', 'north_america', 'oceania', 'south_america')


def read(path):
    with path.open(encoding='utf-8-sig', newline='') as file:
        reader = csv.DictReader(file)
        assert reader.fieldnames and len(reader.fieldnames) == len(set(reader.fieldnames)), path
        rows = list(reader)
        assert all(None not in row and None not in row.values() for row in rows), path
        return rows


def write(path, rows, headers=None):
    headers = headers or list(dict.fromkeys(key for row in rows for key in row))
    with path.open('w', encoding='utf-8', newline='') as file:
        writer = csv.DictWriter(file, headers, lineterminator='\n')
        writer.writeheader()
        writer.writerows(rows)


def validate_release(folder, suffix, dictionary_name, provenance_name, registry):
    dictionary = json.loads((folder / dictionary_name).read_text())['metrics']
    tables = {slug: read(folder / f'{slug}_{suffix}.csv') for slug in SLUGS}
    ids = [row['id'] for rows in tables.values() for row in rows]
    assert len(ids) == len(set(ids)) == 195 and set(ids) == set(registry)
    fields = set(dictionary)
    identity = {'id', 'alpha2', 'country', 'continent', 'flag', 'aliases'}
    for slug, rows in tables.items():
        expected = {key for key, item in registry.items() if item['slug'] == slug}
        assert {row['id'] for row in rows} == expected, slug
        for row in rows:
            assert set(row) - identity == fields, slug
            assert all(row[key] == registry[row['id']][key] for key in ('alpha2', 'continent'))
    provenance_rows = read(folder / provenance_name)
    if suffix == 'round4':
        provenance_rows = [row for row in provenance_rows if row['observation_id'].startswith('country:')]
    provenance = {(row['country_id'], row['metric_id']): row for row in provenance_rows}
    assert len(provenance) == len(provenance_rows), 'Duplicate provenance'
    populated = {}
    for rows in tables.values():
        for row in rows:
            for key, metric in dictionary.items():
                if row[key] == '':
                    assert (row['id'], key) not in provenance
                    continue
                value = Decimal(row[key])
                assert value.is_finite()
                item = provenance[(row['id'], key)]
                assert value == Decimal(item['value'])
                assert item['unit'] == metric['unit'] and item['definition'] == metric['definition']
                assert item['source_url'].startswith(('https://', 'http://'))
                period = item.get('reference_year', item.get('reference_period', item.get('period', '')))
                assert re.fullmatch(r'\d{4}(?:[-–]\d{4}|-\d{2}(?:-\d{2})?|-Q[1-4])?', period), period
                populated[(row['id'], key)] = item
    assert set(populated) == set(provenance), 'Extra or missing provenance'
    return dictionary, tables, provenance


def merge_observation(row, target, incoming):
    """Never overwrite an existing observation or enrich it with conflicting metadata."""
    if not row.get(target):
        row.update(incoming)
        return 'added', []
    fields = [field for field, value in incoming.items() if row.get(field) and row[field] != value]
    if fields:
        # Different periods in the same series coexist. Scope and definition changes require review.
        compatible = all(row.get(target + '__' + key) == incoming.get(target + '__' + key)
                         for key in ('unit', 'definition', 'currency', 'basis', 'sourceLocation'))
        if (compatible and row.get(target + '__unit') and row.get(target + '__definition')
                and row.get(target + '__year') and incoming.get(target + '__year')
                and row[target + '__year'] != incoming[target + '__year']):
            return append_history(row, target, wide_record(target, incoming))
        return 'conflict', fields
    for field, value in incoming.items():
        if not row.get(field):
            row[field] = value
    return 'overlap', []


def wide_record(target, fields):
    record = {'value': float(Decimal(fields[target])), 'raw': fields[target]}
    for key, value in fields.items():
        if key.startswith(target + '__') and value:
            attribute = key[len(target) + 2:]
            record[attribute] = value == 'true' if attribute in ('estimated', 'calculated') else value
    return record


def append_history(row, target, record):
    records = json.loads(row.get('research__history') or '[]')
    incoming = dict(metricId=target, **record)
    identity = ('metricId', 'year', 'scope', 'basis', 'sourceLocation', 'currency', 'unit', 'definition')
    for existing in records:
        if all(existing.get(key, '') == incoming.get(key, '') for key in identity):
            if existing == incoming:
                return 'overlap', []
            return 'conflict', [key for key in incoming if existing.get(key) != incoming[key]]
    records.append(incoming)
    row['research__history'] = json.dumps(records, ensure_ascii=False, separators=(',', ':'))
    return 'history', []


def integrate_round4(local, metrics, public, counts, conflicts, coverage, summaries):
    folder = RESEARCH / 'round4-2026'
    dictionary, tables, national = validate_release(folder, 'round4', 'metrics_round4.json',
                                                    'provenance_round4.csv', public)
    rows = read(folder / 'provenance_round4.csv')
    provenance = {row['observation_id']: row for row in rows}
    assert len(provenance) == len(rows), 'Duplicate Round 4 observation ID'
    city = read(folder / 'city_housing_round4.csv')
    assert len({row['observation_id'] for row in city}) == len(city)
    assert set(provenance) == {row['observation_id'] for row in city} | {row['observation_id'] for row in national.values()}
    for row in city:
        item = provenance[row['observation_id']]
        assert all(row[key] == item[key] for key in row)
        assert row['country_id'] in public and row['metric_id'] in dictionary
        assert not row['geographic_scope'] == 'national'
        assert Decimal(row['value']).is_finite()
        assert item['unit'] == dictionary[row['metric_id']]['unit']
        assert item['definition'] == dictionary[row['metric_id']]['definition']
        assert item['source_url'].startswith('https://')
        assert re.fullmatch(r'\d{4}(?:-Q[1-4])?', row['period'])
    audit = json.loads((folder / 'audit_round4.json').read_text())
    assert len(national) == audit['national_observations']
    assert len(city) == audit['city_observations']
    assert len(rows) == audit['total_observations']
    assert dict(Counter(row['source'] for row in rows)) == audit['source_counts']
    assert dict(Counter(row['period'] for row in rows)) == audit['period_counts']
    assert dict(Counter(row['status'] for row in rows)) == audit['status_counts']
    change = json.loads((folder / 'change_report_round4.json').read_text())
    assert change['corrections'] == change['replacements'] == change['conflicts'] == []
    blocked = set()
    source_coverage = {row['metric_id']: row for row in read(folder / 'coverage_round4.csv')}
    for key, definition in dictionary.items():
        target = 'r4_' + key
        has_national = any(metric == key for _, metric in national)
        candidate = dict(label=definition['name'] + ' · Round 4',
                         category='Housing' if definition['category'].startswith('housing') else 'Economy',
                         kind='number', unit=definition['unit'], description=definition['definition'],
                         allowMap=has_national, allowStatistics=has_national, allowDifferences=has_national)
        if target in metrics and metrics[target] != candidate:
            blocked.add(target)
            conflicts.append(dict(release='round4', country='', metric=target, fields='metric definition',
                                  existing=json.dumps(metrics[target]), incoming=json.dumps(candidate)))
        else:
            metrics[target] = candidate
        item = source_coverage[key]
        national_countries = {country for country, metric in national if metric == key}
        city_countries = {row['country_id'] for row in city if row['metric_id'] == key}
        observed = sum(row['metric_id'] == key for row in rows)
        assert len(national_countries) == int(item['countries_national_values'])
        assert len(city_countries) == int(item['countries_city_values'])
        assert observed == int(item['observations'])
        assert 195 - len(national_countries) == int(item['missing_national_countries'])
        coverage.append(dict(release='round4', metric=target, available=len(national_countries),
                             missing=195 - len(national_countries)))
    by_id = {row['id']: row for table in local.values() for row in table}
    for slug, table in tables.items():
        for row in table:
            for key in dictionary:
                by_id[row['id']].setdefault('r4_' + key, '')
    for item in rows:
        target = 'r4_' + item['metric_id']
        if target in blocked:
            counts['round4_withheld_definition_conflict'] += 1
            continue
        incoming = {target: item['value']}
        attributes = dict(source='source_url', year='period', basis='geographic_scope', scope='geographic_scope',
                          sourceLocation='geographic_name', unit='unit', currency='currency', definition='definition',
                          method='method', sourceStatus='status', estimateStatus='status', confidence='confidence',
                          notes='notes', sourceName='source', observationId='observation_id')
        incoming.update({target + '__' + attribute: item[field] for attribute, field in attributes.items()})
        incoming[target + '__verification'] = 'source-attributed statistical series; not individually verified'
        incoming[target + '__estimated'] = 'true'
        if item['status'].startswith('calculated'):
            incoming[target + '__calculated'] = 'true'
        row = by_id[item['country_id']]
        if item['observation_id'].startswith('country:'):
            outcome, fields = merge_observation(row, target, incoming)
        else:
            outcome, fields = append_history(row, target, wide_record(target, incoming))
        counts['round4_' + outcome] += 1
        if fields:
            conflicts.append(dict(release='round4', country=item['country_id'], metric=target,
                                  fields=', '.join(fields), existing=json.dumps({key: value for key, value in row.items() if key == target or key.startswith(target + '__') or key == 'research__history'}), incoming=json.dumps(incoming)))
    summaries.append(dict(release='round4', metrics=len(dictionary), populated_metrics=len({r['metric_id'] for r in rows}),
                          observations=len(rows), national_observations=len(national), local_observations=len(city),
                          countries=len({r['country_id'] for r in rows}), missing=195 * len(dictionary) - len(national),
                          sources=audit['source_counts'], periods=audit['period_counts']))


def round2_metric(key, item):
    source = item.get('source')
    if key.startswith('climate_temp_c_'):
        label = f'{calendar.month_name[int(key[-2:])]} temperature · CRU'
    elif key.startswith('climate_precip_mm_'):
        label = f'{calendar.month_name[int(key[-2:])]} precipitation · CRU'
    else:
        label = key.replace('_', ' ').capitalize() + (f' · {source}' if source else '')
    local_currency = item['unit'] == 'local currency/month'
    if local_currency:
        label += ' (variable currency)'
    return dict(
        label=label, category='Climate' if key.startswith('climate_') else 'Work',
        kind='text' if item['unit'] == 'text' else 'number', unit=item['unit'],
        description=item['definition'], sourceOrganization=source or '',
        allowMap=not local_currency and key != 'actual_annual_hours_per_worker_oecd',
        allowStatistics=not local_currency,
        allowDifferences=not local_currency and key != 'actual_annual_hours_per_worker_oecd',
        percentageDifference=item['unit'] != '°C',
        diverging=item['unit'] == '°C',
    )


def round3_metric(key, item):
    label = item['name']
    if key.startswith('legal_'):
        label += ' · historical May 2019'
    elif key.startswith('paid_'):
        label += ' · legal case October 2025'
    elif key.startswith('median_monthly_employee_earnings_unspecified_'):
        label += ' · ILO median · ' + ('LCU' if key.endswith('_lcu') else 'USD')
    elif key.startswith('oecd_'):
        label += ' · 2025 OECD scenario'
    local_currency = item['unit'].startswith('local currency/')
    if local_currency:
        label += ' (variable currency)'
    category = {'income': 'Economy', 'income_tax': 'Economy', 'employment_rights': 'Work',
                'housing': 'Housing', 'living_cost': 'Economy', 'climate': 'Climate'}[item['category']]
    return dict(
        label=label, category=category, kind='text' if item['data_type'] == 'string' else 'number',
        unit=item['unit'], description=item['definition'],
        aggregationNotes=item['aggregation_compatibility'], geographicScope=item['geographic_scope'],
        allowStatistics=not local_currency, allowDifferences=not local_currency,
        allowMap=not local_currency and item['geographic_scope'] != 'Dublin region',
    )


def main():
    public = {}
    for slug in SLUGS:
        for row in read(ROOT / f'Data/public/{slug}.csv'):
            public[row['id']] = dict(row, slug=slug)
    registry_path = ROOT / 'Data/metrics.json'
    metrics = json.loads(registry_path.read_text())
    releases = [
        ('round1', RESEARCH / 'release-2026', 'expanded', 'metrics.json', 'provenance.csv', 'wb_'),
        ('round2', RESEARCH / 'round2-2026', 'round2', 'metrics_round2.json', 'provenance_round2.csv', 'r2_'),
        ('round3', RESEARCH / 'round3-2026', 'round3', 'metrics_round3.json', 'provenance_round3.csv', 'r3_'),
    ]
    local = {slug: read(ROOT / f'Data/local/{slug}.csv') for slug in SLUGS}
    for slug, rows in local.items():
        assert len({row['id'] for row in rows}) == len(rows)
        assert {row['id'] for row in rows} == {key for key, item in public.items() if item['slug'] == slug}
    counts = Counter()
    conflicts = []
    upstream_conflicts = []
    coverage = []
    summaries = []
    original_metric_ids = set()
    for name, folder, suffix, dictionary_name, provenance_name, prefix in releases:
        dictionary, tables, provenance = validate_release(folder, suffix, dictionary_name, provenance_name, public)
        original_metric_ids.update(dictionary)
        audit_name = 'audit.json' if name == 'round1' else f'audit_{name}.json'
        audit = json.loads((folder / audit_name).read_text())
        assert len(provenance) == audit['observations']
        if name != 'round1':
            assert len(dictionary) == audit['metric_count']
            assert len({country for country, _ in provenance}) == audit['country_with_any_observation']
        period_field = 'reference_year' if name == 'round1' else 'reference_period'
        periods = Counter(item[period_field] for item in provenance.values())
        sources = Counter(item['source'] for item in provenance.values())
        assert dict(periods) == audit.get('reference_year_distribution', audit.get('reference_period_counts'))
        if name != 'round1':
            assert dict(sources) == audit.get('source_observations', audit.get('source_counts'))
            withheld = read(folder / f'conflicts_{name}.csv')
            assert len(withheld) == audit.get('withheld_conflicts_count', audit.get('withheld_conflicts'))
            assert all(row['country_id'] in public for row in withheld)
            upstream_conflicts.extend(dict(release=name, **row) for row in withheld)
            if name == 'round3':
                assert dict(Counter(item['estimate_status'] for item in provenance.values())) == audit['status_counts']
                assert dict(Counter(item['confidence'] for item in provenance.values())) == audit['confidence_counts']
                # Each unresolved multi-city case must remain absent from all 2019 country benchmarks.
                by_id = {row['id']: row for rows in tables.values() for row in rows}
                for conflict in withheld:
                    assert all(not value for key, value in by_id[conflict['country_id']].items() if key.startswith('legal_'))
                change_report = json.loads((folder / 'change_report_round3.json').read_text())
                assert change_report['corrections_or_replacements'] == []
        source_coverage = {row['metric_id']: row for row in read(folder / ('coverage.csv' if name == 'round1' else f'coverage_{name}.csv'))}
        blocked_metrics = set()
        for key, definition in dictionary.items():
            target = prefix + key
            available = sum(metric == key for _, metric in provenance)
            expected = source_coverage[key]
            assert available == int(expected.get('available_countries', expected.get('countries_with_value', expected.get('countries_with_data'))))
            assert 195 - available == int(expected.get('missing_countries', expected.get('countries_missing')))
            coverage.append({'release': name, 'metric': target, 'available': available, 'missing': 195 - available})
            if name != 'round1':
                candidate = round2_metric(key, definition) if name == 'round2' else round3_metric(key, definition)
                if target in metrics and metrics[target] != candidate:
                    blocked_metrics.add(target)
                    conflicts.append({'release': name, 'country': '', 'metric': target, 'fields': 'metric definition', 'existing': json.dumps(metrics[target]), 'incoming': json.dumps(candidate)})
                else:
                    metrics[target] = candidate
            else:
                assert metrics[target]['unit'] == definition['unit']
                assert metrics[target]['description'] == definition['definition']
        for slug, incoming_rows in tables.items():
            by_id = {row['id']: row for row in incoming_rows}
            for row in local[slug]:
                incoming_row = by_id[row['id']]
                for key in dictionary:
                    target = prefix + key
                    raw = incoming_row[key]
                    if target in blocked_metrics:
                        counts[name + '_withheld_definition_conflict'] += bool(raw)
                        continue
                    if not raw:
                        if row.get(target):
                            counts[name + '_missing_kept_existing'] += 1
                        else:
                            row.setdefault(target, '')
                        continue
                    item = provenance[(row['id'], key)]
                    incoming = {target: raw}
                    attributes = {
                        'source': 'source_url', 'unit': 'unit', 'definition': 'definition',
                        'sourceName': 'source', 'confidence': 'confidence', 'year': period_field,
                    }
                    if name == 'round1':
                        attributes.update(estimateStatus='estimate_status', notes='notes')
                    elif name == 'round2':
                        attributes.update(sourceStatus='status', notes='source_notes', basis='geographic_basis', sourceCode='source_code')
                    else:
                        attributes.update(estimateStatus='estimate_status', sourceStatus='estimate_status', notes='caveats',
                                          basis='geographic_scope', sourceLocation='source_location', currency='currency', method='method')
                    incoming.update({target + '__' + attribute: item[source_field] for attribute, source_field in attributes.items()})
                    incoming[target + '__verification'] = 'source-attributed statistical series; not individually verified'
                    if name == 'round2':
                        incoming[target + '__estimateStatus'] = 'unknown; source methods may include interpolation or harmonization'
                    if name == 'round3':
                        status = item['estimate_status'].lower()
                        if 'modeled' in status or 'statistical estimate' in status:
                            incoming[target + '__estimated'] = 'true'
                        if status.startswith('calculated'):
                            incoming[target + '__calculated'] = 'true'
                    outcome, fields = merge_observation(row, target, incoming)
                    counts[name + '_' + outcome] += 1
                    if fields:
                        conflicts.append({'release': name, 'country': row['id'], 'metric': target, 'fields': ', '.join(fields),
                                          'existing': json.dumps({field: row[field] for field in fields}, ensure_ascii=False),
                                          'incoming': json.dumps(incoming, ensure_ascii=False)})
        summaries.append({'release': name, 'metrics': len(dictionary), 'populated_metrics': len({key for _, key in provenance}),
                          'observations': len(provenance), 'missing': 195 * len(dictionary) - len(provenance),
                          'countries': len({country for country, _ in provenance}), 'sources': dict(sources), 'periods': dict(periods)})

    integrate_round4(local, metrics, public, counts, conflicts, coverage, summaries)

    # Stage every output before replacing it, keeping source archives and prior snapshots intact.
    staged = []
    for slug, rows in local.items():
        path = ROOT / f'Data/local/{slug}.csv'
        pending = path.with_suffix('.pending')
        write(pending, rows)
        assert pending.stat().st_size <= 4 * 1024 * 1024, f'{slug} exceeds native import limit'
        staged.append((pending, path))
    for pending, path in staged:
        pending.replace(path)
    registry_path.write_text(json.dumps(metrics, ensure_ascii=False, indent=2) + '\n')
    write(RESEARCH / 'rounds-coverage.csv', coverage)
    write(RESEARCH / 'rounds-conflicts.csv', conflicts,
          ['release', 'country', 'metric', 'fields', 'existing', 'incoming'])
    summary = dict(releases=summaries, merge_counts=dict(counts), conflicts=len(conflicts))
    write(RESEARCH / 'rounds-upstream-conflicts.csv', upstream_conflicts,
          ['release', 'country_id', 'metric_id', 'period', 'evidence', 'action'])
    summary['upstream_conflicts'] = len(upstream_conflicts)
    (RESEARCH / 'rounds-audit.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n')
    total = sum(item['observations'] for item in summaries)
    missing = sum(item['missing'] for item in summaries)
    lines = [
        '# Research rounds 1–4 integration audit', '',
        '- Four original archives and all extracted files are preserved in Context/Research. The pre-Round-4 local CSVs, registry, and earlier audits are retained in before-round4.',
        '- All six continent files in each release match the existing 195 unique country IDs and continent memberships.',
        f'- Research totals are {total:,} observations (including 80 local records) and {missing:,} missing national cells across the separate release series. Release-specific coverage is listed below.',
        f'- Merge outcomes are {json.dumps(dict(counts), sort_keys=True)}. New merge conflicts total {len(conflicts)}. Upstream withheld conflicts total {len(upstream_conflicts)}.',
        '- Eleven 2019 legal case studies cover multiple cities. Those country-level benchmark cells remain blank. Full evidence and source actions are preserved in rounds-upstream-conflicts.csv.',
        '- Round 1 and Round 2 observations and original unverified financial values are retained. Round 3 uses r3_ IDs. Shared empty research placeholders are retained as distinct release definitions and are never filled from an incompatible metric.',
        '- ILO medians retain unspecified gross/net accounting. They remain separate from ILO employee means, original net estimates, and OECD tax scenarios. Local currencies and USD are distinct; no exchange rates were invented.',
        '- OECD amounts retain the 2025 single, childless, average-wage scenario. Supplied monthly equivalents remain calculated annual amounts divided by 12. They are labelled modeled/calculated using the source status.',
        '- Employment-law case studies are labelled historical May 2019. WBL leave uses the October 1 2025 case definition. Working days and calendar days retain distinct units; neither is presented as current universal entitlement.',
        '- UK one-bedroom property rent and Ireland national/Dublin apartment rents retain their separate sources, geographies, tenancy definitions and reference periods. No financial residuals were calculated.',
        '- Source URLs, definitions, units, periods, confidence, methods, source status, currency and geographic limitations remain attached to observations. Local-currency statistics, differences and map coloring are disabled. Dublin-specific rents are excluded from national choropleths.',
        '- Round 4 national indicators use r4_ IDs. Additional dates and local geographies use research__history inside the same six CSVs. Current primary national values are preserved; additional records retain their own periods and source metadata. Canadian composites and Norwegian rental zones are never promoted to national estimates.',
        '- Round 4 keeps Norway room counts separate from bedrooms, Canadian asking/paid rents distinct, Eurostat one-adult income shares separate from rent prices, and US consumer-unit averages separate from essential budgets.',
        '- Original gaps remain in verified gross/net median earnings, broad housing and expense coverage, current employment law and holidays, sunshine and climate classification. Individual source comparability and publication rights still require review.',
        '- Public country CSVs remain unchanged. This integration is local-only, with no push, deployment or visibility change.',
        '', '## Release coverage', '',
        '| Release | Defined metrics | Populated metrics | Observations | Countries with data | Missing cells |',
        '| --- | ---: | ---: | ---: | ---: | ---: |',
    ]
    lines += [f"| {item['release']} | {item['metrics']} | {item['populated_metrics']} | {item['observations']} | {item['countries']} | {item['missing']} |" for item in summaries]
    lines += ['', '## Sources and reference periods', '']
    for item in summaries:
        lines += [f"### {item['release']}", '', json.dumps(item['sources'], ensure_ascii=False), '',
                  json.dumps(item['periods'], ensure_ascii=False, sort_keys=True), '']
    lines += ['## Detailed records', '', 'Metric IDs and country-level coverage are listed in rounds-coverage.csv. Full period/source counts are in rounds-audit.json. Merge conflicts and upstream withheld cases have separate CSVs.']
    (RESEARCH / 'rounds-integration-report.md').write_text('\n'.join(lines) + '\n')
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == '__main__':
    main()

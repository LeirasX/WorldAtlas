"""Conflict handling for the offline release importer."""
import importlib.util
import unittest
import tempfile
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    'merge_research_rounds', Path(__file__).resolve().parents[1] / 'scripts/merge-research-rounds.py')
merge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(merge)


class ObservationMergeTests(unittest.TestCase):
    def test_conflicting_values_periods_and_definitions_preserve_existing_record(self):
        for field in ('metric', 'metric__year', 'metric__definition'):
            with self.subTest(field=field):
                existing = {'metric': '12', 'metric__year': '2024', 'metric__definition': 'Mean'}
                before = existing.copy()
                incoming = dict(existing, **{field: 'different'})
                outcome, fields = merge.merge_observation(existing, 'metric', incoming)
                self.assertEqual(outcome, 'conflict')
                self.assertIn(field, fields)
                self.assertEqual(existing, before)

    def test_duplicate_observations_add_missing_provenance_without_overwriting(self):
        existing = {'metric': '0', 'metric__year': '2024'}
        outcome, fields = merge.merge_observation(
            existing, 'metric', {'metric': '0', 'metric__year': '2024', 'metric__source': 'https://example.org'})
        self.assertEqual(outcome, 'overlap')
        self.assertEqual(fields, [])
        self.assertEqual(existing['metric'], '0')
        self.assertEqual(existing['metric__source'], 'https://example.org')

    def test_observation_fills_a_missing_cell(self):
        row = {'metric': ''}
        self.assertEqual(merge.merge_observation(row, 'metric', {'metric': '-2'})[0], 'added')
        self.assertEqual(row['metric'], '-2')

    def test_different_years_preserve_the_existing_primary_and_deduplicate_history(self):
        record = {'metric': '12', 'metric__unit': 'hours/day', 'metric__definition': 'Case study', 'metric__year': '2024'}
        incoming = dict(record, **{'metric': '10', 'metric__year': '2020'})
        self.assertEqual(merge.merge_observation(record, 'metric', incoming)[0], 'history')
        self.assertEqual(record['metric'], '12')
        history = json.loads(record['research__history'])
        self.assertEqual(history[0]['year'], '2020')
        self.assertEqual(merge.merge_observation(record, 'metric', incoming)[0], 'overlap')
        self.assertEqual(len(json.loads(record['research__history'])), 1)

    def test_same_context_conflicts_are_withheld_from_history(self):
        row = {}
        first = dict(value=10, unit='CAD/month', year='2026-Q2', sourceLocation='Toronto', scope='city', definition='Asking rent')
        self.assertEqual(merge.append_history(row, 'rent', first)[0], 'history')
        snapshot = row.copy()
        self.assertEqual(merge.append_history(row, 'rent', dict(first, value=20))[0], 'conflict')
        self.assertEqual(row, snapshot)


class ReleaseValidationTests(unittest.TestCase):
    def test_duplicate_provenance_rejects_release_without_changing_sources(self):
        root = Path(__file__).resolve().parents[1]
        registry = {}
        for slug in merge.SLUGS:
            for row in merge.read(root / f'Data/public/{slug}.csv'):
                registry[row['id']] = dict(row, slug=slug)
        with tempfile.TemporaryDirectory() as directory:
            folder = Path(directory)
            dictionary = {'metrics': {'measure': {'unit': 'hours/day', 'definition': 'Case study'}}}
            (folder / 'metrics.json').write_text(json.dumps(dictionary))
            for slug in merge.SLUGS:
                rows = [dict(id=key, alpha2=item['alpha2'], country=item['country'],
                             continent=item['continent'], measure='8' if key == 'PRT' else '')
                        for key, item in registry.items() if item['slug'] == slug]
                merge.write(folder / f'{slug}_test.csv', rows)
            record = dict(country_id='PRT', metric_id='measure', value='8', unit='hours/day',
                          definition='Case study', source_url='https://example.org', reference_period='2019-05')
            merge.write(folder / 'provenance.csv', [record, record])
            before = {p.name: p.read_bytes() for p in folder.iterdir()}
            with self.assertRaisesRegex(AssertionError, 'Duplicate provenance'):
                merge.validate_release(folder, 'test', 'metrics.json', 'provenance.csv', registry)
            self.assertEqual(before, {p.name: p.read_bytes() for p in folder.iterdir()})


if __name__ == '__main__':
    unittest.main()

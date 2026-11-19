import { test } from 'node:test'
import assert from 'node:assert/strict'
import { metricObservations } from '../src/observations.ts'
import type { Dataset } from '../src/data.ts'

test('statistical adapter preserves history, locations and explicit source dimensions without inference', () => {
  const current = { value: 123, year: '2025', currency: 'CAD', basis: 'national', source: 'https://example.org/', definition: 'Supplied definition' }
  const local = { value: 100, year: '2024', scope: 'city', sourceLocation: 'Sample city', estimated: true }
  const data: Dataset = { metrics: {}, files: [], countries: [{ id: 'CAN', alpha2: 'CA', name: 'Canada', flag: '🇨🇦', continent: 'North America', aliases: [], values: { sample: current }, history: { sample: [local] } }] }
  const result = metricObservations(data, 'sample')
  assert.equal(result.length, 2)
  assert.equal(result[0].observation, current)
  assert.equal(result[0].primary, true)
  assert.equal(result[1].primary, false)
  assert.equal(result[1].dimensions.sourceLocation, 'Sample city')
  assert.equal(result[1].dimensions.referencePeriod, '2024')
  assert.equal(result[0].dimensions.occupationId, undefined)
  assert.equal(result[0].dimensions.compensation, undefined)
  assert.equal(new Set(result.map(record => record.id)).size, 2)
})

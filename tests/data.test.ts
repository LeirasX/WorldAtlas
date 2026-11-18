import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { loadDataset, parseNumber, search, query, statistics, derive } from '../src/data.ts'

const registry = JSON.parse(readFileSync('Data/metrics.json', 'utf8'))
const files = readdirSync('Data/public').map(name => ({ name, text: readFileSync('Data/public/' + name, 'utf8') }))
test('public snapshot and map cover the 195 unique country IDs', () => {
  const { countries } = loadDataset(files, registry, true)
  assert.equal(countries.length, 195)
  assert.equal(new Set(countries.map(c => c.id)).size, 195)
  assert.equal(new Set(countries.map(c => c.continent)).size, 6)
  const map = JSON.parse(readFileSync('public/world-map.json', 'utf8'))
  assert.equal(countries.filter(c => map.some((shape: { id: string }) => shape.id === c.id)).length, 195)
  assert.equal(search(countries, 'holland')[0].id, 'NLD')
  assert.equal(search(countries, 'portgal')[0].id, 'PRT')
  assert.equal(search(countries, 'turkiye')[0].id, 'TUR')
  assert.ok(query('continent:"South America" population>1M', registry)(countries.find(c => c.id === 'BRA')!))
})
test('numbers preserve signs, magnitude, and estimate markers', () => {
  assert.deepEqual(parseNumber('~−1.46B'), { value: -1460000000, estimated: true })
  assert.equal(parseNumber('2,205')?.value, 2205)
  assert.equal(parseNumber('3–4'), undefined)
})
test('dynamic columns, estimates, provenance, and validation', () => {
  const data = loadDataset([{ name: 'new.csv', text: 'id,country,continent,area,net,temperature,net__year,net__source\nPRT,Portugal,Europe,~92k,~900,24,2026,https://example.org/' }], registry)
  const country = data.countries[0]
  assert.equal(country.values.temperature.value, 24)
  assert.equal(data.metrics.temperature.needsReview, true)
  assert.equal(country.values.net.year, '2026')
  assert.equal(country.values.net.estimated, true)
  assert.throws(() => loadDataset([{ name: 'broken.csv', text: 'id,country,continent,area\nPRT,Portugal,Europe,broken' }], registry), /area/)
  assert.throws(() => query('unknown>2', data.metrics), /unknown/i)
})
test('statistics count observations and sourced values take precedence', () => {
  assert.deepEqual(statistics([2, 8, 10]), { count: 3, sum: 20, mean: 20 / 3, median: 8, min: 2, max: 10, p90: 9.6 })
  const values = { population: { value: 10 }, area: { value: 2 }, density: { value: 4 }, net: { value: 800 }, rent: { value: 400 }, essentials: { value: 100 } }
  const result = derive(values)
  assert.equal(result.density.value, 4)
  assert.equal(result.left.value, 300)
  assert.equal(result.rent_burden.value, 50)
})

test('private snapshot preserves the supplied data when it is available', { skip: !readFileIfPresent('Data/local/europe.csv') }, () => {
  const local = readdirSync('Data/local').map(name => ({ name, text: readFileSync('Data/local/' + name, 'utf8') }))
  const { countries } = loadDataset(local, registry, true)
  const portugal = countries.find(country => country.id === 'PRT')!
  assert.ok(portugal.values.net.source?.startsWith('https://'))
  assert.ok(portugal.research?.wage_source)
  assert.equal(countries.find(country => country.id === 'PRK')!.values.net, undefined)
})

function readFileIfPresent(path: string) {
  try { return readFileSync(path, 'utf8') } catch { return '' }
}

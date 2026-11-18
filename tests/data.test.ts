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

test('observation verification and unknown estimate status survive loading', () => {
  const { countries } = loadDataset([{ name: 'status.csv', text: 'id,country,continent,net,net__verification,wb_population,wb_population__estimateStatus,wb_population__verification\nPRT,Portugal,Europe,900,unverified original estimate,12,unknown; includes models,source-attributed statistical series' }], registry)
  assert.equal(countries[0].values.net.verification, 'unverified original estimate')
  assert.equal(countries[0].values.wb_population.estimated, undefined)
  assert.equal(countries[0].values.wb_population.estimateStatus, 'unknown; includes models')
})

test('Australia public income classification retains correction provenance', () => {
  const { countries } = loadDataset(files, registry, true)
  const item = countries.find(country => country.id === 'AUS')!.values.income_group
  assert.equal(item.value, 'High income')
  assert.equal(item.year, 'FY2027')
  assert.equal(item.sourceValue, 'Low income')
  assert.match(item.source!, /worldbank.org/)
})

test('release observations remain local and provenance-complete', { skip: !readFileIfPresent('Context/Research/release-2026/audit.json') }, () => {
  const localFiles = readdirSync('Data/local').map(name => ({ name, text: readFileSync('Data/local/' + name, 'utf8') }))
  const { countries } = loadDataset(localFiles, registry, true)
  const observations = countries.flatMap(country => Object.entries(country.values).filter(([id]) => id.startsWith('wb_')))
  assert.equal(observations.length, 5619)
  assert.equal(countries.filter(country => Object.keys(country.values).some(id => id.startsWith('wb_'))).length, 194)
  for (const [id, item] of observations) {
    assert.ok(registry[id].description)
    assert.equal(item.unit, registry[id].unit)
    assert.equal(item.definition, registry[id].description)
    assert.match(item.source!, /^https:\/\/data.worldbank.org\/indicator\//)
    assert.ok(item.year && Number(item.year) >= 2000 && Number(item.year) <= 2025)
    assert.match(item.estimateStatus!, /unknown/)
    assert.equal(item.confidence, 'not individually assessed')
  }
  const before = readdirSync('Context/Research/before-integration')
    .filter(name => name.endsWith('.csv') && !name.startsWith('public-'))
    .map(name => ({ name, text: readFileSync('Context/Research/before-integration/' + name, 'utf8') }))
  const original = loadDataset(before, registry, true)
  for (const country of countries) {
    const old = original.countries.find(item => item.id === country.id)!
    for (const [key, value] of Object.entries(old.values)) {
      if (value.calculated) continue
      assert.equal(country.values[key].value, value.value, country.id + ' ' + key)
    }
    if (country.values.net) {
      assert.match(country.values.net.verification!, /unverified/)
      assert.equal(country.values.rent_burden, undefined)
    }
  }
  const { countries: publicCountries } = loadDataset(files, registry, true)
  assert.ok(publicCountries.every(country => !Object.keys(country.values).some(id => id.startsWith('wb_'))))
})

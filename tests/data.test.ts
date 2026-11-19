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

test('round 2 preserves source codes, status, geographic basis, and missing values', { skip: !readFileIfPresent('Context/Research/rounds-audit.json') }, () => {
  const local = readdirSync('Data/local').map(name => ({ name, text: readFileSync('Data/local/' + name, 'utf8') }))
  const data = loadDataset(local, registry, true)
  const observations = data.countries.flatMap(country => Object.entries(country.values).filter(([id]) => id.startsWith('r2_')))
  assert.equal(observations.length, 5388)
  assert.equal(new Set(observations.map(([id]) => id)).size, 32)
  for (const [id, item] of observations) {
    assert.equal(typeof item.value, 'number')
    assert.equal(item.unit, registry[id].unit)
    assert.equal(item.definition, registry[id].description)
    assert.ok(item.sourceCode)
    assert.ok(item.sourceStatus)
    assert.ok(item.basis)
    assert.ok(item.notes)
    assert.ok(item.year)
    assert.equal(item.estimated, undefined)
  }
  const portugal = data.countries.find(country => country.id === 'PRT')!
  assert.equal(portugal.values.r2_climate_temp_c_01.year, '1991–2020')
  assert.equal(portugal.values.r2_median_net_monthly_salary, undefined)
  assert.equal(registry.r2_climate_classification.kind, 'text')
  assert.equal(registry.r2_average_gross_monthly_employee_earnings_lcu.allowStatistics, false)
  assert.equal(registry.r2_actual_annual_hours_per_worker_oecd.allowDifferences, false)
  assert.equal(registry.r2_climate_temp_c_01.percentageDifference, false)
  const vatican = data.countries.find(country => country.id === 'VAT')!
  assert.ok(Object.keys(vatican.values).every(id => !id.startsWith('r2_')))
})

test('imported models and calculated equivalents preserve their status and currency', () => {
  const result = loadDataset([{ name: 'model.csv', text: 'id,country,continent,scenario,scenario__currency,scenario__method,scenario__sourceLocation,scenario__estimated,scenario__calculated,scenario__estimateStatus\nPRT,Portugal,Europe,100,EUR,Annual divided by 12,Lisbon,true,true,calculated; underlying scenario modeled' }], registry)
  const item = result.countries[0].values.scenario
  assert.equal(item.currency, 'EUR')
  assert.equal(item.method, 'Annual divided by 12')
  assert.equal(item.sourceLocation, 'Lisbon')
  assert.equal(item.calculated, true)
  assert.equal(item.estimated, true)
})

test('round 3 retains historical benchmarks, unknown median accounting, and model provenance', { skip: !readFileIfPresent('Context/Research/round3-2026/audit_round3.json') }, () => {
  const local = readdirSync('Data/local').map(name => ({ name, text: readFileSync('Data/local/' + name, 'utf8') }))
  const { countries } = loadDataset(local, registry, true)
  const observations = countries.flatMap(country => Object.entries(country.values).filter(([id]) => id.startsWith('r3_')))
  assert.equal(observations.length, 1629)
  assert.equal(new Set(observations.map(([id]) => id)).size, 20)
  assert.equal(countries.filter(country => Object.keys(country.values).some(id => id.startsWith('r3_'))).length, 188)
  for (const [id, item] of observations) {
    assert.equal(item.unit, registry[id].unit)
    assert.equal(item.definition, registry[id].description)
    assert.ok(item.source?.startsWith('https://'))
    assert.ok(item.year)
    assert.ok(item.method)
    assert.ok(item.notes)
    assert.equal(item.confidence, 'not assessed')
    if (id.includes('legal_')) {
      assert.equal(item.year, '2019-05')
      assert.match(registry[id].label, /historical May 2019/)
    }
    if (id.includes('paid_maternity') || id.includes('paid_paternity')) {
      assert.equal(item.year, '2025-10-01')
      assert.equal(item.unit, 'calendar days')
    }
  }
  const australia = countries.find(country => country.id === 'AUS')!
  const model = australia.values.r3_oecd_average_wage_single_net_monthly_equivalent_lcu
  assert.equal(model.currency, 'AUD')
  assert.equal(model.year, '2025')
  assert.equal(model.calculated, true)
  assert.equal(model.estimated, true)
  assert.match(model.method!, /annual OECD figure divided by 12/)
  assert.match(australia.values.r3_median_monthly_employee_earnings_unspecified_usd.estimateStatus!, /tax basis unknown/)
  assert.equal(australia.values.r3_median_net_monthly_salary, undefined)
  for (const id of ['BGD', 'BRA', 'CHN', 'IND', 'IDN', 'JPN', 'MEX', 'NGA', 'PAK', 'RUS', 'USA']) {
    const country = countries.find(country => country.id === id)!
    assert.ok(Object.keys(country.values).every(key => !key.startsWith('r3_legal_')))
  }
})

test('historical and local observations retain context without replacing the national primary', () => {
  const history = [
    { metricId: 'rent', value: 400, year: '2020', unit: 'EUR/month', scope: 'national', definition: registry.rent.description },
    { metricId: 'rent', value: 900, year: '2025', unit: 'EUR/month', scope: 'local rental zone', sourceLocation: 'Lisbon', definition: registry.rent.description },
  ]
  const text = 'id,country,continent,rent,rent__year,research__history\nPRT,Portugal,Europe,600,2025,"' + JSON.stringify(history).replaceAll('"', '""') + '"'
  const { countries } = loadDataset([{ name: 'history.csv', text }], registry)
  assert.equal(countries[0].values.rent.value, 600)
  assert.equal(countries[0].history!.rent.length, 2)
  assert.equal(countries[0].history!.rent[0].year, '2020')
  assert.equal(countries[0].history!.rent[1].sourceLocation, 'Lisbon')
  const duplicate = text.replace(JSON.stringify(history).replaceAll('"', '""'), JSON.stringify([...history, history[0]]).replaceAll('"', '""'))
  assert.throws(() => loadDataset([{ name: 'duplicate.csv', text: duplicate }], registry), /duplicate/i)
})

test('all four rounds preserve national and city provenance without nationalizing local records', { skip: !readFileIfPresent('Context/Research/round4-2026/audit_round4.json') }, () => {
  const local = readdirSync('Data/local').map(name => ({ name, text: readFileSync('Data/local/' + name, 'utf8') }))
  const { countries, metrics } = loadDataset(local, registry, true)
  const national = countries.flatMap(country => Object.entries(country.values).filter(([id]) => id.startsWith('r4_')))
  const scoped = countries.flatMap(country => Object.entries(country.history ?? {}).flatMap(([id, items]) => items.map(item => [id, item] as const)))
  assert.equal(national.length, 73)
  assert.equal(scoped.length, 80)
  const ids = new Set<string>()
  for (const [id, item] of [...national, ...scoped]) {
    assert.ok(item.observationId)
    assert.ok(!ids.has(item.observationId!))
    ids.add(item.observationId!)
    assert.equal(item.unit, metrics[id].unit)
    assert.equal(item.definition, metrics[id].description)
    assert.ok(item.source?.startsWith('https://'))
    assert.ok(item.year && item.basis && item.sourceLocation && item.method && item.notes)
    assert.equal(item.confidence, 'not individually assessed')
  }
  const canada = countries.find(country => country.id === 'CAN')!
  assert.equal(canada.values.r4_one_bedroom_apartment_average_asking_rent_cad, undefined)
  assert.equal(canada.history!.r4_one_bedroom_apartment_average_asking_rent_cad.length, 41)
  assert.ok(query('r4_one_bedroom_apartment_average_asking_rent_cad>0', metrics)(canada))
  assert.equal(search(countries, 'Toronto')[0].id, 'CAN')
  assert.equal(registry.r4_one_bedroom_apartment_average_asking_rent_cad.allowMap, false)
  const norway = countries.find(country => country.id === 'NOR')!
  assert.equal(norway.values.r4_rent_1_room_norway_mean_nok.value, 8770)
  assert.equal(norway.history!.r4_rent_1_room_norway_mean_nok.length, 4)
  const usa = countries.find(country => country.id === 'USA')!
  assert.equal(usa.values.r4_food_at_home_one_person_consumer_unit_mean_usd.calculated, true)
  assert.equal(usa.values.r4_monthly_essential_expenses, undefined)
  assert.ok(loadDataset(files, registry, true).countries.every(country => Object.keys(country.history ?? {}).length === 0))
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { overviewMetrics, languageSummary, climateSeries, shortLabel, makeResearchPrompt } from '../src/presentation.ts'
import type { Country, Dataset } from '../src/data.ts'

const country: Country = { id: 'PRT', alpha2: 'PT', name: 'Portugal', flag: '🇵🇹', continent: 'Europe', aliases: [], values: {
  population: { value: 10e6, year: '2020' }, wb_population: { value: 11e6, year: '2025', source: 'https://example.org/population', definition: 'Residents at midyear' },
  area: { value: 92000 }, wb_land_area_km2: { value: 91605.6, year: '2024', definition: 'Excludes inland water' },
  net: { value: 999, estimated: true }, language: { value: 'PT·VH' }, society: { value: 'PT-VH' },
  r3_median_monthly_employee_earnings_unspecified_lcu: { value: 700, year: '2025', currency: 'EUR' },
  r3_oecd_average_wage_single_net_monthly_equivalent_lcu: { value: 1500, year: '2025', currency: 'EUR', estimated: true, calculated: true },
} }
const data: Dataset = { countries: [country], files: [], metrics: Object.fromEntries(Object.keys(country.values).map(id => [id, { label: id, category: id.includes('population') || id.includes('area') ? 'Geography' : 'Economy', kind: 'number' }])) }

test('overview selects one explicitly defined series per concept without mutating alternatives', () => {
  const original = JSON.stringify(country)
  const overview = overviewMetrics(country)
  assert.equal(overview.find(item => item.concept === 'population')?.id, 'wb_population')
  assert.equal(overview.find(item => item.concept === 'area')?.label, 'Land area')
  assert.equal(overview.filter(item => item.concept === 'population').length, 1)
  assert.ok(!overview.some(item => item.id === 'net' || item.id.includes('unspecified')))
  const modeled = overview.find(item => item.id.includes('oecd'))!
  assert.match(modeled.label, /Modeled take-home/)
  assert.match(modeled.qualifier!, /2025.*single.*childless/i)
  assert.equal(JSON.stringify(country), original)
})

test('codes are not presented as languages or society explanations', () => {
  assert.equal(languageSummary('PT·VH'), 'Portuguese')
  assert.equal(languageSummary('EN/FR·VH'), 'English, French')
  assert.equal(languageSummary('PT-VH'), undefined)
  assert.equal(shortLabel('wb_population_density_per_km2', { label: 'Long density label', category: 'Geography', kind: 'number' }), 'Density')
})

test('climate chart requires complete numeric months and compatible recorded periods', () => {
  const copy = structuredClone(country)
  for (let month = 1; month <= 12; month++) for (const [prefix, value] of [['temp_c', -5], ['precip_mm', 90]] as const) copy.values[`r2_climate_${prefix}_${String(month).padStart(2, '0')}`] = { value, year: '1991–2020' }
  assert.equal(climateSeries(copy)?.months.length, 12)
  copy.values.r2_climate_temp_c_01.year = '1981–2010'
  assert.equal(climateSeries(copy), undefined)
  copy.values.r2_climate_temp_c_01.year = '1991–2020'
  delete copy.values.r2_climate_precip_mm_01
  assert.equal(climateSeries(copy), undefined)
})

test('AI prompts are focused, bounded, dated and explicit about uncertainty', () => {
  const prompt = makeResearchPrompt([country], data, 'Geography', 'Explain population distribution')
  assert.match(prompt, /Portugal/)
  assert.match(prompt, /Explain population distribution/)
  assert.match(prompt, /2025/)
  assert.match(prompt, /https:\/\/example.org\/population/)
  assert.match(prompt, /Residents at midyear/)
  assert.doesNotMatch(prompt, /999|1500/)
  assert.match(prompt, /not.*complete.*current/i)
  assert.match(prompt, /interpretation/i)
  assert.ok(prompt.length < 14000)
})

test('comparison differences require matching periods, definitions and explicit currencies', async () => {
  const { canCompare } = await import('../src/presentation.ts')
  const metric = { label: 'Measure', category: 'Economy', kind: 'number' as const, unit: 'USD/month' }
  const a = { value: 100, year: '2025', currency: 'USD', definition: 'Net mean employee earnings' }
  assert.equal(canCompare(a, { ...a, value: 120 }, metric), true)
  assert.equal(canCompare(a, { ...a, year: '2024' }, metric), false)
  assert.equal(canCompare(a, { ...a, currency: 'EUR' }, metric), false)
  assert.equal(canCompare(a, { ...a, definition: 'Gross median earnings' }, metric), false)
  assert.equal(canCompare(a, { ...a, sourceLocation: 'A city' }, metric), false)
  assert.equal(canCompare(a, { ...a }, { ...metric, allowDifferences: false }), false)
})

test('tax and employment-rights prompts omit unrelated preferred summary metrics', () => {
  const c = structuredClone(country)
  c.values.wb_gdp_per_capita_usd = { value: 32000, year: '2025' }
  c.values.r3_legal_standard_workday_hours_2019 = { value: 8, year: '2019-05' }
  c.values.r2_actual_weekly_hours_employed = { value: 37, year: '2025' }
  const d = { ...data, countries: [c], metrics: { ...data.metrics, wb_gdp_per_capita_usd: { label: 'GDP per person', category: 'Economy', kind: 'number' as const }, r3_legal_standard_workday_hours_2019: { label: 'Legal workday', category: 'Work', kind: 'number' as const }, r2_actual_weekly_hours_employed: { label: 'Weekly hours', category: 'Work', kind: 'number' as const } } }
  assert.doesNotMatch(makeResearchPrompt([c], d, 'Taxes'), /32000/)
  const legal = makeResearchPrompt([c], d, 'Employment rights')
  assert.match(legal, /2019-05/)
  assert.doesNotMatch(legal, /Weekly hours/)
})

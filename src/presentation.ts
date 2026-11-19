import { countryMetricIds, countryObservations, type Country, type Dataset, type Metric, type Observation } from './data.ts'

export type SummaryMetric = { concept: string; id: string; label: string; group: string; qualifier?: string; reason: string }
const definitions: Record<string, string> = {
  wb_land_area_km2: 'Land area', wb_population: 'Population', wb_population_density_per_km2: 'Density',
  wb_gdp_per_capita_usd: 'GDP per person', wb_gdp_per_capita_ppp: 'GDP per person · PPP',
  wb_life_expectancy_years: 'Life expectancy', wb_internet_users_pct: 'Internet use', wb_forest_area_pct: 'Forest cover',
  wb_urban_population_pct: 'Urban population', r3_oecd_average_wage_single_net_monthly_equivalent_lcu: 'Modeled take-home pay',
  r2_actual_annual_hours_per_worker_oecd: 'Annual working hours',
  r3_legal_paid_annual_leave_1y_workdays_2019: 'Paid leave · 1 year tenure · 2019',
  r3_legal_paid_annual_leave_5y_workdays_2019: 'Paid leave · 5 years tenure · 2019',
  r3_paid_maternity_leave_calendar_days_2025: 'Maternity leave · 2025 case', r3_paid_paternity_leave_calendar_days_2025: 'Paternity leave · 2025 case',
}
export function shortLabel(id: string, metric?: Metric) {
  return definitions[id] ?? (metric?.label ?? id).replace(/ · (WDI|ILOSTAT|OECD|Round 4|ILO median|2025 OECD scenario|historical May 2019).*$/, '').replace(/\s*\(variable currency\)/g, '').replace(' (people per sq. km of land area)', '').replace('Individuals using the Internet (% of population)', 'Internet use')
}
export function overviewMetrics(country: Country): SummaryMetric[] {
  const result: SummaryMetric[] = []
  const add = (concept: string, candidates: [string, string][], group: string, reason: string, qualifier?: string) => {
    const found = candidates.find(([id]) => typeof country.values[id]?.value === 'number')
    if (found) result.push({ concept, id: found[0], label: found[1], group, reason, qualifier })
  }
  add('population', [['wb_population', 'Population'], ['population', 'Population']], 'Geography', 'Uses the defined WDI population series when available; the original snapshot remains in details.')
  add('area', [['wb_land_area_km2', 'Land area'], ['area', 'Area']], 'Geography', 'Land area excludes inland water. The original area series can use a different basis and remains separate.')
  add('density', [['wb_population_density_per_km2', 'Density'], ['density', 'Density']], 'Geography', 'Uses the source density measure, not a new ratio of observations from different years.')
  add('gdp', [['wb_gdp_per_capita_usd', 'GDP per person']], 'Economy', 'Current-price US dollars per person. Economic output is not an individual salary.', 'current USD/person')
  add('forest', [['wb_forest_area_pct', 'Forest cover']], 'Nature', 'Country-level land-cover share; no regional forest boundaries are inferred.')
  add('life', [['wb_life_expectancy_years', 'Life expectancy']], 'Society', 'Population-level life expectancy at birth, not an individual forecast.')
  add('urban', [['wb_urban_population_pct', 'Urban population']], 'Society', 'Uses each source country’s definition of urban areas.')
  const model = country.values.r3_oecd_average_wage_single_net_monthly_equivalent_lcu
  if (typeof model?.value === 'number' && model.currency) add('takehome', [['r3_oecd_average_wage_single_net_monthly_equivalent_lcu', 'Modeled take-home pay']], 'Economy', 'A tax model, not observed typical or median earnings.', `${model.year ?? 'Period unspecified'} · single, childless worker at average wage · ${model.currency}/month`)
  return result
}
export function languageSummary(raw?: string) {
  if (!raw || raw.includes('-')) return undefined
  const value = raw.split('·')[0].trim()
  const names = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' })
  const parts = value.split('/').map(item => item.trim())
  if (parts.every(item => /^[a-z]{2,3}$/i.test(item))) {
    const expanded = parts.map(code => { try { return names.of(code.toLowerCase()) } catch { return undefined } }).filter(Boolean)
    return expanded.length ? expanded.join(', ') : undefined
  }
  return /^[\p{L} ,()/]+$/u.test(value) && value.length > 3 ? value : undefined
}
export function climateSeries(country: Country) {
  const months = Array.from({ length: 12 }, (_, index) => {
    const suffix = String(index + 1).padStart(2, '0')
    return { month: index, temperature: country.values[`r2_climate_temp_c_${suffix}`], rain: country.values[`r2_climate_precip_mm_${suffix}`] }
  })
  const all = months.flatMap(month => [month.temperature, month.rain])
  if (!all.every(item => typeof item?.value === 'number' && Number.isFinite(item.value)) || months.some(month => Number(month.rain.value) < 0)) return undefined
  const periods = new Set(all.map(item => item.year ?? 'Period unspecified'))
  if (periods.size !== 1) return undefined
  return { months, period: [...periods][0] }
}
export function displayValue(item: Observation, metric?: Metric) {
  if (typeof item.value !== 'number') return String(item.value)
  const amount = new Intl.NumberFormat('en', { notation: Math.abs(item.value) >= 10000 ? 'compact' : 'standard', maximumFractionDigits: Math.abs(item.value) >= 100 ? 0 : 1 }).format(item.value)
  return `${item.estimated ? '≈' : ''}${metric?.unit === 'EUR/month' ? '€' : ''}${amount}${metric?.unit?.startsWith('%') ? '%' : ''}`
}
export const researchSubjects = ['Overview', 'Geography', 'Climate', 'Nature', 'Society', 'Economy', 'Housing', 'Work', 'Politics', 'History', 'Health', 'Education']
const subjectCategories: Record<string, string[]> = { Overview: ['Geography'], Society: ['Society', 'Language', 'Education'], Politics: ['Politics', 'Law'], 'Employment rights': ['Work'], Taxes: ['Economy'] }
export function makeResearchPrompt(countries: Country[], data: Dataset, subject: string, focus = '') {
  const categories = subjectCategories[subject] ?? [subject]
  const lines = [`Explain ${subject.toLowerCase()} in ${countries.slice(0, 5).map(country => country.name).join(' and ')}.`,
    ...(focus.trim() ? [`Focus: ${focus.trim().slice(0, 1000)}`] : []),
    'Use an accessible, structured explanation: overview, key distinctions, concrete examples and connections to institutions, laws, history and everyday life.',
    'Verify factual claims against reliable, up-to-date sources. Cite the evidence and its reference date. Distinguish facts, sourced measurements, modeled estimates and interpretation. Explain meaningful uncertainty, disagreement and missing evidence.',
    'The ORBIS context below is not necessarily complete or current. Do not treat historical legal benchmarks as current law or combine incompatible earnings, currency, housing or reference periods.',
    'Selected existing context (not a complete database):']
  for (const country of countries.slice(0, 5)) {
    lines.push(`\n${country.name} (${country.id}), ${country.continent}:`)
    const ids = countryMetricIds(country).filter(id => categories.includes(data.metrics[id]?.category) && (subject !== 'Employment rights' || /legal|leave|maternity|paternity/.test(id)) && (subject !== 'Taxes' || /oecd|tax/.test(id)) && !/^r2_climate_(temp|precip)/.test(id))
    const preferred = overviewMetrics(country).filter(item => ids.includes(item.id)).map(item => item.id)
    let count = 0
    for (const id of [...new Set([...preferred, ...ids])]) {
      const item = country.values[id] ?? countryObservations(country, id)[0]
      if (!item) continue
      const metric = data.metrics[id]
      lines.push(`- ${shortLabel(id, metric)}: ${item.value} ${item.unit ?? metric?.unit ?? ''}; reference: ${item.year ?? 'not recorded'}; currency: ${item.currency ?? 'not recorded'}; scope: ${item.sourceLocation ?? item.scope ?? item.basis ?? 'not recorded'}; status: ${id.match(/^(net|rent|essentials|left|rent_burden)$/) ? 'original unverified estimate' : item.estimated ? 'estimated' : item.verification ?? 'not independently verified'}${item.calculated ? ', calculated' : ''}. Definition: ${(item.definition ?? metric?.description ?? 'not recorded').slice(0, 260)}. Method/caveat: ${(item.method ?? item.notes ?? data.metrics[id]?.aggregationNotes ?? 'not recorded').slice(0, 180)}. Source: ${item.source ?? 'not recorded'}.`)
      if (++count === 5) break
    }
    if (!count) lines.push('No directly relevant statistical observations selected. Research is needed; do not infer missing facts.')
  }
  if (countries.length > 1) lines.push('\nCompare only compatible definitions and populations. Explain which figures cannot be meaningfully compared; do not invent disposable-income calculations.')
  return lines.join('\n').slice(0, 13500)
}

export function canCompare(a: Observation | undefined, b: Observation | undefined, metric: Metric) {
  if (!a || !b || metric.allowDifferences === false || typeof a.value !== 'number' || typeof b.value !== 'number') return false
  if (!a.year || a.year !== b.year || a.sourceLocation || b.sourceLocation) return false
  return ['currency', 'unit', 'definition', 'scope', 'basis', 'method', 'calculated', 'estimated'].every(field => a[field as keyof Observation] === b[field as keyof Observation])
    && (!/currency|USD|EUR|LCU|dollar|month/i.test(metric.unit ?? '') || Boolean(a.currency && b.currency && a.currency === b.currency))
}

import Papa from 'papaparse'

export const continents = ['Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania'] as const
export type Continent = typeof continents[number]
export type Metric = {
  label: string; category: string; kind: 'number' | 'text'; unit?: string; description?: string
  sourceOrganization?: string; indicator?: string; sourceUrl?: string;
  sum?: boolean; weighted?: boolean; diverging?: boolean; needsReview?: boolean
}
export type Metrics = Record<string, Metric>
export type Observation = {
  value: number | string; raw?: string; estimated?: boolean; calculated?: boolean
  verification?: string; estimateStatus?: string; unit?: string; definition?: string; sourceName?: string;
  year?: string; source?: string; basis?: string; confidence?: string; notes?: string; sourceValue?: string
}
export type Country = {
  id: string; alpha2: string; name: string; flag: string; continent: Continent; aliases: string[]
  values: Record<string, Observation>; research?: Record<string, string>; notes?: string
}
export type DataFile = { name: string; text: string }
export type Dataset = { countries: Country[]; metrics: Metrics; files: string[] }

export function normalize(text: string) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
}

export function parseNumber(raw: string) {
  const match = raw.trim().replaceAll('−', '-').match(/^(~|≈)?\s*([+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*([kmb])?$/i)
  if (!match) return undefined
  const magnitude: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9 }
  const value = Number(match[2].replaceAll(',', '')) * (magnitude[match[3]?.toLowerCase()] ?? 1)
  return Number.isFinite(value) ? { value, estimated: Boolean(match[1]) } : undefined
}

export function derive(values: Country['values']): Country['values'] {
  const result = { ...values }
  const add = (id: string, inputs: string[], calculate: (...numbers: number[]) => number) => {
    const observations = inputs.map(input => values[input])
    if (result[id] || observations.some(item => item?.verification?.startsWith('unverified')) || !observations.every(item => typeof item?.value === 'number')) return
    const value = calculate(...observations.map(item => Number(item.value)))
    if (Number.isFinite(value)) {
      result[id] = { value, calculated: true, estimated: observations.some(item => item.estimated) }
    }
  }
  add('density', ['population', 'area'], (population, area) => area > 0 ? population / area : NaN)
  add('left', ['net', 'rent', 'essentials'], (net, rent, essentials) => net - rent - essentials)
  add('rent_burden', ['rent', 'net'], (rent, net) => net > 0 ? 100 * rent / net : NaN)
  return result
}

const identity = new Set(['id', 'alpha2', 'country', 'flag', 'continent', 'aliases'])
const metadata = ['source', 'year', 'basis', 'confidence', 'notes', 'sourceValue', 'verification', 'estimateStatus', 'unit', 'definition', 'sourceName'] as const
const missing = /^(?:|—|–|-|n\/?a|null)$/i
const reserved = new Set(['__proto__', 'prototype', 'constructor'])

export function loadDataset(files: DataFile[], registry: Metrics, complete = false): Dataset {
  const metrics: Metrics = { ...registry }
  const parsed = files.map(file => {
    const result = Papa.parse<Record<string, string>>(file.text, {
      header: true, skipEmptyLines: 'greedy', transformHeader: header => header.trim(),
    })
    if (result.errors.length || Object.keys(result.meta.renamedHeaders ?? {}).length || !result.data.length) {
      throw new Error(`${file.name}: ${result.errors[0]?.message ?? 'Empty data or duplicate headers'}`)
    }
    return { file, rows: result.data, fields: result.meta.fields ?? [] }
  })
  const unknown = new Map<string, string[]>()
  for (const { fields, rows, file } of parsed) {
    for (const field of fields) {
      if (reserved.has(field) || !field) throw new Error(`${file.name}: invalid column name`)
      if (identity.has(field) || field.includes('__') || Object.hasOwn(registry, field)) continue
      const samples = rows.map(row => row[field]?.trim()).filter(value => !missing.test(value))
      unknown.set(field, [...(unknown.get(field) ?? []), ...samples])
    }
  }
  for (const [id, samples] of unknown) {
    metrics[id] = {
      label: id.replaceAll('_', ' ').replace(/^./, char => char.toUpperCase()), category: 'Other',
      kind: samples.length && samples.every(value => parseNumber(value)) ? 'number' : 'text',
      needsReview: true,
    }
  }
  const ids = new Set<string>()
  const countries = parsed.flatMap(({ file, rows, fields }) => rows.map((row, index): Country => {
    const location = `${file.name}, row ${index + 2}`
    const id = row.id?.trim().toUpperCase()
    const name = row.country?.trim()
    const continent = row.continent?.trim() as Continent
    if (!id || !/^[A-Z]{3}$/.test(id) || !name || !continents.includes(continent)) {
      throw new Error(`${location}: expected a three-letter id, country name and recognized continent`)
    }
    if (ids.has(id)) throw new Error(`${location}: duplicate country ${id}`)
    ids.add(id)
    const values: Country['values'] = {}
    for (const field of fields) {
      if (identity.has(field) || field.includes('__')) continue
      const raw = row[field]?.trim() ?? ''
      if (missing.test(raw)) continue
      const metric = metrics[field]
      const number = metric.kind === 'number' ? parseNumber(raw) : undefined
      if (metric.kind === 'number' && !number) throw new Error(`${location}: invalid ${field} value “${raw}”`)
      const observation: Observation = number ? { ...number, raw, estimated: number.estimated || row[`${field}__estimated`]?.toLowerCase() === 'true' } : { value: raw, raw }
      for (const attribute of metadata) {
        const value = row[`${field}__${attribute}`]?.trim()
        if (value) observation[attribute] = value
      }
      if (observation.estimateStatus?.startsWith('unknown') && !observation.estimated) delete observation.estimated
      values[field] = observation
    }
    let research: Country['research']
    if (row.research__record) {
      try {
        const record: unknown = JSON.parse(row.research__record)
        if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error()
        research = Object.fromEntries(Object.entries(record).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
      } catch {
        throw new Error(`${location}: invalid research record`)
      }
    }
    return { id, alpha2: row.alpha2?.trim() ?? '', name, flag: row.flag?.trim() ?? '', continent,
      aliases: row.aliases?.split('|').map(alias => alias.trim()).filter(Boolean) ?? [], values: derive(values), research, notes: row.research__markdown?.trim() || undefined }
  }))
  if (!countries.length || (complete && countries.length !== 195)) throw new Error('Expected an atlas of 195 countries')
  return { countries: countries.sort((a, b) => a.name.localeCompare(b.name)), metrics, files: files.map(file => file.name) }
}

function typo(pattern: string, word: string) {
  if (Math.abs(pattern.length - word.length) > 1) return false
  const [shorter, longer] = pattern.length <= word.length ? [pattern, word] : [word, pattern]
  let position = 0
  while (position < shorter.length && shorter[position] === longer[position]) position++
  return shorter.slice(position + 1) === longer.slice(position + 1)
    || (shorter.length < longer.length && shorter.slice(position) === longer.slice(position + 1))
    || (shorter[position] === longer[position + 1] && shorter[position + 1] === longer[position]
      && shorter.slice(position + 2) === longer.slice(position + 2))
}

const languageNames = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' })
function expandLanguages(value: Observation | undefined) {
  if (typeof value?.value !== 'string') return ''
  return value.value.split(/[·/]/)[0] === value.value
    ? value.value
    : value.value.split('·')[0].split('/').flatMap(code => {
      const language = code.trim().toLowerCase()
      return /^[a-z]{2,3}$/.test(language) ? languageNames.of(language) ?? [] : []
    }).join(' ')
}

export function search(countries: Country[], input: string) {
  const pattern = normalize(input)
  if (!pattern) return countries
  return countries.map(country => {
    const names = [country.name, country.id, country.alpha2, ...country.aliases].map(normalize)
    const extra = normalize(`${country.continent} ${country.values.language?.value ?? ''} ${expandLanguages(country.values.language)}`)
    const rank = names.includes(pattern) ? 0 : names.some(name => name.startsWith(pattern)) ? 1
      : names.some(name => name.includes(pattern)) ? 2 : extra.includes(pattern) ? 3
        : pattern.length >= 4 && names.some(name => name.split(/\s+/).some(word => typo(pattern, word))) ? 4 : Infinity
    return { country, rank }
  }).filter(item => Number.isFinite(item.rank)).sort((a, b) => a.rank - b.rank).map(item => item.country)
}

export function query(input: string, metrics: Metrics): (country: Country) => boolean {
  const tokens = input.trim().match(/(?:[^\s"]+|"[^"]*")+/g) ?? []
  if ((input.match(/"/g)?.length ?? 0) % 2) throw new Error('Close the quoted filter value.')
  const filters = tokens.map(token => {
    const parts = token.match(/^([\w-]+)(>=|<=|>|<|=|:)(.+)$/)
    if (!parts) throw new Error(`Use metric:value or metric>number. Check “${token}”.`)
    const [, id, operator, raw] = parts
    const value = normalize(raw.replace(/^"|"$/g, ''))
    if (id === 'continent' && operator === ':') {
      if (!continents.some(continent => normalize(continent) === value)) throw new Error(`Unknown continent “${value}”.`)
      return (country: Country) => normalize(country.continent) === value
    }
    if (!Object.hasOwn(metrics, id)) throw new Error(`Unknown metric “${id}”.`)
    if (operator === ':' && value === 'missing') return (country: Country) => !country.values[id]
    if (value === 'estimated' && operator === ':') return (country: Country) => Boolean(country.values[id]?.estimated)
    if (value.startsWith('confidence=') && operator === ':') {
      return (country: Country) => normalize(country.values[id]?.confidence ?? '') === value.slice(11)
    }
    if (metrics[id].kind === 'text' && operator === ':') {
      return (country: Country) => normalize(String(country.values[id]?.value ?? '')).includes(value)
    }
    const target = parseNumber(value)?.value
    if (metrics[id].kind !== 'number' || target === undefined) throw new Error(`Invalid filter for “${id}”.`)
    return (country: Country) => {
      const number = country.values[id]?.value
      if (typeof number !== 'number') return false
      switch (operator) {
        case '>': return number > target
        case '>=': return number >= target
        case '<': return number < target
        case '<=': return number <= target
        default: return number === target
      }
    }
  })
  return country => filters.every(filter => filter(country))
}

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 })
const exact = new Intl.NumberFormat('en', { maximumFractionDigits: 2 })
export function format(observation?: Observation, metric?: Metric, full = false) {
  if (!observation) return '—'
  if (typeof observation.value === 'string') return observation.value
  const amount = (full || Math.abs(observation.value) < 10000 ? exact : compact).format(observation.value)
  const value = metric?.unit === 'EUR/month' ? `€${amount}` : metric?.unit?.startsWith('%') ? `${amount}%` : amount
  return observation.estimated ? `≈${value}` : value
}

export function statistics(numbers: number[]) {
  if (!numbers.length) return undefined
  const values = [...numbers].sort((a, b) => a - b)
  const count = values.length
  const percentile = (fraction: number) => {
    const position = (count - 1) * fraction
    const low = Math.floor(position)
    return values[low] + (values[Math.ceil(position)] - values[low]) * (position - low)
  }
  const sum = values.reduce((total, value) => total + value, 0)
  return { count, sum, mean: sum / count, median: percentile(0.5), min: values[0], max: values[count - 1], p90: percentile(0.9) }
}

export function safeUrl(raw: string) {
  try {
    const url = new URL(raw)
    if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) return url.href
  } catch { /* Some sources are text references. */ }
}

import { starterKnowledge } from './starterKnowledge.ts'
import { countryMetricIds, countryObservations, normalize, typo, safeUrl, type Dataset } from './data.ts'

export const entityKinds = ['country', 'city', 'region', 'topic', 'institution', 'event', 'concept', 'organization', 'occupation', 'indicator', 'article', 'law', 'location', 'source'] as const
export type EntityKind = typeof entityKinds[number]
export type KnowledgeSource = { label: string; url: string; publicationDate?: string; lastVerified?: string; license?: string; reuseNotes?: string }
export type KnowledgeEntity = {
  id: string; kind: EntityKind; title: string; summary: string; body?: string
  countryId?: string; metricIds?: string[]; sources: KnowledgeSource[]; date?: string
  status?: 'draft' | 'source-backed' | 'reviewed' | 'outdated' | 'incomplete'
  lastReviewed?: string; caveats?: string[]; aliases?: string[]
  sections?: { heading: string; body: string; sourceUrls: string[] }[]
  legal?: { jurisdiction: string; subject: string; effectiveDate: string; population: string; status: 'current' | 'historical' | 'unknown' }
  occupation?: { specializations: string[]; seniorityLevels: string[] }
}
export type Relationship = { from: string; to: string; label: string; evidence?: 'factual' | 'interpretive' | 'causal'; sourceUrls?: string[] }
export type KnowledgePack = { version: 1; entities: KnowledgeEntity[]; relationships: Relationship[] }
export type KnowledgeIndex = { entities: KnowledgeEntity[]; relationships: Relationship[] }

export function stableId(prefix: string, title: string) {
  return prefix + ':' + encodeURIComponent(normalize(title))
}

const explanations: Record<string, string> = {
  Geography: 'Start with where people live, how many people there are, and how land and population are measured.',
  Economy: 'Explore economic output, income and household costs. Definitions, currencies and reference years determine which figures can be compared.',
  Housing: 'Understand what housing measures describe: a household income share, a national rent, or a specific city and dwelling type.',
  Work: 'Explore hours, earnings and employment benchmarks. Reported working time and a legal entitlement describe different things.',
  Climate: 'Read temperature and rainfall as long-term patterns. These country averages can hide large differences between regions.',
  Nature: 'Explore land cover and environmental conditions, alongside the methods used to measure them.',
  Health: 'Explore population health and health-system indicators. A country-level average does not describe every person.',
  Education: 'Explore participation in education, literacy and research. Coverage and reference periods vary by indicator.',
  Language: 'Explore the language information supplied in the original research and its recorded limitations.',
  Society: 'Explore population patterns and social indicators while keeping the scope of each measure in view.',
  Travel: 'Explore the available transport and travel-related indicators and their source definitions.',
  Other: 'Explore additional indicators with the definition and source attached to each observation.',
}

export function buildKnowledge(data: Dataset): KnowledgeIndex {
  const entities = new Map<string, KnowledgeEntity>()
  const links = new Map<string, Relationship>()
  function link(from: string, to: string, label: string) {
    links.set(JSON.stringify([from, to, label]), { from, to, label })
  }
  const usedMetrics = new Set(data.countries.flatMap(countryMetricIds))
  for (const category of new Set([...usedMetrics].map(id => data.metrics[id].category))) {
    const metricIds = [...usedMetrics].filter(id => data.metrics[id].category === category)
    entities.set(stableId('topic', category), {
      id: stableId('topic', category), kind: 'topic', title: category,
      summary: explanations[category] ?? `Explore the available ${category.toLowerCase()} research.`,
      metricIds, sources: [],
    })
  }
  for (const country of data.countries) {
    const countryId = 'country:' + country.id
    entities.set(countryId, {
      id: countryId, kind: 'country', title: country.name, summary: `${country.name} is classified in ${country.continent} in this atlas.`,
      countryId: country.id, metricIds: countryMetricIds(country), sources: [],
    })
    for (const id of countryMetricIds(country)) {
      const topicId = stableId('topic', data.metrics[id].category)
      link(countryId, topicId, 'has research about')
      for (const observation of countryObservations(country, id)) {
        const sourceUrl = observation.source && safeUrl(observation.source ?? '')
        if (sourceUrl && observation.sourceName) {
          const sourceId = stableId('institution', observation.sourceName)
          const entity = entities.get(sourceId) ?? {
            id: sourceId, kind: 'institution' as const, title: observation.sourceName,
            summary: 'A named data source in the imported research. Follow the original references to inspect its series and methodology.',
            sources: [],
          }
          if (!entity.sources.some(source => source.url === sourceUrl)) entity.sources.push({ label: observation.sourceName, url: sourceUrl })
          entities.set(sourceId, entity)
          link(countryId, sourceId, 'has data attributed to')
          link(sourceId, topicId, 'provides research about')
        }
        if (observation.scope && observation.scope !== 'national' && observation.sourceLocation) {
          const location = observation.sourceLocation
          const kind = observation.scope === 'census metropolitan area' ? 'city' : 'region'
          const locationId = stableId(kind, country.id + ':' + location)
          const entity = entities.get(locationId) ?? {
            id: locationId, kind, title: location, countryId: country.id,
            summary: `${observation.scope} in ${country.name}, as identified in the imported source. These figures describe the source geography.`,
            metricIds: [], sources: [],
          }
          if (!entity.metricIds!.includes(id)) entity.metricIds!.push(id)
          if (sourceUrl && !entity.sources.some(source => source.url === sourceUrl)) entity.sources.push({ label: observation.sourceName ?? 'Source', url: sourceUrl })
          entities.set(locationId, entity)
          link(locationId, countryId, 'is a source geography within')
          link(locationId, topicId, 'has research about')
        }
      }
    }
  }
  for (const id of usedMetrics) {
    const metric = data.metrics[id]
    const sources = new Map<string, KnowledgeSource>()
    for (const country of data.countries) for (const observation of countryObservations(country, id)) {
      const url = safeUrl(observation.source ?? '')
      if (url && !sources.has(url)) sources.set(url, { label: observation.sourceName ?? 'Observation source', url })
    }
    const entityId = 'indicator:' + id
    entities.set(entityId, { id: entityId, kind: 'indicator', title: metric.label,
      summary: metric.description ?? `Explore the ${metric.label} observations and their recorded definitions.`,
      metricIds: [id], sources: [...sources.values()],
    })
    link(entityId, stableId('topic', metric.category), 'measures an aspect of')
  }
  const base = { entities: [...entities.values()], relationships: [...links.values()] }
  const seeded = importKnowledge(JSON.stringify(starterKnowledge), base)
  const economy = stableId('topic', 'Economy')
  if (entities.has(economy)) for (const entity of starterKnowledge.entities) seeded.relationships.push({ from: entity.id, to: economy, label: 'is an economic concept', evidence: 'factual' })
  return seeded
}

export function searchKnowledge(index: KnowledgeIndex, term: string) {
  const text = normalize(term)
  return index.entities.map(entity => {
    const title = normalize([entity.title, ...(entity.aliases ?? [])].join(' '))
    const rank = title === text ? 0 : title.startsWith(text) ? 1 : title.includes(text) ? 2
      : normalize(entity.summary).includes(text) ? 3 : text.length >= 4 && title.split(/\s+/).some(word => typo(text, word)) ? 4 : Infinity
    return { entity, rank }
  }).filter(item => Number.isFinite(item.rank)).sort((a, b) => a.rank - b.rank || a.entity.title.localeCompare(b.entity.title))
    .map(item => item.entity)
}

export function importKnowledge(raw: string, existing: KnowledgeIndex): KnowledgeIndex {
  const pack: unknown = JSON.parse(raw)
  if (!pack || typeof pack !== 'object') throw new Error('Expected a knowledge pack object.')
  const candidate = pack as Record<string, unknown>
  if (candidate.version !== 1 || !Array.isArray(candidate.entities) || !Array.isArray(candidate.relationships)) {
    throw new Error('Expected version 1, entities and relationships.')
  }
  const entities = new Map(existing.entities.map(entity => [entity.id, entity]))
  const imported = new Set<string>()
  for (const record of candidate.entities) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('Invalid entity.')
    const item = record as Record<string, unknown>
    for (const field of ['id', 'title', 'summary']) {
      if (typeof item[field] !== 'string' || !String(item[field]).trim()) throw new Error(`Entity requires ${field}.`)
    }
    if (!entityKinds.includes(item.kind as EntityKind)) throw new Error('Unknown entity kind.')
    if (!Array.isArray(item.sources) || !item.sources.length || !item.sources.every(source =>
      source && typeof source.label === 'string' && typeof source.url === 'string' && Boolean(safeUrl(source.url)))) {
      throw new Error('Imported entities require named HTTP or HTTPS sources.')
    }
    if (item.body !== undefined && typeof item.body !== 'string') throw new Error('Entity body must be Markdown text.')
    if (item.date !== undefined && typeof item.date !== 'string') throw new Error('Entity date must be text.')
    if (item.metricIds !== undefined || item.countryId !== undefined || item.kind === 'country') {
      throw new Error('Country identities and metric associations come from the validated country dataset.')
    }
    for (const source of item.sources) {
      for (const field of ['publicationDate', 'lastVerified', 'license', 'reuseNotes']) {
        if (source[field] !== undefined && typeof source[field] !== 'string') throw new Error(`Source ${field} must be text.`)
      }
    }
    const statuses = ['draft', 'source-backed', 'reviewed', 'outdated', 'incomplete']
    if (item.status !== undefined && !statuses.includes(String(item.status))) throw new Error('Invalid content status.')
    if (item.lastReviewed !== undefined && (typeof item.lastReviewed !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item.lastReviewed))) throw new Error('Invalid reviewed date.')
    if (item.status === 'reviewed' && !item.lastReviewed) throw new Error('Reviewed content requires a reviewed date; supplied status is not independent verification.')
    for (const field of ['aliases', 'caveats']) if (item[field] !== undefined && (!Array.isArray(item[field]) || !(item[field] as unknown[]).every(value => typeof value === 'string'))) throw new Error(`Invalid ${field}.`)
    if (item.sections !== undefined) {
      if (!Array.isArray(item.sections) || !item.sections.every(section => section && typeof section.heading === 'string' && typeof section.body === 'string' && Array.isArray(section.sourceUrls) && section.sourceUrls.length && section.sourceUrls.every((url: unknown) => typeof url === 'string' && (item.sources as KnowledgeSource[]).some(source => source.url === url)))) throw new Error('Every section source must reference a named entity source.')
    }
    if (item.legal !== undefined) {
      const legal = item.legal as Record<string, unknown>
      if (!legal || !['jurisdiction', 'subject', 'effectiveDate', 'population'].every(field => typeof legal[field] === 'string' && String(legal[field]).trim()) || !['current', 'historical', 'unknown'].includes(String(legal.status))) throw new Error('Legal content requires dated jurisdiction, population and status.')
    }
    if (item.occupation !== undefined) {
      const occupation = item.occupation as Record<string, unknown>
      if (!occupation || !['specializations', 'seniorityLevels'].every(field => Array.isArray(occupation[field]) && (occupation[field] as unknown[]).every(value => typeof value === 'string'))) throw new Error('Occupation dimensions must be text arrays.')
    }
    const entity: KnowledgeEntity = {
      id: String(item.id), kind: item.kind as EntityKind, title: String(item.title), summary: String(item.summary),
      sources: item.sources.map(source => {
        const result: KnowledgeSource = { label: source.label, url: safeUrl(source.url)! }
        for (const field of ['publicationDate', 'lastVerified', 'license', 'reuseNotes'] as const) {
          if (source[field] !== undefined) result[field] = source[field]
        }
        return result
      }),
      ...(item.status ? { status: item.status as KnowledgeEntity['status'] } : {}),
      ...(item.lastReviewed ? { lastReviewed: item.lastReviewed as string } : {}),
      ...(item.sections ? { sections: item.sections as KnowledgeEntity['sections'] } : {}),
      ...(item.aliases ? { aliases: item.aliases as string[] } : {}),
      ...(item.caveats ? { caveats: item.caveats as string[] } : {}),
      ...(item.legal ? { legal: item.legal as KnowledgeEntity['legal'] } : {}),
      ...(item.occupation ? { occupation: item.occupation as KnowledgeEntity['occupation'] } : {}),
      ...(item.body ? { body: String(item.body) } : {}), ...(item.date ? { date: String(item.date) } : {}),
    }
    if (imported.has(entity.id)) throw new Error(`Duplicate entity ${entity.id}.`)
    imported.add(entity.id)
    if (entities.has(entity.id)) throw new Error(`Entity ${entity.id} already exists. Use a new stable ID for distinct content.`)
    entities.set(entity.id, entity)
  }
  const relationships = [...existing.relationships]
  for (const record of candidate.relationships) {
    if (!record || typeof record !== 'object') throw new Error('Invalid relationship.')
    const { from, to, label } = record
    if (typeof from !== 'string' || typeof to !== 'string' || typeof label !== 'string' || !label.trim()
      || !entities.has(from) || !entities.has(to)) throw new Error('Relationship endpoints must exist and have a label.')
    if (record.evidence !== undefined && !['factual', 'interpretive', 'causal'].includes(record.evidence)) throw new Error('Invalid relationship evidence kind.')
    if (record.sourceUrls !== undefined && (!Array.isArray(record.sourceUrls) || !record.sourceUrls.every((url: unknown) => typeof url === 'string' && safeUrl(url)))) throw new Error('Invalid relationship evidence sources.')
    if (['interpretive', 'causal'].includes(record.evidence) && !record.sourceUrls?.length) throw new Error('Interpretive and causal relationships require evidence sources.')
    if (!relationships.some(item => item.from === from && item.to === to && item.label === label)) relationships.push({ from, to, label, ...(record.evidence ? { evidence: record.evidence } : {}), ...(record.sourceUrls ? { sourceUrls: record.sourceUrls } : {}) })
  }
  return { entities: [...entities.values()], relationships }
}

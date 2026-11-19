import { useMemo, useState } from 'react'
import Markdown from 'react-markdown'
import { ArrowRight, BookOpen, Building2, MapPin, Search } from 'lucide-react'
import { countryObservations, format, safeUrl, statistics, type Country, type Dataset } from './data.ts'
import { stableId, type KnowledgeEntity, type KnowledgeIndex } from './knowledge.ts'

type Props = { data: Dataset; index: KnowledgeIndex; openEntity: (entity: KnowledgeEntity) => void; openCountry: (country: Country) => void }

export function TopicBrowser({ data, index, openEntity }: Props) {
  const [term, setTerm] = useState('')
  const topics = index.entities.filter(entity => entity.kind === 'topic' && (entity.title + ' ' + entity.summary).toLowerCase().includes(term.toLowerCase()))
  return <>
    <div className="page-heading editorial-heading"><span className="eyebrow">Make the connections</span><h1>Understand the world.</h1><p>Start with an explanation. Follow the evidence into places, indicators and sources.</p></div>
    <label className="field topic-search"><Search size={17} /><input aria-label="Find a topic" value={term} placeholder="Find a topic" onChange={event => setTerm(event.target.value)} /></label>
    <div className="topic-grid">{topics.map(entity => <button key={entity.id} className="topic-tile" onClick={() => openEntity(entity)}>
      <BookOpen size={23} /><h2>{entity.title}</h2><p>{entity.summary}</p><span>{entity.metricIds?.length ? `${entity.metricIds.filter(id => data.metrics[id]).length} indicators` : 'Read the introduction'} <ArrowRight size={16} /></span>
    </button>)}</div>
    {!topics.length && <p className="empty">No topics match this search.</p>}
  </>
}

export function RelatedEntities({ index, id, openEntity }: { index: KnowledgeIndex; id: string; openEntity: (entity: KnowledgeEntity) => void }) {
  const related = useMemo(() => {
    const links = index.relationships.filter(link => link.from === id || link.to === id)
    const ids = new Set(links.map(link => link.from === id ? link.to : link.from))
    return index.entities.filter(entity => ids.has(entity.id))
  }, [index, id])
  if (!related.length) return null
  return <section className="world-section related-section"><h2>Keep exploring</h2><div className="related-links">
    {related.slice(0, 20).map(entity => <button key={entity.id} className="related-link" onClick={() => openEntity(entity)}>
      {entity.kind === 'institution' ? <Building2 size={16} /> : entity.kind === 'topic' ? <BookOpen size={16} /> : <MapPin size={16} />}
      <span>{entity.title}<small>{entity.kind === 'institution' ? 'Source institution' : entity.kind}</small></span><ArrowRight size={15} />
    </button>)}
  </div></section>
}

export function EntityPage({ data, index, entity, openEntity, openCountry }: Props & { entity: KnowledgeEntity }) {
  const [metricId, setMetricId] = useState(entity.metricIds?.[0] ?? '')
  const [details, setDetails] = useState(false)
  const metrics = (entity.metricIds ?? []).filter(id => data.metrics[id])
  const indicator = metrics.includes(metricId) ? metricId : metrics[0]
  const definition = data.metrics[indicator]
  const geography = entity.kind === 'city' || entity.kind === 'region'
  const placeCountry = entity.countryId && data.countries.find(country => country.id === entity.countryId)
  const observations = geography && placeCountry
    ? countryObservations(placeCountry, indicator).filter(item => item.sourceLocation === entity.title)
    : data.countries.flatMap(country => country.values[indicator] ? [{ ...country.values[indicator], country }] : [])
  const numeric = observations.flatMap(item => typeof item.value === 'number' ? [item.value] : [])
  const summary = statistics(numeric)
  const countries = data.countries.filter(country => metrics.some(id => countryObservations(country, id).length))
  return <>
    <button className="text-button back" onClick={() => {
      const topic = index.entities.find(item => item.id === stableId('topic', definition?.category ?? 'Geography'))
      if (topic && topic.id !== entity.id) openEntity(topic)
      else location.hash = '#/topics'
    }}>← Topics</button>
    <div className="page-heading editorial-heading">
      <span className="eyebrow">{entity.kind === 'institution' ? 'Source institution' : entity.kind}{entity.date ? ` · ${entity.date}` : ''}</span>
      <h1>{entity.title}</h1><p>{entity.summary}</p>
    </div>
    {entity.body && <article className="article-body"><Markdown skipHtml disallowedElements={['img']} urlTransform={url => safeUrl(url) ?? ''}
      components={{ a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" /> }}>{entity.body}</Markdown></article>}
    {metrics.length > 0 && <section className="knowledge-evidence panel">
      <div className="section-title"><h2>{geography ? 'Place observations' : 'Explore the evidence'}</h2>
        <select aria-label="Topic indicator" value={indicator} onChange={event => { setMetricId(event.target.value); setDetails(false) }}>
          {metrics.map(id => <option key={id} value={id}>{data.metrics[id].label}</option>)}</select></div>
      <p className="topic-definition">{definition.description ?? 'Read the observation details for its definition and original source.'}</p>
      <div className="evidence-summary">
        <strong>{observations.length}<small>{geography ? 'observations for this source geography' : 'countries with a primary observation'}</small></strong>
        {summary && definition.allowStatistics !== false && <strong>{format({ value: summary.median }, definition)}<small>median of available country observations</small></strong>}
      </div>
      {summary && !geography && definition.allowStatistics !== false && <div className="distribution" role="img" aria-label={`Distribution of ${definition.label} across ${numeric.length} countries`}>
        {Array.from({ length: 24 }, (_, bucket) => {
          const step = (summary.max - summary.min || 1) / 24
          const count = numeric.filter(value => Math.min(23, Math.floor((value - summary.min) / step)) === bucket).length
          return <div key={bucket} style={{ height: `${Math.max(3, count / numeric.length * 330)}px` }} title={`${count} countries`} />
        })}
        <div className="distribution-range"><span>{format({ value: summary.min }, definition)}</span><span>{format({ value: summary.max }, definition)}</span></div>
      </div>}
      <p className="muted">Reference periods and methods vary. Open an observation’s source before drawing comparisons.</p>
      <button className="text-button" aria-expanded={details} onClick={() => setDetails(!details)}>{details ? 'Hide definitions and observations' : 'Go deeper into the data'} <ArrowRight size={15} /></button>
      {details && <div className="topic-deeper">
        {definition.aggregationNotes && <p>{definition.aggregationNotes}</p>}
        <dl className="details"><div><dt>Unit</dt><dd>{definition.unit ?? 'Not specified'}</dd></div><div><dt>Category</dt><dd>{definition.category}</dd></div></dl>
        <div className="topic-observations">{observations.slice(0, 24).map((item, position) => {
          const country = 'country' in item ? item.country as Country : placeCountry
          return <div key={position}>
            {country && <button className="text-button" onClick={() => openCountry(country)}>{country.flag} {country.name}</button>}
            <strong>{format(item, definition)} <small>{item.unit ?? definition.unit}</small></strong>
            <span>{item.year ?? 'Reference period not recorded'} · {item.basis ?? 'Geographic scope not recorded'}</span>
            {item.notes && <p>{item.notes}</p>}
            {item.source && safeUrl(item.source) && <a href={safeUrl(item.source)} target="_blank" rel="noreferrer">Original source ↗</a>}
          </div>
        })}</div>
        {!geography && countries.length > 24 && <a className="text-button" href="#/explore">Explore all countries in the data table <ArrowRight size={15} /></a>}
      </div>}
    </section>}
    {placeCountry && <button className="button" onClick={() => openCountry(placeCountry)}>{placeCountry.flag} Open {placeCountry.name}</button>}
    {entity.sources.length > 0 && <details className="panel research"><summary>Sources ({entity.sources.length})</summary><ul>
      {entity.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.label}</a>
        {source.publicationDate && <small> · published {source.publicationDate}</small>}
        {source.lastVerified && <small> · verified {source.lastVerified}</small>}
        {source.license && <small> · {source.license}</small>}
        {source.reuseNotes && <p>{source.reuseNotes}</p>}
      </li>)}
    </ul></details>}
    <RelatedEntities index={index} id={entity.id} openEntity={openEntity} />
  </>
}

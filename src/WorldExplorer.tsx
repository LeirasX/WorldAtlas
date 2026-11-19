import { useMemo, useState } from 'react'
import { ArrowRight, BookOpen, X } from 'lucide-react'
import AtlasMap from './AtlasMap.tsx'
import { format, safeUrl, countryObservations, type Country, type Dataset } from './data.ts'
import { lenses, lensMetrics } from './lenses.ts'
import { type KnowledgeIndex, type KnowledgeEntity } from './knowledge.ts'

type Props = { data: Dataset; index: KnowledgeIndex; open: (country: Country) => void; openEntity: (entity: KnowledgeEntity) => void; compare: (id: string) => void; pinned: string[] }
export default function WorldExplorer({ data, index, open, openEntity, compare, pinned }: Props) {
  const [lensId, setLensId] = useState('geography')
  const [metricId, setMetricId] = useState('')
  const [selection, setSelection] = useState('')
  const lens = lenses.find(item => item.id === lensId)!
  const available = useMemo(() => lensMetrics(data, lens), [data, lens])
  const layers = available.filter(([, metric]) => metric.kind === 'number' && metric.allowMap !== false)
  const metric = data.metrics[metricId]
  const country = data.countries.find(item => item.id === selection)
  const topics = index.entities.filter(entity => entity.kind === 'topic' && ((lens.categories as readonly string[]).includes(entity.title) || entity.metricIds?.some(id => available.some(([key]) => key === id))))
  const values = country ? [...new Set([...(metricId ? [metricId] : []), ...available.map(([id]) => id), 'population', 'area'])].filter(id => country.values[id]?.value !== null && country.values[id]?.value !== undefined).slice(0, 5) : []
  return <section className="world-explorer" aria-label="Explore the world">
    <div className="explorer-heading"><span className="eyebrow">ORBIS · {data.countries.length} countries</span><h1>Explore the world.</h1><p>Understand how it works.</p></div>
    <div className="lens-bar" aria-label="Thematic lenses">{lenses.map(item => <button key={item.id} aria-pressed={lensId === item.id} onClick={() => { setLensId(item.id); setMetricId('') }}>{item.title}</button>)}</div>
    <div className="explorer-stage">
      <AtlasMap countries={data.countries} metricId={metricId} metric={metric} onSelect={item => setSelection(item.id)} />
      <div className="lens-inspector panel"><div className="section-title"><h2>{lens.title}</h2><span className="muted">{available.length} indicators</span></div><p>{lens.summary}</p>
        {layers.length ? <label className="field">Map layer<select aria-label="Lens map layer" value={metricId} onChange={event => setMetricId(event.target.value)}><option value="">Country boundaries</option>{layers.map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}</select></label> : <p className="muted">No approved map layer is available for this lens in the loaded dataset.</p>}
        {metric && <p className="muted">{metric.description} {metric.unit ? `Unit: ${metric.unit}.` : ''} Reference years vary; select a country for its source.</p>}
        <label className="field">Find a country<select aria-label="Select country on map" value={selection} onChange={event => setSelection(event.target.value)}><option value="">Select a country…</option>{data.countries.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><div className="lens-topics">{topics.slice(0, 4).map(entity => <button className="text-button" key={entity.id} onClick={() => openEntity(entity)}><BookOpen size={14} /> {entity.title} <ArrowRight size={14} /></button>)}</div>
        {!topics.length && <p className="muted">Sourced introductions and geographic records are a remaining content gap.</p>}
      </div>
      {country && <aside className="country-context panel" aria-label="Selected country"><button className="icon-button context-close" aria-label="Close country panel" onClick={() => setSelection('')}><X size={16} /></button><span className="eyebrow">{country.continent}</span><h2>{country.flag} {country.name}</h2>
        <dl className="details">{values.map(id => <div key={id}><dt>{data.metrics[id]?.label ?? id}</dt><dd>{format(country.values[id], data.metrics[id])}<small>{country.values[id].year ?? 'Reference period not recorded'}</small></dd></div>)}</dl>
        {metricId && !country.values[metricId] && <p>No national observation for the selected layer.{countryObservations(country, metricId).length ? ' Local records are available in the profile.' : ''}</p>}
        <button className="button primary" onClick={() => open(country)}>Open full profile <ArrowRight size={15} /></button><button className="text-button" disabled={pinned.length >= 5 && !pinned.includes(country.id)} onClick={() => compare(country.id)}>{pinned.includes(country.id) ? 'Remove from comparison' : 'Add to comparison'}</button>
        <details><summary>Selected layer source</summary>{metricId && country.values[metricId] ? <div><p>{country.values[metricId].definition ?? metric?.description}</p><p>{country.values[metricId].notes}</p>{country.values[metricId].source && <a href={safeUrl(country.values[metricId].source)} target="_blank" rel="noreferrer">Original source ↗</a>}</div> : <p>Open the full profile for source and confidence details for each observation.</p>}</details>
      </aside>}
    </div>
    <div className="explorer-shortcuts"><a href="#/explore">Data tables, filters & statistics <ArrowRight size={14} /></a><a href="#/countries">Browse all countries <ArrowRight size={14} /></a><a href="#/map">Full map controls <ArrowRight size={14} /></a></div>
  </section>
}

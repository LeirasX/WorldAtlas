import { useMemo, useState } from 'react'
import { ArrowRight, X } from 'lucide-react'
import AtlasMap from './AtlasMap.tsx'
import { displayValue, overviewMetrics, shortLabel } from './presentation.ts'
import { safeUrl, countryObservations, type Country, type Dataset } from './data.ts'
import { lenses, lensMetrics } from './lenses.ts'
import { type KnowledgeIndex, type KnowledgeEntity } from './knowledge.ts'

type Props = { data: Dataset; index: KnowledgeIndex; open: (country: Country) => void; openEntity: (entity: KnowledgeEntity) => void; compare: (id: string) => void; pinned: string[] }
export default function WorldExplorer({ data, index, open, openEntity, compare, pinned }: Props) {
  const [lensId, setLensId] = useState('geography')
  const [metricId, setMetricId] = useState('')
  const [selection, setSelection] = useState('')
  const [region, setRegion] = useState('')
  const lens = lenses.find(item => item.id === lensId)!
  const available = useMemo(() => lensMetrics(data, lens), [data, lens])
  const layers = available.filter(([, metric]) => metric.kind === 'number' && metric.allowMap !== false)
  const metric = data.metrics[metricId]
  const country = data.countries.find(item => item.id === selection)
  const overview = country ? overviewMetrics(country) : []
  const topics = index.entities.filter(entity => entity.kind === 'topic' && (lens.categories as readonly string[]).includes(entity.title))
  const relevant = overview.filter(item => (lens.categories as readonly string[]).includes(item.group))
  const values = country ? metricId ? [metricId] : [...new Set([...relevant.map(item => item.id), ...overview.filter(item => item.concept === 'population').map(item => item.id)])].slice(0, 3) : []
  const visible = useMemo(() => new Set(data.countries.filter(item => !region || item.continent === region).map(item => item.id)), [data, region])
  return <section className="world-explorer" aria-label="World">
    <div className="world-toolbar"><h1>World</h1>
      <label className="world-control">Lens<select aria-label="Map lens" value={lensId} onChange={event => {
        const next = lenses.find(item => item.id === event.target.value)!
        setLensId(next.id)
        setMetricId(['population', 'density'].includes(next.id) ? lensMetrics(data, next).find(([, item]) => item.allowMap !== false)?.[0] ?? '' : '')
      }}>{lenses.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <label className="world-control">Country<select aria-label="Select country on map" value={selection} onChange={event => setSelection(event.target.value)}><option value="">Find a country…</option>{data.countries.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <details className="map-options"><summary>Map options</summary><div className="panel map-options-content">
        <label className="field">Region<select aria-label="Map region" value={region} onChange={event => setRegion(event.target.value)}><option value="">All regions</option>{[...new Set(data.countries.map(item => item.continent))].map(item => <option key={item}>{item}</option>)}</select></label>
        <p>{lens.summary}</p>{metric?.description && <p>{metric.description}</p>}
        {topics.slice(0, 3).map(entity => <button className="text-button" key={entity.id} onClick={() => openEntity(entity)}>{entity.title} <ArrowRight size={13} /></button>)}
        <a href="#/map">Full map controls</a>
      </div></details>
    </div>
    <div className="world-layer lens-inspector">{layers.length ? <label>Layer<select aria-label="Lens map layer" value={metricId} onChange={event => setMetricId(event.target.value)}><option value="">Country boundaries</option>{layers.map(([id, item]) => <option key={id} value={id}>{shortLabel(id, item)}{item.unit ? ` · ${item.unit}` : ''}</option>)}</select></label> : <p className="muted">No approved map layer for this lens. <a href="#/topics">Explore topics</a></p>}</div>
    <div className="explorer-stage">
      <AtlasMap countries={data.countries} visible={visible} selected={selection} metricId={metricId} metric={metric ? { ...metric, label: shortLabel(metricId, metric) } : undefined} onSelect={item => setSelection(item.id)} />
      {country && <aside className="country-context panel" aria-label="Selected country"><button className="icon-button context-close" aria-label="Close country panel" onClick={() => setSelection('')}><X size={16} /></button><span className="eyebrow">{country.continent}</span><h2>{country.flag} {country.name}</h2>
        <dl className="details">{values.map(id => country.values[id] && <div key={id}><dt>{shortLabel(id, data.metrics[id])}</dt><dd>{displayValue(country.values[id], data.metrics[id])}<small>{overview.find(item => item.id === id)?.qualifier ?? [country.values[id].year, country.values[id].currency ?? data.metrics[id]?.unit].filter(Boolean).join(' · ')}</small></dd></div>)}</dl>
        {metricId && !country.values[metricId] && <p>No national observation.{countryObservations(country, metricId).length ? ' Local records are in the profile.' : ''}</p>}
        <button className="button primary" aria-label="Open full profile" onClick={() => open(country)}>Profile <ArrowRight size={15} /></button><button className="text-button" disabled={pinned.length >= 5 && !pinned.includes(country.id)} onClick={() => compare(country.id)}>{pinned.includes(country.id) ? 'Remove from comparison' : 'Add to comparison'}</button>
        {metricId && country.values[metricId] && <details><summary>Source & definition</summary><p>{country.values[metricId].definition ?? metric?.description}</p><p>{country.values[metricId].notes}</p>{country.values[metricId].source && <a href={safeUrl(country.values[metricId].source)} target="_blank" rel="noreferrer">Source ↗</a>}</details>}
      </aside>}
    </div>
    <div className="explorer-shortcuts"><a href="#/countries">Countries</a><a href="#/explore">Compare & data</a></div>
  </section>
}

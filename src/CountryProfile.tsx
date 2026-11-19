import { useState } from 'react'
import { ArrowLeft, Layers3, Map as MapIcon, X } from 'lucide-react'
import Markdown from 'react-markdown'
import { Modal, ObservationDetail } from './App.tsx'
import CountryVisuals from './CountryVisuals.tsx'
import ResearchPrompt from './ResearchPrompt.tsx'
import { RelatedEntities } from './KnowledgeViews.tsx'
import { overviewMetrics, displayValue, languageSummary, shortLabel } from './presentation.ts'
import { countryMetricIds, countryObservations, safeUrl, type Country, type Dataset } from './data.ts'
import type { KnowledgeEntity, KnowledgeIndex } from './knowledge.ts'

type Props = { country: Country; data: Dataset; back: () => void; viewMap: () => void; pinned: boolean; toggle: () => void; index: KnowledgeIndex; openEntity: (entity: KnowledgeEntity) => void }
export default function CountryProfile({ country, data, back, viewMap, pinned, toggle, index, openEntity }: Props) {
  const [detail, setDetail] = useState<string>()
  const [allData, setAllData] = useState(false)
  const [filter, setFilter] = useState('')
  const overview = overviewMetrics(country)
  const languages = languageSummary(String(country.values.language?.value ?? ''))
  const groups = new Map<string, { category: string; ids: string[] }>()
  for (const id of countryMetricIds(country)) {
    const category = data.metrics[id].category
    const title = category === 'Economy' ? (/oecd|tax/.test(id) ? 'Taxes & models' : 'Economy & income') : category === 'Housing' ? 'Housing' : category === 'Work' && /legal|leave|maternity|paternity/.test(id) ? 'Employment rights' : category
    const group = groups.get(title) ?? { category, ids: [] }
    group.ids.push(id); groups.set(title, group)
  }
  const fact = (id: string, label: string, qualifier?: string) => {
    const item = country.values[id]
    if (!item) return null
    return <button className="glance-fact" key={id} onClick={() => setDetail(id)} aria-label={`Inspect ${label}`}>
      <span>{label}</span><strong>{displayValue(item, data.metrics[id])}</strong><small>{qualifier ? [item.year && !qualifier.includes(item.year) ? item.year : '', qualifier].filter(Boolean).join(' · ') : [item.currency && `${item.currency}/month`, item.year, data.metrics[id]?.unit === 'km²' ? 'km²' : data.metrics[id]?.unit === 'people/km²' ? 'people/km²' : ''].filter(Boolean).join(' · ')}</small>
    </button>
  }
  return <article className="country-profile">
    <button className="text-button back" onClick={back}><ArrowLeft size={15} /> Countries</button>
    <header className="country-heading"><span className="country-flag">{country.flag}</span><div><h1>{country.name}</h1><p>{[country.values.capital?.value, country.continent].filter(Boolean).join(' · ')}</p></div>
      <div className="country-actions"><button className="button" onClick={viewMap} aria-label="View on map"><MapIcon size={16} /><span>Map</span></button><button className={pinned ? 'button selected' : 'button'} aria-pressed={pinned} onClick={toggle} aria-label={pinned ? 'Added to comparison' : 'Add to comparison'}><Layers3 size={16} /><span>{pinned ? 'Added' : 'Compare'}</span></button></div>
    </header>
    <div className="glance-geography" aria-label="Geographic overview" style={{ gridTemplateColumns: `repeat(${Math.max(1, overview.filter(item => item.group === 'Geography').length)}, minmax(0, 1fr))` }}>{overview.filter(item => item.group === 'Geography').map(item => fact(item.id, item.label, item.qualifier))}</div>
    <div className="country-glance">
      <CountryVisuals country={country} data={data} inspect={setDetail} />
      <div className="glance-right">
        {(languages || overview.some(item => ['Society', 'Nature'].includes(item.group))) && <section className="panel glance-section glance-people"><h2>People & nature</h2>
          {languages && <button className="glance-language" onClick={() => setDetail('language')}><span>Languages</span><strong>{languages}</strong></button>}
          <div className="glance-small-grid">{overview.filter(item => ['Society', 'Nature'].includes(item.group)).slice(0, 3).map(item => fact(item.id, item.label, item.qualifier))}</div>
        </section>}
        {overview.some(item => item.group === 'Economy') && <section className="panel glance-section"><h2>Economy</h2><div className="glance-small-grid">{overview.filter(item => item.group === 'Economy').slice(0, 2).map(item => fact(item.id, item.label, item.qualifier))}</div></section>}
      </div>
    </div>
    <section className="profile-disclosures" aria-label="Country details"><div className="section-title"><h2>Explore further</h2><button className="text-button" onClick={() => { setAllData(!allData); setFilter('') }}>{allData ? 'Close full data' : 'Show all data'}</button></div>
      {allData && <label className="field"><input aria-label="Find country data" placeholder="Find an indicator or definition" value={filter} onChange={event => setFilter(event.target.value)} /></label>}
      <div className={allData ? 'subject-disclosures all-data' : 'subject-disclosures'}>{[...groups].map(([title, group]) => {
        const ids = group.ids.filter(id => !filter || `${shortLabel(id, data.metrics[id])} ${data.metrics[id].label} ${data.metrics[id].description ?? ''}`.toLowerCase().includes(filter.toLowerCase()))
        if (!ids.length) return null
        return <details className="subject-disclosure" key={title + String(allData)} open={allData || undefined}>
          <summary>{title}<span>{ids.length}</span></summary>
          <div className="subject-content"><div className="subject-actions"><ResearchPrompt countries={[country]} data={data} subject={title === 'Employment rights' ? title : title === 'Taxes & models' ? 'Taxes' : group.category} /></div>
            <div className="record-list">{ids.map(id => {
              const item = country.values[id]
              return <button className="record-row" key={id} onClick={() => setDetail(id)} aria-label={data.metrics[id].label}>
                <span>{shortLabel(id, data.metrics[id])}<small>{item?.year ?? (item ? 'Period not recorded' : 'Local records')}{item?.estimated ? ' · estimate' : ''}</small></span>
                <strong>{item ? displayValue(item, data.metrics[id]) : `${countryObservations(country, id).length} local records`}<small>{item?.currency ?? data.metrics[id].unit}</small></strong>
              </button>
            })}</div>
          </div>
        </details>
      })}</div>
      {Object.keys(country.history ?? {}).length > 0 && <details className="subject-disclosure"><summary>Historical & local observations</summary><div className="subject-content record-list">{Object.entries(country.history ?? {}).map(([id, observations]) => <button className="record-row" key={id} onClick={() => setDetail(id)}><span>{shortLabel(id, data.metrics[id])}</span><strong>{observations.length} records</strong></button>)}</div></details>}
      <details className="subject-disclosure"><summary>Related subjects</summary><div className="subject-content"><RelatedEntities index={index} id={'country:' + country.id} openEntity={openEntity} /><ResearchPrompt countries={[country]} data={data} /></div></details>
      {(country.notes || country.research) && <details className="subject-disclosure"><summary>Research notes & original records</summary><div className="subject-content">
        {country.notes && <Markdown skipHtml disallowedElements={['img']} urlTransform={url => safeUrl(url) ?? ''}>{country.notes}</Markdown>}
        {country.research && <dl className="details">{Object.entries(country.research).filter(([, value]) => value).map(([field, value]) => <div key={field}><dt>{field}</dt><dd>{safeUrl(value) ? <a href={safeUrl(value)} target="_blank" rel="noreferrer">{value}</a> : value}</dd></div>)}</dl>}
      </div></details>}
    </section>
    {detail && countryObservations(country, detail).length > 0 && <Modal label={data.metrics[detail].label} onClose={() => setDetail(undefined)}>
      <div className="dialog-heading"><h2>{shortLabel(detail, data.metrics[detail])}</h2><button className="icon-button" aria-label="Close metric details" onClick={() => setDetail(undefined)}><X size={18} /></button></div>
      {overview.find(item => item.id === detail) && <p className="summary-choice">{overview.find(item => item.id === detail)!.reason} Alternative series remain in country details.</p>}
      <ObservationDetail country={country} id={detail} metric={data.metrics[detail]} />
    </Modal>}
  </article>
}

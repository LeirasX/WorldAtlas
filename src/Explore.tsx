import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Download, Filter, Layers3, Maximize2, Minimize2, Search, SlidersHorizontal, X } from 'lucide-react'
import Papa from 'papaparse'
import ResearchPrompt from './ResearchPrompt.tsx'
import { overviewMetrics, shortLabel, canCompare } from './presentation.ts'
import { availableMetrics, Modal, ObservationDetail, RegionPicker } from './App.tsx'
import { countryObservations, format, parseNumber, query, search, statistics, type Country, type Dataset } from './data.ts'

const columns = ['population', 'area', 'density', 'language', 'climate']
const labels: Record<string, string> = { population: 'Pop.', density: '/km²', net: 'Net €', rent: 'Rent €', left: 'Left €', language: 'Lang.' }

type Props = {
  data: Dataset; open: (country: Country) => void; region: string; setRegion: (value: string) => void
  filter: string; setFilter: (value: string) => void; pinned: string[]; toggle: (id: string) => void
}
type SavedView = { name: string; term: string; region: string; filter: string; fields: string[]; sort: string; descending: boolean }

function savedViews(): SavedView[] {
  try {
    const views: unknown = JSON.parse(localStorage.getItem('atlas:views') ?? '[]')
    return Array.isArray(views) ? views.filter(view => view && typeof view.name === 'string' && Array.isArray(view.fields)) : []
  } catch { return [] }
}

function Comparison({ data, countries, close, open }: { data: Dataset; countries: Country[]; close: () => void; open: (country: Country) => void }) {
  const [detail, setDetail] = useState<{ country: Country; id: string }>()
  const [allRecords, setAllRecords] = useState(false)
  const [extras, setExtras] = useState<string[]>([])
  const [expanded, setExpanded] = useState(false)
  const all = availableMetrics(data).filter(([id]) => countries.some(country => countryObservations(country, id).length))
  const selected = new Map<string, string>()
  for (const country of countries) for (const item of overviewMetrics(country)) {
    if (!selected.has(item.concept) || item.id.startsWith('wb_')) selected.set(item.concept, item.id)
  }
  const compact = new Set([...selected.values(), 'climate', ...extras])
  const keys = all.filter(([id]) => allRecords || compact.has(id))
  return <Modal label="Country comparison" onClose={close} className={expanded ? "comparison-dialog comparison-expanded" : "comparison-dialog"}>
    <div className="dialog-heading"><div><h2>Compare countries</h2><p>Differences appear only for compatible records.</p></div>
      <button className="icon-button" onClick={close} aria-label="Close comparison"><X size={20} /></button></div>
    {!detail && <div className="comparison-tools"><button className="button" aria-pressed={allRecords} onClick={() => setAllRecords(!allRecords)}>{allRecords ? 'Quick comparison' : 'All records'}</button><select aria-label="Add comparison metric" value="" onChange={event => { if (event.target.value) setExtras(previous => [...new Set([...previous, event.target.value])]) }}><option value="">Add a metric…</option>{all.filter(([id]) => !compact.has(id)).map(([id, metric]) => <option key={id} value={id}>{metric.label}</option>)}</select><button className="icon-button" aria-label={expanded ? 'Exit fullscreen comparison' : 'Fullscreen comparison'} onClick={() => setExpanded(!expanded)}>{expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button><ResearchPrompt countries={countries} data={data} /></div>}
    {detail ? <div className="comparison-detail">
      <button className="text-button" onClick={() => setDetail(undefined)}>← Back to comparison</button>
      <h3>{detail.country.name} · {data.metrics[detail.id].label}</h3>
      <ObservationDetail country={detail.country} id={detail.id} metric={data.metrics[detail.id]} />
    </div> : <div className="table-scroll comparison-scroll"><table className="compare-table">
      <thead><tr><th>Metric</th>{countries.map(country => <th key={country.id}><button className="text-button" onClick={() => { close(); open(country) }}>{country.flag} {country.name}</button></th>)}</tr></thead>
      <tbody>{keys.map(([id, metric]) => <tr key={id}><th scope="row" title={metric.label}>{allRecords ? metric.label : shortLabel(id, metric)}{metric.unit && <small>{metric.unit}</small>}</th>
        {countries.map((country, index) => {
          const value = country.values[id]
          const base = countries[0]?.values[id]?.value
          const delta = index && canCompare(countries[0]?.values[id], value, metric) && typeof base === 'number' && typeof value?.value === 'number' ? value.value - base : undefined
          const percent = metric.percentageDifference !== false && delta !== undefined && typeof base === 'number' && base > 0 ? 100 * delta / base : undefined
          const sign = delta !== undefined && delta > 0 ? '+' : ''
          return <td key={country.id}>{value ? <button className="compare-value" onClick={() => setDetail({ country, id })}>{format(value, metric)}
            <small>{[value.currency, value.year, value.estimated ? 'estimate' : ''].filter(Boolean).join(' · ')}</small></button> : countryObservations(country, id).length > 0
              ? <button className="compare-value" onClick={() => setDetail({ country, id })}>{countryObservations(country, id).length} local observations</button> : '—'}
            {delta !== undefined && <small className="delta">{sign}{format({ value: delta }, metric)}{percent !== undefined && ` · ${sign}${percent.toFixed(1)}%`}</small>}
          </td>
        })}</tr>)}</tbody>
    </table></div>}
  </Modal>
}

function FilterBuilder({ data, set }: { data: Dataset; set: (clause: string) => void }) {
  const available = availableMetrics(data)
  const [id, setId] = useState(available[0]?.[0] ?? '')
  const [operation, setOperation] = useState('>=')
  const [value, setValue] = useState('')
  const metric = data.metrics[id]
  if (!metric) return null
  const category = metric.kind === 'text'
  const operators = category ? [[':', 'Contains'], ['missing', 'Is missing']]
    : [['>=', 'At least'], ['<=', 'At most'], ['>', 'Greater than'], ['<', 'Less than'], ['=', 'Equals'], ['missing', 'Is missing'], ['estimated', 'Is estimated'], ['confidence', 'Confidence']]
  const standalone = ['missing', 'estimated'].includes(operation)
  const valid = standalone || (value.trim() && !value.includes('"') && (category || operation === 'confidence' || parseNumber(value)))
  const formatted = value.trim().includes(' ') ? `"${value.trim()}"` : value.trim()
  return <div className="filter-builder">
    <select aria-label="Filter metric" value={id} onChange={event => { setId(event.target.value); setOperation(data.metrics[event.target.value].kind === 'text' ? ':' : '>=') }}>
      {available.map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}
    </select>
    <select aria-label="Filter operator" value={operation} onChange={event => setOperation(event.target.value)}>
      {operators.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </select>
    {!standalone && <input aria-label="Filter value" value={value} placeholder="Value" onChange={event => setValue(event.target.value)} />}
    <button className="button primary" disabled={!valid} onClick={() => {
      const suffix = standalone ? `:${operation}` : operation === 'confidence' ? `:confidence=${formatted}` : `${operation}${formatted}`
      set(id + suffix); setValue('')
    }}>Add filter</button>
  </div>
}

export default function Explore({ data, open, region, setRegion, filter, setFilter, pinned, toggle }: Props) {
  const [detail, setDetail] = useState<{ country: Country; id: string }>()
  const [term, setTerm] = useState('')
  const [fields, setFields] = useState<string[]>(columns)
  const [sort, setSort] = useState('country')
  const [descending, setDescending] = useState(false)
  const [tools, setTools] = useState<'filters' | 'columns' | 'views'>()
  const [fullscreen, setFullscreen] = useState(false)
  const [compare, setCompare] = useState(false)
  const [statsMetric, setStatsMetric] = useState('')
  const [selectedStats, setSelectedStats] = useState(false)
  const [viewName, setViewName] = useState('')
  const [views, setViews] = useState(savedViews)
  const [status, setStatus] = useState('')
  const available = useMemo(() => availableMetrics(data), [data])
  const shown = fields.filter(id => available.some(([key]) => key === id))
  const numeric = available.filter(([, metric]) => metric.kind === 'number' && metric.allowStatistics !== false)
  const indicator = numeric.some(([id]) => id === statsMetric) ? statsMetric : numeric[0]?.[0]
  const { rows, error } = useMemo(() => {
    let predicate: (country: Country) => boolean
    try { predicate = query(filter, data.metrics) } catch (error) { return { rows: [], error: String(error).replace(/^Error: /, '') } }
    const list = search(data.countries, term).filter(country => (!region || country.continent === region) && predicate(country))
    return { rows: list.sort((a, b) => {
      const left = sort === 'country' ? a.name : a.values[sort]?.value
      const right = sort === 'country' ? b.name : b.values[sort]?.value
      if (left === undefined) return right === undefined ? 0 : 1
      if (right === undefined) return -1
      const difference = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right))
      return (descending ? -1 : 1) * difference
    }), error: '' }
  }, [data, term, region, filter, sort, descending])
  const chosen = pinned.flatMap(id => data.countries.find(country => country.id === id) ?? [])
  const statsRows = selectedStats ? chosen : rows
  const items = indicator ? statsRows.flatMap(country => {
    const observation = country.values[indicator]
    return typeof observation?.value === 'number' ? [observation] : []
  }) : []
  const stats = statistics(items.map(item => Number(item.value)))
  const metric = data.metrics[indicator]
  const weighted = indicator && metric.weighted && !metric.needsReview
    ? statsRows.reduce((total, country) => {
      const measure = country.values[indicator]?.value
      const population = country.values.population?.value
      if (typeof measure === 'number' && typeof population === 'number' && population > 0) {
        return { sum: total.sum + measure * population, population: total.population + population, count: total.count + 1 }
      }
      return total
    }, { sum: 0, population: 0, count: 0 }) : undefined

  function exportCsv() {
    const content = Papa.unparse({
      fields: ['id', 'country', 'continent', ...shown],
      data: rows.map(country => [country.id, country.name, country.continent, ...shown.map(id => country.values[id]?.raw ?? country.values[id]?.value ?? '')]),
    }, { escapeFormulae: true })
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url; link.download = 'orbis-explore.csv'; link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  function move(id: string, by: number) {
    const from = fields.indexOf(id), to = from + by
    if (to < 0 || to >= fields.length) return
    const next = [...fields]; [next[from], next[to]] = [next[to], next[from]]; setFields(next)
  }
  function saveViews(next: SavedView[]) {
    setViews(next)
    try { localStorage.setItem('atlas:views', JSON.stringify(next)); setStatus('') }
    catch { setStatus('Views are available for this session.') }
  }
  function sortHeader(id: string, label: string, numeric = false) {
    return <th key={id} scope="col" className={numeric ? 'numeric' : ''} aria-sort={sort === id ? descending ? 'descending' : 'ascending' : 'none'}>
      <button onClick={() => { setDescending(sort === id ? !descending : false); setSort(id) }}>{label}
        {sort === id && (descending ? <ArrowDown size={13} /> : <ArrowUp size={13} />)}</button>
    </th>
  }
  const table = <div className="table-scroll"><table className="country-table">
    <thead><tr><th className="select-col"><span className="sr-only">Compare selection</span></th>{sortHeader('country', 'Country')}
      {shown.map(id => sortHeader(id, labels[id] ?? shortLabel(id, data.metrics[id]), data.metrics[id].kind === 'number'))}</tr></thead>
    <tbody>{rows.map(country => <tr key={country.id}>
      <td className="select-col"><input type="checkbox" aria-label={`Compare ${country.name}`} checked={pinned.includes(country.id)} disabled={pinned.length >= 5 && !pinned.includes(country.id)} onChange={() => toggle(country.id)} /></td>
      <th scope="row"><button className="country-cell" onClick={() => { setFullscreen(false); open(country) }}><span>{country.flag}</span> {country.name}</button></th>
      {shown.map(id => <td key={id} className={data.metrics[id].kind === 'number' ? 'numeric' : ''} title={format(country.values[id], data.metrics[id], true)}>
        {country.history?.[id]?.length ? <button className="compare-value" onClick={() => setDetail({ country, id })}>
          {country.values[id] ? format(country.values[id], data.metrics[id]) : `${countryObservations(country, id).length} local observations`}
        </button> : format(country.values[id], data.metrics[id])}
      </td>)}
    </tr>)}</tbody>
  </table>{!rows.length && <p className="empty">{error ? 'Fix the filter to display countries.' : 'No countries match these filters.'}</p>}</div>

  return <><div className="page-heading compact-heading"><h1>Compare</h1></div>
    <section className="panel explore-panel">
      <div className="toolbar explore-toolbar">
        <label className="field with-icon"><Search size={17} /><input aria-label="Filter countries by name" placeholder="Find a country" value={term} onChange={event => setTerm(event.target.value)} /></label>
        <RegionPicker value={region} set={setRegion} />
        <button className="button" aria-expanded={tools === 'filters'} onClick={() => setTools(tools === 'filters' ? undefined : 'filters')}><Filter size={16} /> Filters</button>
        <button className="button" aria-expanded={tools === 'columns'} onClick={() => setTools(tools === 'columns' ? undefined : 'columns')}><SlidersHorizontal size={16} /> Columns</button>
        <button className="button" aria-expanded={tools === 'views'} onClick={() => setTools(tools === 'views' ? undefined : 'views')}>Saved views</button>
        <div className="toolbar-end">
          <button className="icon-button" aria-label="Export CSV" disabled={!rows.length} onClick={exportCsv}><Download size={18} /></button>
          <button className="icon-button" aria-label="Expand table" onClick={() => setFullscreen(true)}><Maximize2 size={17} /></button>
        </div>
      </div>
      {(tools === 'filters' || filter) && <div className="tools-panel">
        <label className="structured"><span>Filter expression</span><input placeholder='continent:Europe population>1M' value={filter} onChange={event => setFilter(event.target.value)} /></label>
        {filter && <button className="text-button" onClick={() => setFilter('')}>Clear filters</button>}
        {error && <p role="alert" className="error">{error}</p>}
        {tools === 'filters' && <FilterBuilder data={data} set={clause => setFilter([filter.trim(), clause].filter(Boolean).join(' '))} />}
      </div>}
      {tools === 'columns' && <div className="tools-panel column-options">
        {[...new Set([...shown, ...available.map(([id]) => id)])].map(id => <div key={id} className="column-option">
          <label className="check"><input type="checkbox" checked={shown.includes(id)} onChange={() => setFields(previous => previous.includes(id) ? previous.filter(field => field !== id) : [...previous, id])} /> {data.metrics[id].label}</label>
          {shown.includes(id) && <><button className="icon-button" aria-label={`Move ${data.metrics[id].label} earlier`} disabled={shown[0] === id} onClick={() => move(id, fields.indexOf(shown[shown.indexOf(id) - 1]) - fields.indexOf(id))}><ChevronUp size={16} /></button>
            <button className="icon-button" aria-label={`Move ${data.metrics[id].label} later`} disabled={shown.at(-1) === id} onClick={() => move(id, fields.indexOf(shown[shown.indexOf(id) + 1]) - fields.indexOf(id))}><ChevronDown size={16} /></button></>}
        </div>)}
      </div>}
      {tools === 'views' && <div className="tools-panel">
        <div className="filter-builder"><input aria-label="View name" placeholder="View name" maxLength={60} value={viewName} onChange={event => setViewName(event.target.value)} />
          <button className="button" disabled={!viewName.trim()} onClick={() => {
            const name = viewName.trim()
            saveViews([...views.filter(view => view.name !== name), { name, filter, region, fields, term, sort, descending }]); setViewName('')
          }}>Save current view</button></div>
        <ul className="saved-views">{views.map(view => <li key={view.name}><button className="text-button" onClick={() => {
          setTerm(view.term); setRegion(view.region); setFilter(view.filter); setFields(view.fields); setSort(view.sort); setDescending(view.descending)
        }}>{view.name}</button><button className="icon-button" aria-label={`Remove saved view ${view.name}`} onClick={() => saveViews(views.filter(item => item.name !== view.name))}><X size={15} /></button></li>)}</ul>
        {status && <p role="status">{status}</p>}
      </div>}
      {table}
      <div className="table-footer"><span>{rows.length} of {data.countries.length} countries</span>
        <button className="button" disabled={chosen.length < 2} onClick={() => setCompare(true)}><Layers3 size={16} /> Compare{chosen.length > 0 && ` (${chosen.length}/5)`}</button></div>
      {chosen.length > 0 && <div className="chosen">{chosen.map(country => <button className="chip" onClick={() => toggle(country.id)} key={country.id}>{country.flag} {country.name}<X size={13} /></button>)}</div>}
    </section>
    {indicator && <details className="panel statistics"><summary>Statistics</summary>
      <div className="section-title"><div><h2>Statistics</h2><p>{stats?.count ?? 0}/{statsRows.length} countries · {items.filter(item => item.estimated).length} estimates</p></div>
        <div className="statistics-controls">
          <label className="check"><input type="checkbox" checked={selectedStats} onChange={event => setSelectedStats(event.target.checked)} /> Selected only</label>
          <select aria-label="Statistics metric" value={indicator} onChange={event => setStatsMetric(event.target.value)}>
            {numeric.map(([id, entry]) => <option value={id} key={id}>{entry.label}</option>)}</select>
        </div></div>
      {stats ? <dl className="stat-grid">
        {[['Mean', stats.mean], ['Median', stats.median], ['Minimum', stats.min], ['Maximum', stats.max], ['90th percentile', stats.p90],
          ...(metric.sum ? [['Sum', stats.sum]] : [])].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{format({ value: Number(value), estimated: items.some(item => item.estimated) }, metric)}</dd></div>)}
        {weighted && weighted.population > 0 && <div><dt>Population-weighted mean</dt><dd>{format({ value: weighted.sum / weighted.population, estimated: true }, metric)}</dd><small>{weighted.count}/{statsRows.length} countries</small></div>}
      </dl> : <p className="empty">No numeric observations in this selection.</p>}
    </details>}
    {detail && <Modal label={data.metrics[detail.id].label} onClose={() => setDetail(undefined)}>
      <div className="dialog-heading"><h2>{data.metrics[detail.id].label}</h2><button className="icon-button" aria-label="Close metric details" onClick={() => setDetail(undefined)}><X size={19} /></button></div>
      <ObservationDetail country={detail.country} id={detail.id} metric={data.metrics[detail.id]} />
    </Modal>}
    {fullscreen && <Modal label="Expanded country table" className="fullscreen-dialog" onClose={() => setFullscreen(false)}>
      <div className="dialog-heading"><h2>Country table</h2><button className="icon-button" aria-label="Exit expanded table" onClick={() => setFullscreen(false)}><Minimize2 size={19} /></button></div>{table}
    </Modal>}
    {compare && chosen.length >= 2 && <Comparison data={data} countries={chosen} close={() => setCompare(false)} open={open} />}
  </>
}

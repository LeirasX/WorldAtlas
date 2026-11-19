import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ArrowDown, ArrowDownRight, ArrowLeft, ArrowRight, BookOpen, ChartNoAxesColumn,
  ChevronRight, Compass, Database, FolderOpen, Globe2, Layers3, Map as MapIcon, Moon, Search,
  Sun, Users, X, LibraryBig,
} from 'lucide-react'
import Markdown from 'react-markdown'
import registry from '../Data/metrics.json'
import { countryMetricIds, countryObservations, continents, format, query, safeUrl, search, type Country, type Dataset, type Metric, type Metrics, type Observation } from './data.ts'
import { bundledData, currentData, desktop, desktopFolder, forgetDesktopFolder, importData, resetData } from './platform.ts'
import { buildKnowledge, importKnowledge, searchKnowledge, stableId, type KnowledgeEntity, type KnowledgeIndex } from './knowledge.ts'
import { TopicBrowser, EntityPage, RelatedEntities } from './KnowledgeViews.tsx'
import CountryVisuals from './CountryVisuals.tsx'
import AtlasMap from './AtlasMap.tsx'
import Explore from './Explore.tsx'

const metrics = registry as Metrics
const sections = [
  { id: 'world', label: 'Discover', icon: Globe2 },
  { id: 'explore', label: 'Explore', icon: Compass },
  { id: 'map', label: 'Map', icon: MapIcon },
  { id: 'topics', label: 'Topics', icon: LibraryBig },
  { id: 'countries', label: 'Countries', icon: BookOpen },
] as const
type Page = typeof sections[number]['id'] | 'entity'
type Route = { page: Page; id?: string }
const regionOrder = ['Europe', 'Asia', 'Africa', 'North America', 'South America', 'Oceania'] as const
const regionClass: Record<string, string> = { Europe: 'eu', Asia: 'as', Africa: 'af', 'North America': 'na', 'South America': 'sa', Oceania: 'oc' }
const regionGlyph: Record<string, string> = { Europe: 'EU', Asia: 'AS', Africa: 'AF', 'North America': 'NA', 'South America': 'SA', Oceania: 'OC' }

function readRoute(): Route {
  const [page, id] = window.location.hash.slice(1).replace(/^\//, '').split('/')
  let decoded: string | undefined
  try { decoded = id && decodeURIComponent(id) } catch { decoded = undefined }
  return { page: page === 'entity' ? 'entity' : sections.find(section => section.id === page)?.id ?? 'world', id: decoded }
}

function readPreference(key: string) {
  try { return localStorage.getItem(key) } catch { return null }
}
function storePreference(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* Preferences can be temporary. */ }
}

export function Modal({ label, children, onClose, className = '' }: { label: string; children: ReactNode; onClose: () => void; className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  return <dialog ref={dialog} className={`dialog ${className}`} aria-label={label}
    onCancel={event => { event.preventDefault(); onClose() }}
    onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="dialog-content">{children}</div>
  </dialog>
}

function SearchDialog({ countries, recent, close, open, index, openEntity }: {
  countries: Country[]; recent: string[]; close: () => void; open: (country: Country) => void
  index: KnowledgeIndex; openEntity: (entity: KnowledgeEntity) => void
}) {
  const [term, setTerm] = useState('')
  const [active, setActive] = useState(0)
  const countryResults = term ? search(countries, term).slice(0, 5) : recent.flatMap(id => countries.find(country => country.id === id) ?? [])
  const list = countryResults.length || term ? countryResults : countries.slice(0, 3)
  const entities = term ? searchKnowledge(index, term).filter(entity => entity.kind !== 'country').slice(0, 6)
    : index.entities.filter(entity => entity.kind === 'topic').slice(0, 3)
  const results = [
    ...list.map(country => ({ id: country.id, title: country.name, subtitle: country.continent, flag: country.flag, action: () => open(country) })),
    ...entities.map(entity => ({ id: entity.id, title: entity.title, subtitle: entity.kind, flag: '', action: () => openEntity(entity) })),
  ]
  useEffect(() => { document.getElementById(`country-option-${active}`)?.scrollIntoView({ block: 'nearest' }) }, [active])
  return <Modal label="Search WorldAtlas" onClose={close} className="spotlight">
    <div className="search-input"><Search size={20} /><input autoFocus placeholder="Countries, places, topics and sources" value={term}
      aria-label="Search WorldAtlas" role="combobox" aria-expanded="true" aria-controls="country-results"
      aria-activedescendant={results[active] ? `country-option-${active}` : undefined}
      onChange={event => { setActive(0); setTerm(event.target.value) }}
      onKeyDown={event => {
        if (event.key === 'Enter' && results[active]) results[active].action()
        if (event.key === 'ArrowDown') { event.preventDefault(); setActive(Math.min(results.length - 1, active + 1)) }
        if (event.key === 'ArrowUp') { event.preventDefault(); setActive(Math.max(0, active - 1)) }
      }} /><button className="icon-button" aria-label="Close search" onClick={close}><X size={18} /></button></div>
    <div id="country-results" role="listbox" className="spotlight-results">
      {results.map((result, position) => <button id={`country-option-${position}`} role="option" aria-selected={active === position} key={result.id}
        className={active === position ? 'search-result active' : 'search-result'} onMouseMove={() => setActive(position)} onClick={result.action}>
        <span className="row-flag">{result.flag || <BookOpen size={19} />}</span><strong>{result.title}</strong><span>{result.subtitle}</span>
      </button>)}
      {!results.length && <p className="empty">No available knowledge matches “{term}”.</p>}
    </div>
  </Modal>
}

function World({ data, go, open, index, openEntity }: { data: Dataset; go: (page: Page, region?: string) => void; open: (country: Country) => void; index: KnowledgeIndex; openEntity: (entity: KnowledgeEntity) => void }) {
  const sum = (id: string) => data.countries.reduce((result, country) => result + (Number(country.values[id]?.value) || 0), 0)
  const facts = [
    { icon: Globe2, value: String(data.countries.length), label: 'Countries' },
    { icon: Users, value: format({ value: sum('population') }), label: 'Snapshot population' },
    ...(sum('area') ? [{ icon: MapIcon, value: `${format({ value: sum('area') })} km²`, label: 'Total land area' }]
      : [{ icon: ChartNoAxesColumn, value: String(availableMetrics(data).length), label: 'Available indicators' }]),
    { icon: Layers3, value: String(new Set(data.countries.map(country => country.continent)).size), label: 'Continents' },
  ]
  const featured = ['PRT', 'JPN', 'BRA', 'NZL'].map(id => data.countries.find(country => country.id === id)).filter((country): country is Country => Boolean(country))
  return <>
    <section className="hero">
      <AtlasMap countries={data.countries} decorative />
      <div className="hero-content">
        <span className="eyebrow">A world of connections</span><h1>Explore the world.</h1>
        <p>Discover places. Follow an idea. Understand the evidence behind everyday life.</p>
        <button className="hero-button" onClick={() => go('explore')}><Compass size={18} /> Explore countries <ArrowRight size={17} /></button>
      </div>
      <button className="hero-map-link" onClick={() => go('map')}>Open world map <ArrowDownRight size={16} /></button>
    </section>
    <section className="world-section discovery-topics">
      <div className="section-title"><h2>Start with a question.</h2><button className="text-button" onClick={() => go('topics')}>All topics <ArrowRight size={16} /></button></div>
      <div className="topic-grid">{['Housing', 'Economy', 'Climate'].flatMap(category => index.entities.find(entity => entity.id === stableId('topic', category)) ?? []).map(entity =>
        <button className="topic-tile" key={entity.id} onClick={() => openEntity(entity)}><BookOpen size={21} /><h2>{entity.title}</h2><p>{entity.summary}</p><span>Explore the evidence <ArrowRight size={15} /></span></button>)}</div>
    </section>
    <div className="facts">
      {facts.map(({ icon: Icon, value, label }) => <div key={label} className="fact"><div className="fact-icon"><Icon size={19} /></div><div><strong>{value}</strong><span>{label}</span></div></div>)}
    </div>
    <section className="world-section">
      <div className="section-title"><div><h2>Continents</h2><p>Browse countries by region.</p></div><button className="text-button" onClick={() => go('explore')}>View all countries <ArrowRight size={16} /></button></div>
      <div className="regions">{regionOrder.map(region => <button key={region} className="region-card" onClick={() => go('explore', region)}>
        <span className={`region-glyph ${regionClass[region]}`} aria-hidden="true">{regionGlyph[region]}</span><span>
          <strong>{region}</strong><small>{data.countries.filter(country => country.continent === region).length} countries</small></span><ChevronRight size={17} />
      </button>)}</div>
    </section>
    <section className="world-section featured">
      <div className="section-title"><h2>Country profiles</h2><button className="text-button" onClick={() => go('countries')}>Browse profiles <ArrowRight size={16} /></button></div>
      <div className="country-grid">{featured.map(country => <CountryTile key={country.id} country={country} onClick={() => open(country)} />)}</div>
    </section>
  </>
}

function CountryTile({ country, onClick }: { country: Country; onClick: () => void }) {
  return <button className="country-tile" onClick={onClick}>
    <span className="tile-flag">{country.flag}</span><span><strong>{country.name}</strong><small>{country.continent}</small></span><ChevronRight size={16} />
  </button>
}

export function availableMetrics(data: Dataset) {
  const ids = new Set(data.countries.flatMap(country => countryMetricIds(country)))
  return Object.entries(data.metrics).filter(([id]) => ids.has(id))
}

function ObservationRecord({ item, metric }: { item: Observation; metric: Metric }) {
  const details = [
    ['Unit', item.unit ?? metric.unit], ['Currency', item.currency], ['Verification', item.verification],
    ['Estimate status', item.estimateStatus], ['Source series', item.sourceName],
    ['Source status', item.sourceStatus], ['Source code', item.sourceCode],
    ['Indicator', metric.indicator], ['Source organization', metric.sourceOrganization],
    ['Reference period', item.year], ['Confidence', item.confidence],
    ['Status', [item.calculated && 'Calculated', item.estimated && 'Estimated'].filter(Boolean).join(' · ') || 'Imported'],
    ['Original value', item.raw], ['Source record value', item.sourceValue && item.sourceValue !== item.raw ? item.sourceValue : undefined],
    ['Geographic scope', item.scope], ['Geographic basis', item.basis], ['Source location', item.sourceLocation],
    ['Method', item.method], ['Comparability', metric.aggregationNotes], ['Notes', item.notes],
  ]
  const url = item.source && safeUrl(item.source)
  return <><div className="detail-value">{format(item, metric, true)}</div>
    {(item.definition ?? metric.description) && <p>{item.definition ?? metric.description}</p>}
    {metric.needsReview && <p>Review this column’s definition and unit in the metric registry.</p>}
    <dl className="details">{details.filter(([, value]) => value).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}
      {item.source && <div><dt>Source</dt><dd>{url ? <a href={url} target="_blank" rel="noreferrer">Open source ↗</a> : item.source}</dd></div>}
    </dl>
  </>
}

export function ObservationDetail({ country, id, metric }: { country: Country; id: string; metric: Metric }) {
  const primary = country.values[id]
  const additional = country.history?.[id] ?? []
  if (!primary && !additional.length) return <p>No observation is available.</p>
  return <>
    {primary && <ObservationRecord item={primary} metric={metric} />}
    {additional.length > 0 && <section className="research">
      <p>{additional.length} additional observations by location or reference period.</p>
      {additional.map((item, index) => <details key={index} open={!primary && index === 0}>
        <summary>{item.sourceLocation || item.basis || 'National'} · {item.year || 'Period unspecified'}</summary>
        <ObservationRecord item={item} metric={metric} />
      </details>)}
    </section>}
  </>
}

function Profile({ country, data, back, viewMap, pinned, toggle, index, openEntity }: {
  index: KnowledgeIndex; openEntity: (entity: KnowledgeEntity) => void; country: Country; data: Dataset; back: () => void; viewMap: () => void; pinned: boolean; toggle: () => void
}) {
  const [detail, setDetail] = useState<string>()
  const groups = new Map<string, string[]>()
  for (const id of countryMetricIds(country)) {
    const category = data.metrics[id].category
    groups.set(category, [...(groups.get(category) ?? []), id])
  }
  return <>
    <button className="text-button back" onClick={back}><ArrowLeft size={17} /> All countries</button>
    <section className="profile-banner">
      <span className="profile-flag">{country.flag}</span><div><p>{country.continent} · {country.id}</p><h1>{country.name}</h1>
        {country.values.language && <p>{country.values.language.value}</p>}</div>
      <div className="profile-actions"><button className="button" onClick={viewMap}><MapIcon size={16} /> View on map</button>
        <button className={pinned ? 'button selected' : 'button'} aria-pressed={pinned} onClick={toggle}><Layers3 size={16} /> {pinned ? 'Added to comparison' : 'Add to comparison'}</button></div>
    </section>
    <CountryVisuals country={country} data={data} />
    <RelatedEntities index={index} id={'country:' + country.id} openEntity={openEntity} />
    {[...groups].map(([category, ids]) => <section className="profile-section" key={category}><h2>{category}</h2>
      <div className="metric-grid">{ids.map(id => <button className="metric-card" key={id} onClick={() => setDetail(id)}>
        <span>{data.metrics[id].label}</span><strong>{country.values[id] ? format(country.values[id], data.metrics[id]) : `${countryObservations(country, id).length} local observations`}</strong>
        <small>{data.metrics[id].unit ?? (country.values[id]?.estimated ? 'Estimate' : '')}</small>
      </button>)}</div>
    </section>)}
    {country.notes && <section className="panel research notes"><h2>Research notes</h2>
      <Markdown skipHtml disallowedElements={['img']} urlTransform={url => safeUrl(url) ?? ''}
        components={{ a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" /> }}>
        {country.notes}
      </Markdown>
    </section>}
    {country.research && <details className="panel research"><summary>Source record</summary><dl className="details">
      {Object.entries(country.research).filter(([, value]) => value).map(([field, value]) => <div key={field}>
        <dt>{field}</dt><dd>{safeUrl(value) ? <a href={safeUrl(value)} target="_blank" rel="noreferrer">{value}</a> : value}</dd></div>)}
    </dl></details>}
    {detail && countryObservations(country, detail).length > 0 && <Modal label={data.metrics[detail].label} onClose={() => setDetail(undefined)}>
      <div className="dialog-heading"><h2>{data.metrics[detail].label}</h2><button className="icon-button" aria-label="Close metric details" onClick={() => setDetail(undefined)}><X size={19} /></button></div>
      <ObservationDetail country={country} id={detail} metric={data.metrics[detail]} />
    </Modal>}
  </>
}

function Directory({ countries, open }: { countries: Country[]; open: (country: Country) => void }) {
  const [term, setTerm] = useState('')
  const [region, setRegion] = useState('')
  const list = search(countries, term).filter(country => !region || country.continent === region)
  return <><div className="page-heading"><h1>Countries</h1><p>Find a profile by name, region, or country code.</p></div>
    <div className="toolbar"><label className="field with-icon"><Search size={17} /><input placeholder="Find a country" aria-label="Find a country" value={term} onChange={event => setTerm(event.target.value)} /></label>
      <RegionPicker value={region} set={setRegion} /></div>
    <div className="country-grid directory">{list.map(country => <CountryTile key={country.id} country={country} onClick={() => open(country)} />)}</div>
    {!list.length && <p className="empty">No matching countries.</p>}
  </>
}

export function RegionPicker({ value, set }: { value: string; set: (value: string) => void }) {
  return <select aria-label="Continent" value={value} onChange={event => set(event.target.value)}>
    <option value="">All continents</option>{regionOrder.map(region => <option key={region}>{region}</option>)}
  </select>
}

function MapPage({ data, open, focus, region, filter, setRegion }: {
  data: Dataset; open: (country: Country) => void; focus?: string; region: string; filter: string; setRegion: (value: string) => void
}) {
  const [metric, setMetric] = useState('')
  const [target, setTarget] = useState(focus ?? '')
  const [useFilters, setUseFilters] = useState(true)
  const selected = availableMetrics(data).filter(([, item]) => item.kind === 'number' && item.allowMap !== false)
  const visible = useMemo(() => {
    let predicate: (country: Country) => boolean
    try { predicate = useFilters ? query(filter, data.metrics) : () => true } catch { predicate = () => true }
    return new Set(data.countries.filter(country => (!region || country.continent === region) && predicate(country)).map(country => country.id))
  }, [data, region, filter, useFilters])
  return <><div className="page-heading"><h1>World map</h1><p>Select a country or color the map by a data indicator.</p></div>
    <div className="toolbar"><RegionPicker value={region} set={setRegion} />
      <select aria-label="Color by metric" value={metric} onChange={event => setMetric(event.target.value)}>
        <option value="">Country boundaries</option>{selected.map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}
      </select>
      <select aria-label="Zoom to country" value={target} onChange={event => setTarget(event.target.value)}>
        <option value="">Zoom to country…</option>{data.countries.map(country => <option key={country.id} value={country.id}>{country.name}</option>)}
      </select>
      {filter && <label className="check"><input type="checkbox" checked={useFilters} onChange={event => setUseFilters(event.target.checked)} /> Apply Explore query</label>}
    </div>
    <AtlasMap countries={data.countries} visible={visible} metricId={metric} metric={data.metrics[metric]} onSelect={open} focus={target} />
    <p className="muted map-note">{visible.size} of {data.countries.length} countries highlighted. Natural Earth depicts de facto boundaries. Small countries have point markers.</p>
  </>
}

export default function App() {
  const [{ dataset: fallback, warning }] = useState(() => bundledData(metrics))
  const [data, setData] = useState(() => currentData(metrics, fallback))
  const [route, setRoute] = useState(readRoute)
  const [packs, setPacks] = useState<string[]>(() => {
    try { const cached: unknown = JSON.parse(readPreference('atlas:knowledge-packs') ?? '[]'); return Array.isArray(cached) ? cached.filter((item): item is string => typeof item === 'string') : [] }
    catch { return [] }
  })
  const knowledge = useMemo(() => {
    let index = buildKnowledge(data)
    const warnings: string[] = []
    for (const pack of packs) {
      try { index = importKnowledge(pack, index) } catch (error) { warnings.push(String(error)) }
    }
    return { index, warnings }
  }, [data, packs])

  const [region, setRegion] = useState('')
  const [filter, setFilter] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [showData, setShowData] = useState(false)
  const [importStatus, setImportStatus] = useState(warning)
  const [folderAvailable, setFolderAvailable] = useState(false)
  const [theme, setTheme] = useState(() => readPreference('atlas:theme') || 'system')
  const [pinned, setPinned] = useState<string[]>([])
  const [recent, setRecent] = useState<string[]>(() => {
    try { const value: unknown = JSON.parse(readPreference('atlas:recent') ?? '[]'); return Array.isArray(value) ? value.filter(item => typeof item === 'string').slice(0, 6) : [] }
    catch { return [] }
  })
  const lastFolder = useRef<string | undefined>(undefined)
  const [folderRevision, setFolderRevision] = useState(0)
  useEffect(() => {
    const onHash = () => { setRoute(readRoute()); window.scrollTo(0, 0) }
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setShowSearch(open => !open)
      }
    }
    window.addEventListener('hashchange', onHash)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('hashchange', onHash); window.removeEventListener('keydown', onKey) }
  }, [])
  useEffect(() => { document.documentElement.dataset.theme = theme; storePreference('atlas:theme', theme) }, [theme])
  useEffect(() => {
    if (!desktop) return
    let active = true
    let timer: number
    async function refresh() {
      try {
        const files = await desktopFolder()
        if (!active) return
        if (files) {
          setFolderAvailable(true)
          const signature = JSON.stringify(files)
          if (signature !== lastFolder.current) {
            const result = importData(files, metrics, fallback)
            lastFolder.current = signature
            setData(result.dataset)
            setImportStatus('Folder data is up to date.')
          }
        }
      } catch (error) {
        if (active) setImportStatus(`Folder update skipped. ${String(error)}`)
      } finally {
        if (active) timer = window.setTimeout(refresh, 2500)
      }
    }
    void refresh()
    return () => { active = false; window.clearTimeout(timer) }
  }, [fallback, folderRevision])

  function go(page: Page, nextRegion?: string, id?: string) {
    if (nextRegion !== undefined) setRegion(nextRegion)
    const next = `#/${page}${id ? '/' + encodeURIComponent(id) : ''}`
    if (location.hash !== next) location.hash = next
    else window.scrollTo(0, 0)
  }
  function open(country: Country) {
    const next = [country.id, ...recent.filter(id => id !== country.id)].slice(0, 6)
    setRecent(next); storePreference('atlas:recent', JSON.stringify(next))
    setShowSearch(false); go('countries', undefined, country.id)
  }
  function openEntity(entity: KnowledgeEntity) {
    if (entity.kind === 'country') {
      const country = data.countries.find(item => item.id === entity.countryId)
      if (country) open(country)
      return
    }
    setShowSearch(false)
    go('entity', undefined, entity.id)
  }
  function toggle(id: string) {
    setPinned(previous => previous.includes(id) ? previous.filter(item => item !== id) : previous.length < 5 ? [...previous, id] : previous)
  }
  function applyImport(files: { name: string; text: string }[]) {
    const result = importData(files, metrics, fallback)
    setData(result.dataset)
    setImportStatus(result.persistent ? 'Updated country data saved on this device.' : 'Data loaded for this session. Device storage is unavailable.')
  }

  const country = data.countries.find(item => item.id === route.id)
  const observations = data.countries.flatMap(item => Object.values(item.values))
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform)
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  return <div className="shell">
    <aside className="sidebar">
      <a className="brand" href="#/world"><span className="brand-mark"><Globe2 size={23} /></span><span>WorldAtlas</span></a>
      <nav aria-label="Main navigation">{sections.map(({ id, label, icon: Icon }) => <a key={id} href={`#/${id}`} className={route.page === id ? 'nav-link current' : 'nav-link'} aria-current={route.page === id ? 'page' : undefined}>
        <Icon size={19} strokeWidth={1.9} /><span>{label}</span></a>)}</nav>
      <div className="sidebar-bottom"><button className="nav-link" onClick={() => setShowData(true)}><Database size={18} /> <span>Data & sources</span></button>
        <div className="offline-label"><i /> Local data</div>
      </div>
    </aside>
    <div className="workspace">
      <header className="topbar">
        <div className="breadcrumb"><span>Atlas</span><ChevronRight size={14} /><strong>{route.page === 'entity' ? knowledge.index.entities.find(entity => entity.id === route.id)?.title ?? 'Knowledge' : sections.find(section => section.id === route.page)?.label}</strong></div>
        <a href="#/world" className="mobile-brand"><Globe2 size={19} /> WorldAtlas</a>
        <div className="top-actions"><button className="search-trigger" onClick={() => setShowSearch(true)}><Search size={17} /><span>Search WorldAtlas</span><kbd>{isMac ? '⌘ K' : 'Ctrl K'}</kbd></button>
          <button className="icon-button theme-button" aria-label={dark ? 'Use light theme' : 'Use dark theme'} onClick={() => setTheme(dark ? 'light' : 'dark')}>{dark ? <Sun size={19} /> : <Moon size={18} />}</button>
          <button className="icon-button mobile-data" aria-label="Data and sources" onClick={() => setShowData(true)}><Database size={18} /></button>
        </div>
      </header>
      <main className="main">
        {warning && <p role="alert" className="data-warning">{warning}</p>}
        {route.page === 'world' && <World data={data} go={go} open={open} index={knowledge.index} openEntity={openEntity} />}
        {route.page === 'topics' && <TopicBrowser data={data} index={knowledge.index} openEntity={openEntity} openCountry={open} />}
        {route.page === 'entity' && (knowledge.index.entities.find(entity => entity.id === route.id)
          ? <EntityPage key={route.id} data={data} index={knowledge.index} entity={knowledge.index.entities.find(entity => entity.id === route.id)!} openEntity={openEntity} openCountry={open} />
          : <div className="page-heading"><h1>Subject unavailable</h1><p>This subject is absent from the content on this device.</p><a href="#/topics">Explore available topics</a></div>)}
        {route.page === 'explore' && <Explore data={data} open={open} region={region} setRegion={setRegion} filter={filter} setFilter={setFilter} pinned={pinned} toggle={toggle} />}
        {route.page === 'map' && <MapPage key={route.id ?? 'map'} data={data} open={open} region={region} setRegion={setRegion} filter={filter} focus={country?.id} />}
        {route.page === 'countries' && (country ? <Profile key={country.id} index={knowledge.index} openEntity={openEntity} data={data} country={country} back={() => go('countries')}
          viewMap={() => go('map', '', country.id)} pinned={pinned.includes(country.id)} toggle={() => toggle(country.id)} />
          : <Directory countries={data.countries} open={open} />)}
      </main>
      <footer className="footer"><Globe2 size={15} /> WorldAtlas <span>·</span> <button className="text-button" onClick={() => setShowData(true)}>Data & sources</button></footer>
    </div>
    {showSearch && <SearchDialog index={knowledge.index} openEntity={openEntity} countries={data.countries} recent={recent} close={() => setShowSearch(false)} open={open} />}
    {showData && <Modal label="Data and sources" onClose={() => setShowData(false)}>
      <div className="dialog-heading"><h2>Data & sources</h2><button className="icon-button" aria-label="Close data details" onClick={() => setShowData(false)}><X size={19} /></button></div>
      <dl className="details">
        <div><dt>Countries</dt><dd>{data.countries.length}</dd></div><div><dt>Available metrics</dt><dd>{availableMetrics(data).length}</dd></div>
        <div><dt>Missing values</dt><dd>{availableMetrics(data).length * data.countries.length - observations.length}</dd></div>
        <div><dt>Estimated values</dt><dd>{observations.filter(item => item.estimated).length}</dd></div>
        <div><dt>Confidence recorded</dt><dd>{observations.filter(item => item.confidence).length} observations</dd></div>
        <div><dt>Reference periods</dt><dd>{[...new Set(observations.flatMap(item => item.year ? [item.year] : []))].sort().join(', ') || '—'}</dd></div>
        <div><dt>Files</dt><dd>{data.files.join(', ')}</dd></div>
      </dl>
      <p>Import the six normalized continent CSVs together. Imported files are stored on this device.</p>
      <div className="dialog-actions">
        <label className="button file-button"><ArrowDown size={16} /> Import CSVs<input type="file" accept=".csv,text/csv" multiple aria-label="Import CSVs" onChange={async event => {
          const files = Array.from(event.target.files ?? [])
          event.target.value = ''
          if (!files.length) return
          try { applyImport(await Promise.all(files.map(async file => ({ name: file.name, text: await file.text() })))) }
          catch (error) { setImportStatus(String(error)) }
        }} /></label>
        {desktop && <button className="button" onClick={async () => {
          try {
            const files = await desktopFolder(true)
            if (files) { applyImport(files); lastFolder.current = JSON.stringify(files); setFolderAvailable(true); setFolderRevision(value => value + 1) }
          } catch (error) { setImportStatus(String(error)) }
        }}><FolderOpen size={17} /> Choose data folder</button>}
        {(data !== fallback || folderAvailable) && <button className="button" onClick={async () => {
          try {
            await forgetDesktopFolder(); resetData(); setData(fallback); setFolderAvailable(false)
            lastFolder.current = undefined; setFolderRevision(value => value + 1); setImportStatus('Bundled data restored.')
          } catch (error) { setImportStatus(String(error)) }
        }}>Restore bundled data</button>}
      </div>
      <details className="research"><summary>Import research articles and relationships</summary>
        <p>Version 1 JSON packs contain entities, named sources and relationships. Imported content is stored on this device.</p>
        <label className="button file-button">Import knowledge JSON<input type="file" accept=".json,application/json" aria-label="Import knowledge JSON" onChange={async event => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (!file) return
          try {
            const raw = await file.text()
            importKnowledge(raw, knowledge.index)
            const next = [...packs, raw]
            setPacks(next)
            try { localStorage.setItem('atlas:knowledge-packs', JSON.stringify(next)); setImportStatus('Knowledge imported and saved on this device.') }
            catch { setImportStatus('Knowledge imported for this session. Device storage is unavailable.') }
          } catch (error) { setImportStatus(String(error)) }
        }} /></label>
        {packs.length > 0 && <button className="button" onClick={() => { setPacks([]); storePreference('atlas:knowledge-packs', '[]'); setImportStatus('Imported knowledge removed. Built-in research is available.') }}>Remove imported knowledge</button>}
        {knowledge.warnings.map((warning, index) => <p key={index} role="alert">{warning}</p>)}
      </details>
      {importStatus && <p role="status">{importStatus}</p>}
      <p className="muted">Map boundaries and the public population snapshot are from <a href="https://www.naturalearthdata.com/" target="_blank" rel="noreferrer">Natural Earth</a>.</p>
    </Modal>}
  </div>
}

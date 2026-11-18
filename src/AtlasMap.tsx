import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { Minus, Plus, RotateCcw } from 'lucide-react'
import { format, type Country, type Metric } from './data.ts'

type Point = [number, number]
type Shape = { id: string; name: string; point: Point; polygons: Point[][][] }
type Outline = { id: string; name: string; x: number; y: number; path: string; marker: boolean }
const width = 960
const height = 480
const project = ([longitude, latitude]: Point): Point => {
  const radians = latitude * Math.PI / 180
  return [480 + longitude * (2.58 - .54 * Math.pow(Math.abs(radians), 2)), 258 - latitude * 2.75]
}
let outlines: Promise<Outline[]> | undefined
function getOutlines() {
  return outlines ??= fetch(import.meta.env.BASE_URL + 'world-map.json').then(response => {
    if (!response.ok) throw new Error('Map boundaries could not be loaded.')
    return response.json() as Promise<Shape[]>
  }).then(shapes => shapes.filter(shape => shape.id !== 'ATA').map(shape => {
    const [x, y] = project(shape.point)
    const area = shape.polygons.reduce((sum, polygon) => sum + polygon.reduce((total, ring) => {
      return total + Math.abs(ring.reduce((cross, point, index) => {
        const next = ring[(index + 1) % ring.length]
        return cross + point[0] * next[1] - next[0] * point[1]
      }, 0))
    }, 0), 0)
    const path = shape.polygons.flatMap(polygon => polygon.map(ring =>
      ring.map((point, index) => (index ? 'L' : 'M') + project(point).map(value => value.toFixed(1)).join(' ')).join('') + 'Z',
    )).join('')
    return { id: shape.id, name: shape.name, x, y, path, marker: area < 1.2 }
  })).catch((error: unknown) => { outlines = undefined; throw error })
}

type Props = {
  countries: Country[]; visible?: Set<string>; metricId?: string; metric?: Metric
  onSelect?: (country: Country) => void; decorative?: boolean; focus?: string
}

export default function AtlasMap({ countries, visible, metricId, metric, onSelect, decorative, focus }: Props) {
  const [shapes, setShapes] = useState<Outline[]>([])
  const [error, setError] = useState(false)
  const [hover, setHover] = useState<Outline>()
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 })
  const svg = useRef<SVGSVGElement>(null)
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null)
  const suppressClick = useRef(false)
  useEffect(() => { let active = true; getOutlines().then(data => { if (active) setShapes(data) }).catch(() => { if (active) setError(true) }); return () => { active = false } }, [])
  useEffect(() => {
    const shape = shapes.find(item => item.id === focus)
    if (shape) setView({ zoom: 3, x: width / 2 - shape.x * 3, y: height / 2 - shape.y * 3 })
  }, [focus, shapes])
  const byId = useMemo(() => new Map(countries.map(country => [country.id, country])), [countries])
  const numbers = metricId ? countries.filter(country => !visible || visible.has(country.id))
    .map(country => country.values[metricId]?.value).filter((value): value is number => typeof value === 'number') : []
  const min = numbers.length ? Math.min(...numbers) : 0
  const max = numbers.length ? Math.max(...numbers) : 0
  const extent = Math.max(Math.abs(min), Math.abs(max)) || 1
  const getFill = (country?: Country) => {
    if (!country || (visible && !visible.has(country.id))) return 'var(--map-muted)'
    if (!metricId) return 'var(--map-land)'
    const value = country.values[metricId]?.value
    if (typeof value !== 'number') return 'var(--map-missing)'
    if (metric?.diverging) return `color-mix(in srgb, var(--map-neutral), ${value < 0 ? '#d9615b' : '#238d78'} ${Math.abs(value) / extent * 100}%)`
    return `color-mix(in srgb, var(--map-neutral), var(--map-high) ${(max === min ? .65 : (value - min) / (max - min)) * 100}%)`
  }
  const zoom = (factor: number) => setView(previous => {
    const next = Math.min(12, Math.max(1, previous.zoom * factor))
    const ratio = next / previous.zoom
    return next === 1 ? { zoom: 1, x: 0, y: 0 }
      : { zoom: next, x: width / 2 - (width / 2 - previous.x) * ratio, y: height / 2 - (height / 2 - previous.y) * ratio }
  })
  function pointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0 || drag.current) return
    suppressClick.current = false
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false }
  }
  function pointerMove(event: PointerEvent<SVGSVGElement>) {
    const pointer = drag.current
    if (!pointer || pointer.id !== event.pointerId) return
    const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y
    if (!pointer.moved && Math.hypot(dx, dy) < 5) return
    if (!pointer.moved) event.currentTarget.setPointerCapture(pointer.id)
    pointer.moved = suppressClick.current = true
    pointer.x = event.clientX
    pointer.y = event.clientY
    const scale = svg.current?.getScreenCTM()?.a || 1
    setView(previous => ({
      ...previous, x: Math.min(width * .8, Math.max(width * .2 - width * previous.zoom, previous.x + dx / scale)),
      y: Math.min(height * .8, Math.max(height * .2 - height * previous.zoom, previous.y + dy / scale)),
    }))
  }
  function open(shape: Outline) {
    const country = byId.get(shape.id)
    if (country) onSelect?.(country)
  }
  const hovered = hover && byId.get(hover.id)
  return <div className={decorative ? 'atlas-map atlas-art' : 'atlas-map'}>
    {error && !decorative && <p role="alert" className="map-message">The bundled map could not be loaded. Reload to try again.</p>}
    <svg ref={svg} viewBox={`0 0 ${width} ${height}`} aria-hidden={decorative || undefined} aria-label={decorative ? undefined : 'World map'}
      onPointerDown={decorative ? undefined : pointerDown} onPointerMove={decorative ? undefined : pointerMove}
      onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}
      onPointerLeave={() => { if (!drag.current?.moved) drag.current = null; setHover(undefined) }}>
      <g className="graticule" aria-hidden="true">
        {[-60, -30, 0, 30, 60].map(lat => <path key={lat} d={`M${project([-180, lat]).join(' ')}L${project([180, lat]).join(' ')}`} />)}
        {[-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150].map(lon => <path key={lon}
          d={Array.from({ length: 18 }, (_, i) => (i ? 'L' : 'M') + project([lon, -80 + i * 10]).join(' ')).join('')} />)}
      </g>
      <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
        {shapes.map(shape => {
          const country = byId.get(shape.id)
          const interactive = !decorative && Boolean(country)
          return <g key={shape.id} className={interactive ? 'map-country' : ''}
            role={interactive ? 'button' : undefined} tabIndex={interactive ? 0 : undefined} aria-label={interactive ? country?.name : undefined}
            onPointerEnter={decorative ? undefined : () => setHover(shape)} onPointerLeave={() => setHover(undefined)}
            onFocus={() => setHover(shape)} onBlur={() => setHover(undefined)}
            onClick={interactive ? () => { if (!suppressClick.current) open(shape) } : undefined}
            onKeyDown={interactive ? event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); open(shape) } } : undefined}
            fill={getFill(country)}>
            <path d={shape.path} fillRule="evenodd" vectorEffect="non-scaling-stroke" />
            {shape.marker && country && <circle cx={shape.x} cy={shape.y} r={3.5 / Math.sqrt(view.zoom)} vectorEffect="non-scaling-stroke" />}
          </g>
        })}
      </g>
    </svg>
    {!decorative && <>
      <div className="map-controls">
        <button className="icon-button" aria-label="Zoom in" onClick={() => zoom(1.5)}><Plus size={18} /></button>
        <button className="icon-button" aria-label="Zoom out" onClick={() => zoom(1 / 1.5)}><Minus size={18} /></button>
        <button className="icon-button" aria-label="Reset map" onClick={() => setView({ zoom: 1, x: 0, y: 0 })}><RotateCcw size={16} /></button>
      </div>
      {hover && <div className="map-tooltip">{hovered?.flag} {hovered?.name ?? hover.name}{metricId && hovered ? ` · ${format(hovered.values[metricId], metric)}` : ''}</div>}
      {metric && <div className="map-legend">
        <strong>{metric.label}{metric.unit ? ` · ${metric.unit}` : ''}</strong>
        {numbers.length > 0 ? <><div className={metric.diverging ? 'legend-scale diverging' : 'legend-scale'} /><div className="legend-values">
          <span>{format({ value: metric.diverging ? -extent : min }, metric)}</span>
          {metric.diverging && <span>0</span>}
          <span>{format({ value: metric.diverging ? extent : max }, metric)}</span>
        </div></> : <span>No observations in this selection</span>}
        <span className="legend-missing"><i /> Missing data</span>
      </div>}
      <a className="map-credit" href="https://www.naturalearthdata.com/" target="_blank" rel="noreferrer">Natural Earth</a>
    </>}
  </div>
}

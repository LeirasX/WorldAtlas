import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { geoArea, geoDistance, geoGraticule10, geoNaturalEarth1, geoOrthographic, geoPath, type GeoPermissibleObjects } from 'd3-geo'
import { Globe2, Map as MapIcon, Minus, Plus, RotateCcw } from 'lucide-react'
import { format, type Country, type Metric } from './data.ts'

type Point = [number, number]
type Shape = { id: string; name: string; point: Point; polygons: Point[][][] }
type Outline = { id: string; name: string; x: number; y: number; path: string; marker: boolean; geometry: GeoPermissibleObjects; point: Point }
const width = 960
const height = 480
const flatProjection = geoNaturalEarth1().scale(170).translate([width / 2, height / 2 + 6])
const project = (point: Point): Point => flatProjection(point) as Point
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
    let coordinates = shape.polygons
    let geometry: GeoPermissibleObjects = { type: 'MultiPolygon', coordinates }
    // D3 uses clockwise outer rings. Normalize RFC 7946 rings for spherical clipping.
    if (geoArea(geometry) > 2 * Math.PI) {
      coordinates = coordinates.map(polygon => polygon.map(ring => [...ring].reverse()))
      geometry = { type: 'MultiPolygon', coordinates }
    }
    const path = geoPath(flatProjection)(geometry) ?? ''
    return { id: shape.id, name: shape.name, x, y, path, marker: area < 1.2, geometry, point: shape.point }
  })).catch((error: unknown) => { outlines = undefined; throw error })
}

type Props = {
  countries: Country[]; visible?: Set<string>; metricId?: string; metric?: Metric
  onSelect?: (country: Country) => void; decorative?: boolean; focus?: string
}

export default function AtlasMap({ countries, visible, metricId, metric, onSelect, decorative, focus }: Props) {
  const [shapes, setShapes] = useState<Outline[]>([])
  const [globe, setGlobe] = useState(false)
  const [rotation, setRotation] = useState<[number, number]>([-10, -18])
  const [error, setError] = useState(false)
  const [hover, setHover] = useState<Outline>()
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 })
  const svg = useRef<SVGSVGElement>(null)
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null)
  const suppressClick = useRef(false)
  useEffect(() => { let active = true; getOutlines().then(data => { if (active) setShapes(data) }).catch(() => { if (active) setError(true) }); return () => { active = false } }, [])
  useEffect(() => {
    const shape = shapes.find(item => item.id === focus)
    if (shape) {
      setRotation([-shape.point[0], -shape.point[1]])
      setView(globe ? { zoom: 1.6, x: 0, y: 0 } : { zoom: 3, x: width / 2 - shape.x * 3, y: height / 2 - shape.y * 3 })
    }
  }, [focus, shapes, globe])
  const projection = useMemo(() => geoOrthographic().scale(222 * view.zoom).translate([width / 2, height / 2])
    .rotate([rotation[0], rotation[1], 0]).clipExtent([[0, 0], [width, height]]), [view.zoom, rotation])
  const globePaths = useMemo(() => globe ? new Map(shapes.map(shape => [shape.id, geoPath(projection)(shape.geometry) ?? ''])) : new Map<string, string>(), [globe, projection, shapes])
  const pointers = useRef(new Map<number, Point>())
  const pinch = useRef<number | null>(null)
  useEffect(() => {
    const element = svg.current
    if (!element || decorative) return
    const wheel = (event: WheelEvent) => { event.preventDefault(); zoom(Math.exp(-event.deltaY * .0015)) }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => element.removeEventListener('wheel', wheel)
  }, [decorative])
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
    if (event.button !== 0) return
    pointers.current.set(event.pointerId, [event.clientX, event.clientY])
    if (pointers.current.size === 2) {
      const [first, second] = [...pointers.current.values()]
      pinch.current = Math.hypot(first[0] - second[0], first[1] - second[1])
      suppressClick.current = true
      return
    }
    if (drag.current) return
    suppressClick.current = false
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false }
  }
  function pointerMove(event: PointerEvent<SVGSVGElement>) {
    if (pointers.current.has(event.pointerId)) pointers.current.set(event.pointerId, [event.clientX, event.clientY])
    if (pointers.current.size === 2) {
      const [first, second] = [...pointers.current.values()]
      const distance = Math.hypot(first[0] - second[0], first[1] - second[1])
      if (pinch.current && distance > 0) zoom(distance / pinch.current)
      pinch.current = distance
      return
    }
    const pointer = drag.current
    if (!pointer || pointer.id !== event.pointerId) return
    const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y
    if (!pointer.moved && Math.hypot(dx, dy) < 5) return
    if (!pointer.moved) event.currentTarget.setPointerCapture(pointer.id)
    pointer.moved = suppressClick.current = true
    pointer.x = event.clientX
    pointer.y = event.clientY
    const scale = svg.current?.getScreenCTM()?.a || 1
    if (globe) {
      setRotation(previous => [previous[0] + dx * .24 / view.zoom, Math.min(85, Math.max(-85, previous[1] - dy * .24 / view.zoom))])
      return
    }
    setView(previous => ({
      ...previous, x: Math.min(width * .8, Math.max(width * .2 - width * previous.zoom, previous.x + dx / scale)),
      y: Math.min(height * .8, Math.max(height * .2 - height * previous.zoom, previous.y + dy / scale)),
    }))
  }
  function pointerEnd(event: PointerEvent<SVGSVGElement>) {
    pointers.current.delete(event.pointerId)
    drag.current = null
    pinch.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  function open(shape: Outline) {
    const country = byId.get(shape.id)
    if (country) onSelect?.(country)
  }
  const hovered = hover && byId.get(hover.id)
  return <div className={decorative ? 'atlas-map atlas-art' : 'atlas-map'}>
    {error && !decorative && <p role="alert" className="map-message">The bundled map could not be loaded. Reload to try again.</p>}
    <svg ref={svg} viewBox={globe ? '240 0 480 480' : `0 0 ${width} ${height}`} aria-hidden={decorative || undefined} aria-label={decorative ? undefined : 'World map'}
      onPointerDown={decorative ? undefined : pointerDown} onPointerMove={decorative ? undefined : pointerMove}
      onPointerUp={pointerEnd} onPointerCancel={pointerEnd}
      onPointerLeave={() => { if (!drag.current?.moved) drag.current = null; setHover(undefined) }}>
      <path className="map-sphere" d={geoPath(globe ? projection : flatProjection)({ type: 'Sphere' }) ?? ''} />
      <path className="graticule" transform={globe ? undefined : `translate(${view.x} ${view.y}) scale(${view.zoom})`} aria-hidden="true" d={geoPath(globe ? projection : flatProjection)(geoGraticule10()) ?? ''} />
      <g transform={globe ? undefined : `translate(${view.x} ${view.y}) scale(${view.zoom})`}>
        {shapes.map(shape => {
          const country = byId.get(shape.id)
          const path = globe ? globePaths.get(shape.id) ?? '' : shape.path
          const position = globe ? projection(shape.point) : [shape.x, shape.y]
          const front = !globe || geoDistance([-rotation[0], -rotation[1]], shape.point) < Math.PI / 2
          if (globe && !path && !front) return null
          const interactive = !decorative && Boolean(country)
          return <g key={shape.id} className={interactive ? `map-country${shape.id === focus ? ' focused' : ''}` : ''}
            role={interactive ? 'button' : undefined} tabIndex={interactive ? 0 : undefined} aria-label={interactive ? country?.name : undefined}
            onPointerEnter={decorative ? undefined : () => setHover(shape)} onPointerLeave={() => setHover(undefined)}
            onFocus={() => setHover(shape)} onBlur={() => setHover(undefined)}
            onClick={interactive ? () => { if (!suppressClick.current) open(shape) } : undefined}
            onKeyDown={interactive ? event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); open(shape) } } : undefined}
            fill={getFill(country)}>
            <path d={path} fillRule="evenodd" vectorEffect="non-scaling-stroke" />
            {shape.marker && country && front && position && <circle cx={position[0]} cy={position[1]} r={3.5 / Math.sqrt(view.zoom)} vectorEffect="non-scaling-stroke" />}
          </g>
        })}
      </g>
      {!decorative && <g className="geographic-labels" aria-hidden="true" pointerEvents="none" transform={globe ? undefined : `translate(${view.x} ${view.y}) scale(${view.zoom})`}>{shapes.filter(shape => ['CAN', 'USA', 'BRA', 'RUS', 'CHN', 'IND', 'AUS', 'ZAF', 'DZA'].includes(shape.id)).map(shape => {
        if (globe && geoDistance([-rotation[0], -rotation[1]], shape.point) >= Math.PI / 2.3) return null
        const point = globe ? projection(shape.point) : [shape.x, shape.y]
        return point ? <text key={shape.id} x={point[0]} y={point[1]} textAnchor="middle" fontSize={9 / (globe ? 1 : Math.sqrt(view.zoom))}>{byId.get(shape.id)?.name ?? shape.name}</text> : null
      })}</g>}
    </svg>
    {!decorative && <>
      <div className="projection-controls" aria-label="Map projection">
        <button className={!globe ? 'active' : ''} aria-pressed={!globe} onClick={() => { setGlobe(false); setView({ zoom: 1, x: 0, y: 0 }) }}><MapIcon size={15} /> Map</button>
        <button className={globe ? 'active' : ''} aria-pressed={globe} onClick={() => { setGlobe(true); setView({ zoom: 1, x: 0, y: 0 }) }}><Globe2 size={15} /> Globe</button>
      </div>
      <div className="map-controls">
        <button className="icon-button" aria-label="Zoom in" onClick={() => zoom(1.5)}><Plus size={18} /></button>
        <button className="icon-button" aria-label="Zoom out" onClick={() => zoom(1 / 1.5)}><Minus size={18} /></button>
        <button className="icon-button" aria-label="Reset map" onClick={() => { setView({ zoom: 1, x: 0, y: 0 }); setRotation([-10, -18]) }}><RotateCcw size={16} /></button>
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

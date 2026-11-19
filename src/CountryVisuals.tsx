import { statistics, format, type Country, type Dataset } from './data.ts'

export default function CountryVisuals({ country, data }: { country: Country; data: Dataset }) {
  const temperature = Array.from({ length: 12 }, (_, index) => country.values[`r2_climate_temp_c_${String(index + 1).padStart(2, '0')}`]?.value)
  const rain = Array.from({ length: 12 }, (_, index) => country.values[`r2_climate_precip_mm_${String(index + 1).padStart(2, '0')}`]?.value)
  const hasClimate = temperature.every(value => typeof value === 'number') && rain.every(value => typeof value === 'number')
  const indicators = ['wb_life_expectancy_years', 'wb_urban_population_pct', 'wb_internet_users_pct', 'wb_gdp_per_capita_usd'].filter(id => typeof country.values[id]?.value === 'number').slice(0, 3)
  if (!hasClimate && !indicators.length) return null
  const low = Math.min(...temperature.map(Number)), high = Math.max(...temperature.map(Number))
  const maxRain = Math.max(...rain.map(Number), 1)
  const points = temperature.map((value, index) => `${25 + index * 28},${105 - (Number(value) - low) / (high - low || 1) * 65}`).join(' ')
  return <section className="country-visuals">
    {indicators.length > 0 && <div className="panel context-chart"><h2>A little context</h2><p className="muted">Position among countries with available observations.</p>
      {indicators.map(id => {
        const item = country.values[id]
        const values = data.countries.flatMap(c => typeof c.values[id]?.value === 'number' ? [Number(c.values[id].value)] : [])
        const stats = statistics(values)!
        const percent = (Number(item.value) - stats.min) / (stats.max - stats.min || 1) * 100
        return <div className="context-indicator" key={id}>
          <div><span>{data.metrics[id].label.replace(' · WDI', '')}</span><strong>{format(item, data.metrics[id])}</strong></div>
          <div className="context-range"><i style={{ left: `${percent}%` }} /><b style={{ left: `${(stats.median - stats.min) / (stats.max - stats.min || 1) * 100}%` }} /></div>
          <small>{item.year} · country median {format({ value: stats.median }, data.metrics[id])} · {stats.count} observations</small>
        </div>
      })}<small className="muted">The marker is this country. The small line is the median. Years and methods may differ.</small></div>}
    {hasClimate && <div className="panel climate-chart"><div className="section-title"><h2>A year in climate</h2><span>1991–2020 normals</span></div>
      <p className="muted">National land-area averages · CRU TS 4.07</p>
      <svg viewBox="0 0 370 165" role="img" aria-label={`Monthly temperature and rainfall normals in ${country.name}`}>
        {rain.map((value, index) => <g key={index}><rect x={16 + index * 28} y={133 - Number(value) / maxRain * 65} width={18} height={Number(value) / maxRain * 65} rx={3} fill="var(--chart-rain)" />
          <text x={25 + index * 28} y={153} textAnchor="middle">{'JFMAMJJASOND'[index]}</text><title>{new Date(2000, index).toLocaleString('en', { month: 'long' })} · {temperature[index]} °C · {value} mm</title></g>)}
        <polyline points={points} fill="none" stroke="var(--chart-temp)" strokeWidth={2.5} strokeLinejoin="round" />
        {temperature.map((value, index) => <circle key={index} cx={25 + index * 28} cy={105 - (Number(value) - low) / (high - low || 1) * 65} r={3} fill="var(--chart-temp)"><title>{value} °C</title></circle>)}
      </svg>
      <div className="climate-key"><span><i /> Temperature {low.toFixed(1)}–{high.toFixed(1)} °C</span><span><i /> Rainfall 0–{maxRain.toFixed(0)} mm/month</span></div>
      <small className="muted">Separate scales. Coarse country averages can hide local variation. Source details are in the monthly climate metrics.</small>
    </div>}
  </section>
}

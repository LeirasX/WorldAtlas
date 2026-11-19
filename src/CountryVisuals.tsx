import { climateSeries } from './presentation.ts'
import { format, type Country, type Dataset } from './data.ts'

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export default function CountryVisuals({ country, data, inspect }: { country: Country; data: Dataset; inspect: (id: string) => void }) {
  const series = climateSeries(country)
  if (!series) return null
  const temperatures = series.months.map(month => Number(month.temperature.value))
  const rain = series.months.map(month => Number(month.rain.value))
  const low = Math.min(...temperatures), high = Math.max(...temperatures)
  const floor = Math.floor(Math.min(0, low) / 5) * 5
  const ceiling = Math.max(floor + 5, Math.ceil(high / 5) * 5)
  const rainMax = Math.max(50, Math.ceil(Math.max(...rain) / 50) * 50)
  const yTemperature = (value: number) => 130 - (value - floor) / (ceiling - floor) * 104
  const yRain = (value: number) => 130 - value / rainMax * 104
  const x = (index: number) => 47 + index * 28
  return <section className="glance-climate panel" aria-label="Annual climate">
    <div className="section-title"><h2>Climate</h2><small>{series.period}</small></div>
    <svg viewBox="0 0 410 164" role="img" aria-label={`Monthly temperature and rainfall normals in ${country.name}`}>
      <text x="10" y="13" className="temperature-axis">°C</text><text x="380" y="13" className="rain-axis">mm</text>
      {[0, .5, 1].map(tick => <g key={tick}><line x1="32" x2="377" y1={130 - tick * 104} y2={130 - tick * 104} className="climate-grid" /><text x="26" y={134 - tick * 104} textAnchor="end" className="temperature-axis">{floor + tick * (ceiling - floor)}</text><text x="382" y={134 - tick * 104} className="rain-axis">{Math.round(tick * rainMax)}</text></g>)}
      {series.months.map((month, index) => <g key={index}><rect x={x(index) - 8} y={yRain(rain[index])} width="16" height={130 - yRain(rain[index])} rx="2" fill="var(--chart-rain)" /><text x={x(index)} y="151" textAnchor="middle">{monthNames[index]}</text><title>{monthNames[index]}: {temperatures[index]} °C, {rain[index]} mm</title></g>)}
      <polyline points={temperatures.map((value, index) => `${x(index)},${yTemperature(value)}`).join(' ')} fill="none" stroke="var(--chart-temp)" strokeWidth="2.4" strokeLinejoin="round" />
      {temperatures.map((value, index) => <circle key={index} cx={x(index)} cy={yTemperature(value)} r="2.5" fill="var(--chart-temp)" />)}
    </svg>
    <div className="climate-key"><span><i /> Temperature {low.toFixed(1)}–{high.toFixed(1)} °C</span><span><i /> Monthly rainfall</span></div>
    <details className="monthly-data"><summary>Monthly data</summary><div className="table-scroll"><table><thead><tr><th>Month</th><th>°C</th><th>mm</th></tr></thead><tbody>{series.months.map((month, index) => {
      const suffix = String(index + 1).padStart(2, '0')
      return <tr key={index}><th>{monthNames[index]}</th>{[['temp_c', month.temperature], ['precip_mm', month.rain]].map(([kind, item]) => {
        const id = `r2_climate_${kind}_${suffix}`
        return <td key={String(kind)}><button className="text-button" aria-label={data.metrics[id]?.label} onClick={() => inspect(id)}>{format(item as typeof month.temperature, undefined, true)}</button></td>
      })}</tr>
    })}</tbody></table></div></details>
    <details className="climate-source"><summary>Source & scope</summary><p>CRU TS 4.07 · national land-area averages. Local climates can differ.</p><button className="text-button" onClick={() => inspect('r2_climate_temp_c_01')}>Temperature source</button><button className="text-button" onClick={() => inspect('r2_climate_precip_mm_01')}>Rainfall source</button></details>
  </section>
}

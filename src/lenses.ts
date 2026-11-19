import { countryMetricIds, type Dataset } from './data.ts'

export const lenses = [
  { id: 'geography', title: 'Geography', categories: ['Geography'], summary: 'Places, population and the shape of the world.' },
  { id: 'population', title: 'Population', categories: ['Geography'], metricIds: ['wb_population', 'population'], summary: 'Population estimates with their original reference years.' },
  { id: 'density', title: 'Population density', categories: ['Geography'], metricIds: ['wb_population_density_per_km2', 'density'], summary: 'People per square kilometre using the source area definition.' },
  { id: 'nature', title: 'Nature', categories: ['Nature'], summary: 'Available country-level environmental measures, not regional boundaries.' },
  { id: 'economy', title: 'Economy', categories: ['Economy', 'Housing'], summary: 'Output, income and housing, with each definition kept distinct.' },
  { id: 'politics', title: 'Politics', categories: ['Politics', 'Law'], summary: 'Available political and legal evidence. Historical benchmarks retain their dates.' },
  { id: 'history', title: 'History', categories: ['History'], summary: 'Explore historical content when sourced records are available. Current borders do not represent historical borders.' },
  { id: 'climate', title: 'Climate & Nature', categories: ['Climate', 'Nature'], summary: 'Long-term climate patterns and environmental conditions.' },
  { id: 'health', title: 'Health', categories: ['Health'], summary: 'Population health and available health-system indicators.' },
  { id: 'society', title: 'Society & Culture', categories: ['Society', 'Language', 'Education', 'Culture', 'Religion'], summary: 'Population, education and the available evidence about society.' },
  { id: 'work', title: 'Work & Business', categories: ['Work', 'Business'], summary: 'Earnings, working time and employment. Models and legal benchmarks remain distinct.' },
] as const
export type Lens = typeof lenses[number]
export function lensMetrics(data: Dataset, lens: Lens) {
  const used = new Set(data.countries.flatMap(countryMetricIds))
  return Object.entries(data.metrics).filter(([id, metric]) => used.has(id) && ('metricIds' in lens ? (lens.metricIds as readonly string[]).includes(id) : (lens.categories as readonly string[]).includes(metric.category))).sort(([a], [b]) => 'metricIds' in lens ? (lens.metricIds as readonly string[]).indexOf(a) - (lens.metricIds as readonly string[]).indexOf(b) : 0)
}

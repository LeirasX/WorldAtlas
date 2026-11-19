import { countryObservations, type Dataset, type Observation } from './data.ts'

/** Lossless view over the original CSV observations; never infers salary dimensions. */
export type StatisticalRecord = {
  id: string; metricId: string; countryId: string; primary: boolean; observation: Observation
  dimensions: {
    referencePeriod?: string; currency?: string; geographicScope?: string; sourceLocation?: string
    occupationId?: string; seniority?: string; statistic?: 'mean' | 'median'; compensation?: 'gross' | 'net' | 'modeled'
  }
}
export function metricObservations(data: Dataset, metricId: string): StatisticalRecord[] {
  return data.countries.flatMap(country => countryObservations(country, metricId).map((observation, position) => ({
    id: observation.observationId ?? JSON.stringify([country.id, metricId, observation.year ?? '', observation.scope ?? '', observation.sourceLocation ?? '', position]),
    metricId, countryId: country.id, primary: observation === country.values[metricId], observation,
    dimensions: { referencePeriod: observation.year, currency: observation.currency, geographicScope: observation.scope ?? observation.basis, sourceLocation: observation.sourceLocation },
  })))
}

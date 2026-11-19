import type { KnowledgePack } from './knowledge.ts'

const inflation = 'https://www.ecb.europa.eu/ecb-and-you/explainers/tell-me-more/html/what_is_inflation.en.html'
const rates = 'https://www.ecb.europa.eu/ecb-and-you/explainers/html/interest-rates-changes.en.html'
const gdp = 'https://databank.worldbank.org/metadataglossary/sustainable-development-goals-(sdgs)/series/NY.GDP.PCAP.KD'
const source = (label: string, url: string) => ({ label, url, lastVerified: '2026-11-19', reuseNotes: 'Original ORBIS summary; the linked reference remains with its publisher.' })

// Original short explanations, not copied source articles. Source-backed is not independent editorial review.
export const starterKnowledge: KnowledgePack = {
  version: 1,
  entities: [
    { id: 'concept:inflation', kind: 'concept', title: 'Inflation', aliases: ['price growth'], status: 'source-backed',
      summary: 'Inflation describes a broad rise in consumer prices. The same amount of money then buys less.',
      sources: [source('European Central Bank · What is inflation?', inflation)],
      sections: [
        { heading: 'Key ideas', body: 'A single price increase does not describe inflation across an economy. A consumer price index combines a basket of goods and services, weighted to reflect spending.', sourceUrls: [inflation] },
        { heading: 'Everyday life', body: 'Households buy different things. Their experience of changing prices can differ from the published average. Read the index, geographic scope and reference period before comparing inflation figures.', sourceUrls: [inflation] },
      ], caveats: ['An introduction to consumer price inflation, not a live inflation forecast.'] },
    { id: 'concept:purchasing_power', kind: 'concept', title: 'Purchasing power', aliases: ['buying power'], status: 'source-backed',
      summary: 'Purchasing power describes what an amount of money can buy.', sources: [source('European Central Bank · What is inflation?', inflation)],
      sections: [{ heading: 'How it works', body: 'When the prices of the things you buy rise while your money amount stays the same, you can afford less. Income figures and price changes answer different parts of the question of how people live.', sourceUrls: [inflation] }],
      caveats: ['No cross-country purchasing-power calculation is inferred from incompatible income and rent observations.'] },
    { id: 'concept:interest_rates', kind: 'concept', title: 'Interest rates', status: 'source-backed',
      summary: 'Interest is a cost of borrowing and can also be a return paid on savings.', sources: [source('European Central Bank · Interest-rate explainer, 6 June 2024', rates)],
      sections: [
        { heading: 'How it works', body: 'A loan rate expresses the interest charged for borrowing. A deposit rate describes interest paid on savings. Always distinguish these rates and their periods.', sourceUrls: [rates] },
        { heading: 'Institutions and everyday life', body: 'Central-bank policy rates influence borrowing and saving conditions. They are not the same as the rate offered to a particular household. The ECB explanation describes its June 2024 decision; it is not evidence of today’s policy rate.', sourceUrls: [rates] },
      ] },
    { id: 'concept:gdp_per_capita', kind: 'concept', title: 'GDP per capita', aliases: ['output per person'], status: 'source-backed',
      summary: 'GDP per capita divides economic output by population. It is not an individual salary.', sources: [source('World Bank · GDP per capita metadata', gdp)],
      sections: [
        { heading: 'Key ideas', body: 'Gross domestic product measures production in an economy. Dividing it by population produces an average output-per-person measure, rather than the income of a typical worker.', sourceUrls: [gdp] },
        { heading: 'Reading the data', body: 'The linked World Bank series uses constant 2015 US dollars. A constant-price series and a current-price series have different price bases. Preserve the indicator definition and unit when comparing observations.', sourceUrls: [gdp] },
      ], caveats: ['The linked definition does not convert the application’s other GDP series to a different price base.'] },
  ],
  relationships: [
    { from: 'concept:inflation', to: 'concept:purchasing_power', label: 'explores prices and buying power', evidence: 'factual', sourceUrls: [inflation] },
    { from: 'concept:inflation', to: 'concept:interest_rates', label: 'is discussed alongside interest rates', evidence: 'factual', sourceUrls: [rates] },
  ],
}

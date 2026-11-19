# Content imports

Open **Data & sources**, expand **Import research articles and relationships**, and choose a UTF-8 JSON file. Version 1 packs contain three fields.

```json
{
  "version": 1,
  "entities": [
    {
      "id": "topic:gdp-per-capita-introduction",
      "kind": "topic",
      "title": "Understanding GDP per capita",
      "summary": "Economic output per person gives one perspective on an economy.",
      "body": "GDP per capita divides gross domestic product by population. The source definition explains its currency and measurement basis.",
      "sources": [
        {
          "label": "World Bank indicator definition",
          "url": "https://data.worldbank.org/indicator/NY.GDP.PCAP.CD"
        }
      ]
    }
  ],
  "relationships": [
    {
      "from": "topic:gdp-per-capita-introduction",
      "to": "country:PRT",
      "label": "can be explored using data for"
    }
  ]
}
```

Entity kinds are country, city, region, topic, institution and event. Country identities and metric associations are generated from the country registry, so packs add editorial content and relationships while leaving that registry authoritative. To attach a city or event to a country, use a relationship to its existing stable country ID.

IDs must be unique across built-in and imported knowledge. Relationship endpoints must exist after importing the complete pack. Validation rejects the entire pack on an invalid record, unsafe source URL, duplicate entity or unresolved endpoint. Imported content persists on this device when storage is available and can be removed through the same data panel.

Each imported entity requires an ID, kind, title, summary and at least one named HTTP/HTTPS source. Optional entity fields include Markdown body and a date. Source references also support publicationDate, lastVerified, license and reuseNotes. These fields retain supplied metadata and do not imply independent verification or redistribution approval.

Markdown raw HTML and images are disabled. Outbound source links open only when selected. Packs support narrative content and relationships. The six validated continent CSVs and metric registry continue to handle statistical observations and their provenance.

The current interface resolves country IDs such as country:PRT, topic IDs such as topic:geography, and derived source-geography IDs. Imported relationships appear in **Keep exploring** and imported titles are included in global search. Inspect the TypeScript model in src/knowledge.ts when preparing larger content batches.

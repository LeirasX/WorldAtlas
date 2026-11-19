# WorldAtlas product foundation

## Specification and scope

This phase follows the complete world-knowledge-platform vision supplied in November 2026 and the eight implementation priorities in the redesign request. WorldAtlas remains the working product name. The first increment connects existing places, statistical topics and source institutions without trying to populate every domain in the long-term vision.

The primary audience is a curious reader who wants to understand a place or concept, inspect the evidence and follow related subjects. Numerical precision, source context and geographic scope remain visible throughout this experience.

## Existing application audit

The application uses React, TypeScript, CSS and Vite, with Tauri 2 wrapping the same frontend. There is no backend or database server. Six continent CSVs provide the stable 195-country registry and current national observations. A metric registry controls definitions, types, units, categories and safe analytical operations. Native commands read the six authorized files, with polling and last-valid-snapshot retention. The public build chooses approved public CSVs at compile time.

Working foundations include country and alias search, profiles, numerical filters, statistics, sorting, selectable/reorderable columns, saved views, CSV export, comparisons, a locally bundled map, themes, manual imports, folder updates and offline caching. The earlier country-only interface largely presented cards and tables, with a custom map projection and limited paths from one subject to another.

All four research releases have been inspected and preserved. The integration retains 12,789 research observations, including 80 geographically scoped records. Eleven unresolved multi-city 2019 legal cases remain withheld. Original financial estimates retain their unverified status. Canadian metropolitan composites, local rent observations, employee medians and OECD tax scenarios have distinct meanings.

The private data chunk is large because every observation carries provenance. Source duplication in the CSV representation is a known optimization opportunity. Browser localStorage can reject large manually imported datasets, in which case the current import code explicitly reports session-only availability. Native file polling is a practical implementation for six files and is not cross-device synchronization.

No screenshot was attached to the accessible vision file. Browser rendering is checked directly during implementation.

## Architecture

The existing data engine remains the statistical source of truth. Country identities, metric definitions and imported observations keep their established representations.

A separate knowledge model adds typed entities and labelled relationships. Its initial kinds are country, city, region, topic, institution and event. Current content derives from the data already present on the device. Topic pages use the metric definitions, country coverage, source references and short introductory explanations. City and region entities preserve the source geography and country relationship. Named data providers form source-institution entities. The event kind is available to sourced content imports, with no fabricated historical events seeded.

Relationships connect countries to topics and data providers, source geographies to countries and topics, and imported content to existing or other imported entities. Stable IDs and endpoint validation make these links deterministic. This is an in-memory graph over plain data rather than a graph database.

Version 1 JSON knowledge packs support sourced summaries, Markdown articles and relationships. Validation rejects duplicate IDs, invalid entity kinds, unsafe source URLs and missing relationship endpoints. Imports are transactional in memory and saved locally when browser storage permits. Markdown raw HTML and remote images are disabled. Original country identities and metric associations remain controlled by the validated country dataset.

Global search combines deterministic country matching with knowledge titles and summaries. Countries retain alias, accent-insensitive and typo-tolerant matching. Only available content appears in navigation and search.

## Information architecture

Five primary destinations keep the existing workflows accessible.

- Discover introduces the map, available topics, countries and continent exploration.
- Explore retains the precise data workspace, comparison selection and statistical tools.
- Map provides geographic exploration and thematic coloring.
- Topics starts with a short explanation, then exposes definitions, distributions, observations and original sources.
- Countries provides the full country directory and profiles.

Source-institution and city/region pages open contextually from search and related subjects. Data and sources remains a utility surface for provenance, local dataset imports and content imports. Events and timelines should receive navigation only when sourced content and useful interactions exist.

## Visual system and core screens

Use system typography, a cool neutral canvas, restrained blue accents, hairline borders, rounded surfaces and quiet shadows. Sidebar and toolbar materials distinguish navigation from the reading surface. All interactive elements have text or accessible labels, visible focus and a real destination. Dark mode and reduced motion remain supported.

Discover uses a geographic hero and introductory topic cards. Compact facts and continent navigation support orientation without dominating the page.

Country profiles add real monthly climate normals and country-position visualizations above the existing metric sections. Climate temperature and rainfall have labelled independent scales and the 1991–2020 reference period. Comparative positions identify sample sizes and the country-level median. They do not imply population-weighted averages or common reference years.

Topic pages introduce a subject in plain language, expose the source definition and show available observations. Deeper sections disclose units, caveats, dates and source links. Relationship links lead back to countries and related subjects.

The analytical table and comparison details retain their precision. Local observations have location/period details and are excluded from national averages and choropleths.

## Mapping decision

D3 geographic projections were selected for this first increment because the application already bundles country polygons and needs offline country-scale rendering. Natural Earth projection and spherical clipping replace the custom projection. An orthographic globe provides an alternative view. Wheel/pinch zoom, pan/rotation, focus, tiny-country markers, thematic legends and keyboard-accessible country selection use the same map data.

MapLibre GL is a credible later choice for detailed vector tiles, street-level navigation and larger geographic datasets. It adds tile preparation, GPU/WebView requirements and more offline asset-management work. Cesium is more appropriate for detailed three-dimensional terrain and globe-scale geospatial scenes, with a larger runtime and content pipeline. Neither is required by the current country-boundary dataset.

Country map labels come from source labels and selection tooltips. City records currently lack validated coordinates, so this increment does not invent map positions. Natural Earth de facto boundaries and the original continent classifications remain explicit.

Official references:
- https://d3js.org/d3-geo/projection
- https://d3js.org/d3-geo/path
- https://www.naturalearthdata.com/about/terms-of-use/

## Content growth and verification

Begin with existing source definitions and researched places. Next editorial gaps include coherent introductory articles on inflation, taxation, healthcare organization and employment benchmarks. Each should distinguish concepts, dated observations, modeled scenarios and interpretations.

Historical events need editorial sources, dates, relationships and geographic evidence before timeline seeding. City mapping needs validated coordinates and geographic IDs. Political officeholders, current law and travel rules require frequent verification. Slowly changing concepts and historical evidence require a separate review cadence.

Future packs should include publication/reference periods, last verification dates, geographic scope and licensing/reuse restrictions. Unknown licensing remains unknown and never implies redistribution permission. Statistical imports and editorial packs have separate validation paths while sharing provenance principles.

## Roadmap and acceptance criteria

1. Preserve and verify the four-release statistical foundation. All existing cells and source archives must survive, repeat imports must be idempotent, and conflicts must remain reviewable.
2. Introduce typed entities, relationships and content-pack validation. Tests must demonstrate valid links, transactional rejection and preserved country identities.
3. Implement the connected discovery slice. Search must reach a country, topic and researched source geography. Topic explanations, original evidence and related links must work.
4. Improve map projections and interactions. Flat/globe views, country selection, focus, thematic layers, mouse/touch controls and offline assets must pass browser checks.
5. Verify desktop and phone layouts, data workflows, imports, offline access and native builds.
6. Develop researched naming proposals and domain/conflict checks as a separate branding phase. Permanent renaming requires the user's decision.
7. Expand sourced editorial coverage, richer source metadata and historical timelines incrementally. Add detailed city maps only when geography and offline assets support them.

Publication and repository visibility are outside this local implementation phase.

## Verified first-increment result

Implemented the connected discovery slice, entity/content importer, country visualizations and flat/globe interaction within the existing React application. Verified with 17 TypeScript tests, six Python importer tests, 14 local-data and six public-build desktop/mobile browser checks. Public subpath/offline behavior passed. Private, Pages and macOS builds passed, with strict signature verification for the ad-hoc-signed app. Desktop and phone screenshots were inspected during implementation.

The public dataset remains unchanged. No repository or deployment settings changed. Main-bundle size and the large complete local data chunk still trigger Vite warnings. Windows/iOS signing and builds remain platform work. Historical-event content, validated city coordinates, broader introductory articles and researched branding proposals remain future increments.

## ORBIS increment, 2026-11-19

The user selected ORBIS as the new product name. The home is now the interactive map, with eight lenses and an on-map contextual country panel. Three primary modes retain the previous data table, filters, statistics, comparisons, source details, country directory and full-map controls. Existing route URLs, native identifier and local storage remain compatible.

The entity model now supports concepts, organizations, occupations, indicators, articles, laws, generic locations and sources. Structured sections cite named sources and carry editorial status; interpreted/causal links require evidence URLs. These are validation checks, not a truth-verification engine. Four short, original introductions use official ECB and World Bank explanations. Broader content remains a research/editorial gap.

The observation adapter is a lossless view over primary/historical CSV data, not a destructive migration. Occupation and compensation dimensions are explicit optional fields, never guessed. Current country-primary selection semantics remain stable; automatic latest-compatible selection and richer dimension filters need further work.

Verification: 21 unit/data/model tests, six Python importer tests, ten public and fourteen local desktop/mobile browser checks passed. Pages/private/native production builds passed. The macOS ORBIS app is ad-hoc signed, not notarized; Windows and iOS were not built here. Bundle-size warnings remain. Private research and original materials stay outside Git and the public build. Existing 195-country registry, all four local research releases and provenance remain preserved.

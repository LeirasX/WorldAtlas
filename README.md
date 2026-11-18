# WorldAtlas

WorldAtlas is an offline country atlas for 195 countries. Use **World** to browse continents, **Explore** to filter and analyze rows, **Map** to color countries by metric, and **Countries** to open profiles and inspect sources. Press **⌘K** on macOS or **Ctrl+K** on Windows to search.

The same React, TypeScript, CSS, and Vite frontend runs as a static website and in Tauri 2. It reads bundled data directly and needs no backend or account.

## Run locally

Install Node.js 22 or newer. From this folder, run:

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. This uses `Data/local/` if the six local CSVs are present, or the public snapshot otherwise. Change a local CSV and the development page reloads. Restart Vite after adding or renaming a file.

```sh
npm test
npx playwright install chromium
npm run test:browser
```

The browser tests serve the production build under `/WorldAtlas/` and cover desktop and emulated phone layouts. They also reload the site offline and open the map.

## Data and source files

| Location | Contents |
| --- | --- |
| `Context/` | Local copies of the original CSVs, source records, dashboards, and Markdown. Ignored by Git. |
| `Data/local/` | Normalized private snapshots, including the supplied earnings, living-cost estimates, and provenance. Ignored by Git. |
| `Data/public/` | Public 195-country registry, population estimates with reference years, and income groups. |
| `Data/metrics.json` | Labels, categories, types, units, and aggregation rules. |
| `public/world-map.json` | Simplified Natural Earth shapes and label coordinates for offline mapping. |

To regenerate the private CSVs from the preserved inputs, run `python3 scripts/prepare-data.py`. This replaces the six generated local CSVs. Make ongoing edits in `Data/local/` and save a copy before regenerating. The six filenames are `africa.csv`, `asia.csv`, `europe.csv`, `north_america.csv`, `south_america.csv`, and `oceania.csv`.

Add a column to one or more CSVs to make it available in Explore and country profiles. Use a stable key such as `temperature` and add a corresponding registry entry to set its label, category, type, and unit. Unknown columns are shown with metadata review pending. Use companion fields such as `temperature__source`, `temperature__year`, `temperature__confidence`, and `temperature__notes` to retain provenance. A `~` prefix or `temperature__estimated=true` marks an estimate. `research__markdown` holds optional country notes. The profile renders this column as Markdown with raw HTML and remote images disabled.

Explore supports queries such as `continent:"South America" population>10M`. The local dataset also supports examples like `net>=1200 rent<650` and `rent:confidence=medium`. Use `metric:missing` or `metric:estimated` to filter by coverage. Statistics show coverage and estimate counts. Sums require `sum: true` in the registry. An explicitly enabled `weighted: true` produces a population-weighted average of country observations. Profile and comparison details distinguish original, estimated, and calculated values. The supplied table remains the display value when a source record has a different level of precision.

The app can import the six normalized CSVs together through **Data & sources**. Imports are validated before replacing the current dataset and are saved in the device’s browser or WebView storage when available. Device storage can be cleared using **Restore bundled data**. There is no cross-device sync.

## Build the website

```sh
npm run build
npm run preview
```

`npm run build` produces a public-data static site in `dist/`. `npm run build:web` targets GitHub Pages and defaults to `/WorldAtlas/`. Set `WORLDATLAS_BASE` to the intended pathname with its trailing slash when hosting under a different project path. Hash links such as `/WorldAtlas/#/countries/PRT` work on static hosting.

The HTTPS production site can be installed by browsers that support PWAs. After the service worker finishes installing, the page, country data, and map work offline. Browsers can evict cached assets, and outbound source links require connectivity. Set `WORLDATLAS_OFFLINE=0` when building for a new deployment that should omit the PWA.

`npm run build:local` writes a private preview to `dist-local/`. It embeds `Data/local/` when present. Serve it locally with `npm run preview -- --outDir dist-local`.

## Build and install native apps

Install the platform tools listed in [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) and run `npm ci`.

| Platform | Build | Install or distribute |
| --- | --- | --- |
| macOS | `npm run tauri build -- --bundles app,dmg` on a Mac | Open the app or drag it from the DMG into Applications. Sign and notarize before distributing outside your Mac. Use a universal target if sending one build to both Intel and Apple Silicon users. |
| Windows | `npm run tauri build -- --bundles nsis` on Windows | Install through the generated setup EXE. Sign the installer for distribution. Build with the MSVC Rust toolchain, C++ Build Tools, and WebView2. |
| iOS | On a Mac with full Xcode and an Apple team, run `npm run tauri ios init`, then `npm run tauri ios build -- --open` | Select the signing team and bundle identifier in Xcode. Run on a registered device, or archive and distribute through TestFlight or the App Store. |
| Web | `npm run build:web` | Serve `dist/` over HTTPS or use the Pages workflow. Open the URL in any supported browser. |

Native packages include the private dataset when it exists in the build checkout. Build from a clean clone or set `WORLDATLAS_PUBLIC=1` in the build environment for a package using only the public snapshot. Keep certificates, provisioning profiles, team credentials, and private builds local. The manual **Verify desktop packages** workflow checks the macOS bundle and Windows installer on their respective runners.

On macOS and Windows, choose your six-CSV folder once in **Data & sources → Choose data folder**. The native app remembers it and checks the six files about every 2.5 seconds. It keeps displaying the last valid dataset during an incomplete or malformed update. The app reads only the six expected regular files in that folder and requires no Terminal after installation. iOS and the website use bundled data and manual file import.

## Publish after approval

WorldAtlas is a standalone Git repository. Review the tracked files and the contents of `dist/` before publishing. The Pages build selects `Data/public/` at build time. Personal source records, research notes, and the normalized private snapshot belong under the ignored directories in the table above.

After explicit publication approval, push this repository to the chosen GitHub remote, select **GitHub Actions** under **Settings → Pages**, and manually run **Deploy WorldAtlas to GitHub Pages**. The workflow computes the Pages base path and prints the resulting URL. The URL can be opened without an account when published publicly.

## Map and public snapshot attribution

Made with [Natural Earth](https://www.naturalearthdata.com/downloads/50m-cultural-vectors/), using the public-domain 1:50m Admin 0 country features, version 5.1.2. Map boundaries follow Natural Earth’s de facto convention. Some territories appear for geographical context outside the 195-country registry. Small countries have point markers. Country profiles can be searched independently of boundary visibility.

Public population and income-group values come from the corresponding Natural Earth attributes and can have different reference years. Financial, language, climate, and society observations from the supplied research remain in the local edition. The public snapshot can be extended with data cleared for redistribution.

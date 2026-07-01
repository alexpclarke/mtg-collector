# Box Packer

[![CI](https://github.com/alexpclarke/mtg-collector/actions/workflows/ci.yml/badge.svg)](https://github.com/alexpclarke/mtg-collector/actions/workflows/ci.yml)
[![Deploy to GitHub Pages](https://github.com/alexpclarke/mtg-collector/actions/workflows/deploy.yml/badge.svg)](https://github.com/alexpclarke/mtg-collector/actions/workflows/deploy.yml)

A browser-based Vue app for packing MTG inventory CSV data into box groups, with Scryfall set metadata lookup and review reporting.

## Requirements

- Node.js 24+ (latest LTS; for tests and build scripts)
- A modern browser

## Project Layout

- `index.html` - App entry page
- `src/main.ts` - App composition and Vue template
- `src/domain/` - Pure business logic (parsing, packing, sorting, sets, language)
- `src/services/scryfall.ts` - Scryfall fetch/cache helpers
- `src/ui/settings/` - Advanced settings definitions and `useSettings` composable
- `src/ui/run-state.ts` - Run/reset failure-state helpers
- `src/ui/styles.scss` - App styles source (Sass)
- `scripts/build.js` - Scryfall data sync script (`public/data/` output)
- `tests/domain/` - Domain-level unit tests
- `tests/ui/` - UI state unit tests
- `tests/resources/` - CSV fixture resources (gitignored)

## Install

This project uses npm-managed frontend dependencies (including Carbon styles).

Install all dependencies:

```bash
npm ci
```

## Run Locally

Start the Vite dev server:

```bash
npm run dev
```

Then open the URL printed in the terminal.

## Test

Run all unit tests:

```bash
npm test
```

Current tests cover:

- Collector and review sorting behavior
- Oversized set chunking behavior
- Run output reset/failure behavior

## Build / Compile

Generate a static `dist/` output:

```bash
npm run build
```

Preview built output locally:

```bash
npm run preview
```

Clean build output:

```bash
npm run clean
```

Vite bundles and minifies all TypeScript, compiles Sass, and produces content-hashed assets in `dist/`.

### Scryfall data

Scryfall bulk data files (sets + card index) are not bundled — they live in `public/data/` and are synced separately:

```bash
npm run sync:data
```

## CI/CD

- `.github/workflows/ci.yml` runs on push to `main` and pull requests:
	- `npm ci`
	- `npm run lint`
	- `npm test`
	- `npm run build`
- `.github/workflows/deploy.yml` deploys to GitHub Pages using official Pages actions:
	- Triggered after CI completes successfully on `main`
	- Also supports manual `workflow_dispatch`
	- Uploads `dist/` as a Pages artifact and publishes with `actions/deploy-pages`

## Usage

1. Open the app.
2. Choose an inventory CSV file.
3. Set box capacity.
4. Click Run Packing.

The app will:

- Parse CSV rows
- Fetch/cache Scryfall set metadata in browser localStorage
- Attempt Scryfall ID-based resolution for review rows
- Produce packed boxes and a Needs Review list

## Notes

- Scryfall cache is stored in browser localStorage, not in repository JSON files.
- CSV files under `tests/resources/` are ignored by git.

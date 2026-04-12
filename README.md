# Box Packer

[![CI](https://github.com/alexpclarke/mtg-collector/actions/workflows/ci.yml/badge.svg)](https://github.com/alexpclarke/mtg-collector/actions/workflows/ci.yml)
[![Deploy to GitHub Pages](https://github.com/alexpclarke/mtg-collector/actions/workflows/deploy.yml/badge.svg)](https://github.com/alexpclarke/mtg-collector/actions/workflows/deploy.yml)

A browser-based Vue app for packing MTG inventory CSV data into box groups, with Scryfall set metadata lookup and review reporting.

## Requirements

- Node.js 24+ (latest LTS; for tests and build scripts)
- A modern browser

## Project Layout

- `index.html` - App entry page
- `src/main.js` - App composition and Vue template
- `src/domain/sorting.js` - Sorting helpers
- `src/domain/packing.js` - Packing/chunking helpers
- `src/services/scryfall.js` - Scryfall fetch/cache helpers
- `src/ui/run-state.js` - Run/reset failure-state helpers
- `src/ui/styles.scss` - App styles source (Sass)
- `scripts/build.js` - Static build script (`dist/` output)
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

Build and serve the dist output:

```bash
npm run dev
```

Or run in two steps:

```bash
npm run build
npm run serve
```

Then open the URL printed by `serve`.

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

Serve built output locally:

```bash
npm run serve
```

Clean build output:

```bash
npm run clean
```

- `scripts/build.js` writes a minified `dist/index.html` that references built assets.
- Sass compiles `src/ui/styles.scss` into `dist/assets/styles.min.css`.
- esbuild bundles/minifies app code into `dist/assets/app.min.js`.
- `scripts/optimize-dist.js` applies content-hashed asset filenames and rewrites `dist/index.html` references.

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

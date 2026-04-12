# Box Packer

[![CI](https://github.com/OWNER/REPO/actions/workflows/ci.yml/badge.svg)](https://github.com/OWNER/REPO/actions/workflows/ci.yml)
[![Deploy to GitHub Pages](https://github.com/OWNER/REPO/actions/workflows/deploy.yml/badge.svg)](https://github.com/OWNER/REPO/actions/workflows/deploy.yml)

A browser-based Vue app for packing MTG inventory CSV data into box groups, with Scryfall set metadata lookup and review reporting.

Replace `OWNER/REPO` in badge URLs with your GitHub repository path after first push.

## Requirements

- Node.js 20+ (for tests and build scripts)
- A modern browser

## Project Layout

- `index.html` - App entry page
- `src/main.js` - App composition and Vue template
- `src/domain/sorting.js` - Sorting helpers
- `src/domain/packing.js` - Packing/chunking helpers
- `src/services/scryfall.js` - Scryfall fetch/cache helpers
- `src/ui/run-state.js` - Run/reset failure-state helpers
- `src/ui/styles.css` - App styles
- `scripts/build.js` - Static build script (`dist/` output)
- `tests/domain/` - Domain-level unit tests
- `tests/ui/` - UI state unit tests
- `tests/resources/` - CSV fixture resources (gitignored)

## Install

This project has no runtime dependencies to install.

For tests, install dev tooling from `package.json` (if needed):

```bash
npm ci
```

## Run Locally

This is a static web app. Serve the project folder and open it in a browser.

Option 1 (Python):

```bash
python3 -m http.server 5173
```

Option 2 (Node):

```bash
npx serve .
```

Then open:

- `http://localhost:5173` (Python option)
- or the URL printed by `serve`

You can also open `index.html` directly with a `file://` URL, but a local server is recommended.

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

- `scripts/build.js` copies `index.html` and `src/` into `dist/`.

## CI/CD

- `.github/workflows/ci.yml` runs on push to `main` and pull requests:
	- `npm ci`
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

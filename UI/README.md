# Report UI

React app that loads `report.db` (from the Python pipeline) and displays the SEO report.

## Development

1. Run the Python pipeline to generate `report.db`: from repo root, `python -m src`.
2. Copy `report.db` into `public/`: `cp ../report.db public/`.
3. Start dev server: `npm run dev`. Open the app and it will fetch `/report.db`.

## Build

`npm run build` → output in `dist/`. For deployment, place `report.db` next to `index.html` (same origin) so the app can fetch it.

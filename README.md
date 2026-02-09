# Bourgogne Dreamscape

Interactive wine map experience focused on Bourgogne producers, sub-regions, grapes, and labels.

<a href="https://youtube.com/shorts/JdeRzfK_v90" target="_blank" rel="noopener noreferrer">
  <img src="https://img.youtube.com/vi/JdeRzfK_v90/maxresdefault.jpg" alt="▶️ Watch on YouTube" />
</a>

## Project Structure

- `web/`: Next.js app (UI + map experience)
- `scraping/`: data collection and enrichment pipeline

## Quick Start

```bash
cd web
npm install
npm run prepare:data
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## What You Can Explore

- Explore and Story modes
- Producer-level selection and wine lists
- Grape and price filtering
- Sub-region polygons and producer overlays

## Where To Go Next

- Frontend details: `web/README.md`
- Data pipeline details: `scraping/README.md`

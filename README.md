# Themezer Pack Scraper

A Node.js scraper for downloading Nintendo Switch theme packs from Themezer.net.

## Features

- Scrapes theme pack listings from Themezer
- Downloads theme files and preview images
- Saves metadata for each pack
- Concurrent downloads with rate limiting
- Resume support (skips already downloaded packs)

## Requirements

- Node.js (v12 or higher)
- npm packages:
  - `node-fetch`
  - `cheerio`

## Installation
```bash
npm install node-fetch cheerio
```

## Usage
```bash
node scraper.js
```

The scraper will:
1. Fetch theme packs from up to 135 pages
2. Download each pack's theme file and preview image
3. Save metadata in `info.json` for each pack
4. Generate a summary file `themezer_summary.json`

## Output Structure
```
themezer_packs/
├── Theme_Name_1/
│   ├── theme.zip
│   ├── preview.png
│   └── info.json
├── Theme_Name_2/
│   ├── theme.zip
│   ├── preview.jpg
│   └── info.json
└── ...
themezer_summary.json
```

## Configuration

Edit the `main()` function to adjust:
- `maxPages`: Number of pages to scrape (default: 135)
- `download`: Set to `false` to only fetch metadata without downloading files

## Rate Limiting

- Concurrent downloads limited to 8 simultaneous requests
- 1 second delay between page scrapes
- 10 second timeout per request

- Existing packs are automatically skipped
- Invalid characters in filenames are replaced with underscores
- Failed downloads are logged but don't stop the scraper

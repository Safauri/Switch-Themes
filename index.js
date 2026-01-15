const fetch = require("node-fetch");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

const BASE = "https://themezer.net";
const sanitize = s => s.replace(/[<>:"/\\|?*]/g, "_").replace(/\s+/g, "_").slice(0, 50);
const mkdir = p => fs.existsSync(p) || fs.mkdirSync(p, { recursive: true });

class TaskQueue {
    constructor(limit) { this.limit = limit; this.running = 0; this.queue = []; }
    add(task) {
        return new Promise((resolve, reject) => {
            this.queue.push({ task, resolve, reject });
            this.next();
        });
    }
    next() {
        if (this.running >= this.limit || !this.queue.length) return;
        this.running++;
        const { task, resolve, reject } = this.queue.shift();
        task().then(resolve).catch(reject).finally(() => { this.running--; this.next(); });
    }
}

const queue = new TaskQueue(8);

async function fastFetch(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
        const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: controller.signal });
        return res.ok ? res : null;
    } catch { return null; }
    finally { clearTimeout(timeout); }
}

async function downloadFile(url, filepath) {
    console.log(`Downloading file: ${url}`);
    const res = await fastFetch(url);
    if (!res) {
        console.log(`Failed: ${url}`);
        return false;
    }
    mkdir(path.dirname(filepath));
    fs.writeFileSync(filepath, await res.buffer());
    console.log(`Saved: ${filepath}`);
    return true;
}

async function getPackDetails(url) {
    console.log(`Fetching details: ${url}`);
    const res = await fastFetch(url);
    if (!res) return { preview: null, download: null };

    const $ = cheerio.load(await res.text());
    let preview = $('meta[property="og:image"]').attr("content") || null;
    let download = $('a[href*="/download"]').attr("href") || null;

    if (download && !download.startsWith("http"))
        download = download.startsWith("/") ? `${BASE}${download}` : `${BASE}/${download}`;

    console.log(`Details fetched: preview=${!!preview}, download=${!!download}`);
    return { preview, download };
}

async function scrapePage(page) {
    const url = page === 1 ? `${BASE}/switch/packs` : `${BASE}/switch/packs?page=${page}`;
    console.log(`\nScraping page ${page}: ${url}`);

    const res = await fastFetch(url);
    if (!res) {
        console.log(`Failed to load page ${page}`);
        return { packs: [], hasMore: false };
    }

    const $ = cheerio.load(await res.text());
    const packs = [];
    const seen = new Set();

    $('a[href*="/switch/packs/"]').each((_, el) => {
        const href = $(el).attr("href");
        if (!href) return;

        const id = href.split("/switch/packs/")[1]?.split("/")[0];
        if (!id || seen.has(id)) return;
        seen.add(id);

        const card = $(el).find(".card");
        const title = card.find(".font-bold").first().text().trim();
        if (!title) return;

        packs.push({
            id,
            title,
            author: card.find(".avatar + div").first().text().trim() || "Unknown",
            downloads: (card.find(".i-lucide-download").parent().text().match(/\d+/) || ["0"])[0],
            url: href.startsWith("http") ? href : `${BASE}${href}`,
            page
        });
    });

    console.log(`Found ${packs.length} packs on page ${page}`);

    const hasMore = $('button[page], a[href*="page="]').length > 1;
    return { packs, hasMore };
}

async function processPack(pack, download = true) {
    const dir = path.join("themezer_packs", sanitize(pack.title));
    const meta = path.join(dir, "info.json");

    if (fs.existsSync(meta)) {
        console.log(`Skipping existing: ${pack.title}`);
        try { return JSON.parse(fs.readFileSync(meta, "utf8")); }
        catch { console.log(`Corrupt metadata, reprocessing: ${pack.title}`); }
    }

    console.log(`Processing: ${pack.title}`);
    const { preview, download: dlUrl } = await getPackDetails(pack.url);
    const result = { ...pack, preview, downloadUrl: dlUrl };

    if (download && (preview || dlUrl)) {
        mkdir(dir);

        if (dlUrl) {
            const ext = path.extname(dlUrl.split("?")[0]) || ".zip";
            await downloadFile(dlUrl, path.join(dir, `theme${ext}`));
        }

        if (preview) {
            const ext = preview.includes(".png") ? ".png" :
                        preview.includes(".webp") ? ".webp" : ".jpg";
            await downloadFile(preview, path.join(dir, `preview${ext}`));
        }

        fs.writeFileSync(meta, JSON.stringify(result, null, 2));
        console.log(`Saved metadata: ${meta}`);
    }

    return result;
}

async function scrapeThemezer(maxPages, download = true) {
    console.log(`\nStarting scrape: ${maxPages} pages`);
    let page = 1;
    const allPacks = [];

    while (page <= maxPages) {
        const { packs, hasMore } = await scrapePage(page);
        if (!packs.length) break;

        const results = await Promise.all(
            packs.map(p => queue.add(() => processPack(p, download)))
        );

        allPacks.push(...results);
        if (!hasMore) break;

        page++;
        await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`\nScrape complete: ${allPacks.length} packs`);
    return allPacks;
}

async function main() {
    const start = Date.now();
    console.log("Starting Themezer scraper...");

    const packs = await scrapeThemezer(135, true); // Max Page > 135

    fs.writeFileSync("themezer_summary.json", JSON.stringify(packs, null, 2));
    console.log("Saved summary: themezer_summary.json");
    console.log(`\nFinished in ${((Date.now() - start) / 1000).toFixed(1)}s`);
}

main();
/**
 * 自动拉取 Amazon 官方 RSS，写入 amazon-news.json（首页展示用）
 * 用法: node sync-amazon-news.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(fileURLToPath(import.meta.url));
const outFile = path.join(root, "amazon-news.json");
const LIMIT = 3;
const RSS_URL = "https://www.aboutamazon.com/news/feed";
const STALE_MS = 4 * 60 * 60 * 1000;

const decodeEntities = (s) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");

const stripHtml = (s) => decodeEntities(s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());

const formatPubDate = (raw) => {
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw.slice(0, 11);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
  }).format(d);
};

function parseRssItems(xml, limit = LIMIT) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = re.exec(xml)) && items.length < limit) {
    const block = m[1];
    const pick = (tag) => {
      const r = block.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`));
      return r?.[1]?.trim() || "";
    };
    const title = stripHtml(pick("title"));
    const link = pick("link");
    const pubDate = pick("pubDate");
    const summary = stripHtml(pick("description")).slice(0, 140);
    const category = pick("category");
    if (!title || !link) continue;
    items.push({
      title,
      link,
      pubDate,
      date: formatPubDate(pubDate),
      summary,
      category,
    });
  }
  return items;
}

async function fetchRss() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(RSS_URL, {
      signal: ctrl.signal,
      headers: { "User-Agent": "ops-center/1.0 (amazon-news-sync)" },
    });
    if (!res.ok) throw new Error("RSS HTTP " + res.status);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

export async function syncAmazonNews({ force = false } = {}) {
  if (!force && fs.existsSync(outFile)) {
    const age = Date.now() - fs.statSync(outFile).mtimeMs;
    if (age < STALE_MS) {
      return JSON.parse(fs.readFileSync(outFile, "utf8"));
    }
  }

  const xml = await fetchRss();
  const items = parseRssItems(xml, LIMIT);
  if (!items.length) throw new Error("no RSS items parsed");

  const payload = {
    updatedAt: new Date().toISOString(),
    source: "aboutamazon.com/news/feed",
    sourceLabel: "Amazon 官方新闻",
    items,
  };
  fs.writeFileSync(outFile, JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  syncAmazonNews({ force: process.argv.includes("--force") })
    .then(data => {
      console.log("amazon-news ok:", data.items.length, "items,", data.updatedAt);
    })
    .catch(err => {
      console.error("amazon-news failed:", err.message);
      process.exit(1);
    });
}

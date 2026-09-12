// ジージェネエターナル 更新検知スクリプト
//
// atwiki(有志Wiki)が公式に提供している「更新情報RSS」を使い、
// 「どのページが更新されたか(タイトル・URL・日時)」だけを検知する。
// Wikiの本文(戦術・数値データ等)は個人編集者の著作物なので、
// このスクリプトは本文を一切保存・転載しない。
//
// 使い方:
//   node scripts/check-updates.mjs                  … 本番(RSSを実際に取得)
//   FIXTURE=./fixtures/sample-rss.xml node scripts/check-updates.mjs … オフラインテスト

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { generateComment } from "./lib/ai-comment.mjs";

const RSS_URL = "https://w.atwiki.jp/ggene_eternal/rss10.xml";
const DATA_DIR = path.join(process.cwd(), "data");
const SEEN_PATH = path.join(DATA_DIR, "seen.json");
const UPDATES_PATH = path.join(DATA_DIR, "updates.json");

async function loadJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function fetchRss() {
  const fixture = process.env.FIXTURE;
  if (fixture) {
    return readFile(fixture, "utf8");
  }
  const res = await fetch(RSS_URL, {
    headers: { "User-Agent": "exvs2ib-update-watcher/0.1 (personal, non-commercial)" },
  });
  if (!res.ok) throw new Error(`RSS fetch failed: ${res.status}`);
  return res.text();
}

// 依存ライブラリなしの簡易パーサ。RDF形式の <item> ブロックだけ拾う。
function parseItems(xml) {
  const items = [];
  const itemRe = /<item\b[^>]*rdf:about="([^"]+)">([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml))) {
    const [, about, body] = m;
    const title = (body.match(/<title>([\s\S]*?)<\/title>/) || [, ""])[1].trim();
    const link = (body.match(/<link>([\s\S]*?)<\/link>/) || [, about])[1].trim();
    const date = (body.match(/<dc:date>([\s\S]*?)<\/dc:date>/) || [, ""])[1].trim();
    items.push({ title, link, date });
  }
  return items;
}

// 本文は見ない。タイトルから「機体ページの更新らしさ」だけ雑に判定する。
// (雑談板・コメントログ等の議論ページはノイズとして除外する)
function looksLikeMachineOrPatchPage(title) {
  const noisy = ["雑談", "コメントログ", "議論", "掲示板", "編集練習", "テンプレート"];
  return !noisy.some((kw) => title.includes(kw));
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true });

  const xml = await fetchRss();
  const items = parseItems(xml).filter((it) => looksLikeMachineOrPatchPage(it.title));

  const seen = await loadJson(SEEN_PATH, {}); // link -> last known date
  const updates = await loadJson(UPDATES_PATH, []); // append-only log

  const newlyChanged = [];
  for (const item of items) {
    const prevDate = seen[item.link];
    if (prevDate !== item.date) {
      newlyChanged.push(item);
      seen[item.link] = item.date;
    }
  }

  if (newlyChanged.length > 0) {
    const now = new Date().toISOString();
    for (const item of newlyChanged) {
      // タイトルだけをAIに渡し、本文からの推測コメントを生成する。
      // (Wiki本文は一切渡していない。ANTHROPIC_API_KEY未設定なら定型文にフォールバック)
      const note = await generateComment({ kind: "wiki", title: item.title });
      updates.unshift({
        title: item.title,
        link: item.link,
        wikiDate: item.date,
        detectedAt: now,
        note,
      });
    }
    // 直近500件だけ保持
    updates.length = Math.min(updates.length, 500);
  }

  await writeFile(SEEN_PATH, JSON.stringify(seen, null, 2));
  await writeFile(UPDATES_PATH, JSON.stringify(updates, null, 2));

  console.log(`checked ${items.length} pages, ${newlyChanged.length} newly changed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const UPDATES_PATH = path.join(process.cwd(), "data", "updates.json");
const TWEETS_PATH = path.join(process.cwd(), "data", "tweets.json");
const VIDEOS_PATH = path.join(process.cwd(), "data", "videos.json");
const TRENDS_PATH = path.join(process.cwd(), "data", "trends.json");
const STATS_PATH = path.join(process.cwd(), "data", "history-stats.json");
const OUT_DIR = path.join(process.cwd(), "public");
const OUT_PATH = path.join(OUT_DIR, "index.html");

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  } catch {
    return iso;
  }
}

async function main() {
  const [updates, tweets, videos, trends, stats] = await Promise.all([
    readFile(UPDATES_PATH, "utf8").then(JSON.parse).catch(() => []),
    readFile(TWEETS_PATH, "utf8").then(JSON.parse).catch(() => []),
    readFile(VIDEOS_PATH, "utf8").then(JSON.parse).catch(() => []),
    readFile(TRENDS_PATH, "utf8").then(JSON.parse).catch(() => []),
    readFile(STATS_PATH, "utf8").then(JSON.parse).catch(() => null),
  ]);
  const latestTrend = trends[0];

  // Wiki更新・X投稿・YouTube動画を1本のタイムラインにまとめて日時順に並べる
  const timeline = [
    ...updates.map((u) => ({ type: "wiki", date: u.wikiDate, data: u })),
    ...tweets.map((t) => ({ type: "tweet", date: t.createdAt, data: t })),
    ...videos.map((v) => ({ type: "video", date: v.publishedAt, data: v })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  const items = timeline
    .slice(0, 100)
    .map(({ type, date, data }) => {
      if (type === "wiki") {
        return `
      <li class="card">
        <div class="meta">${formatDate(date)}・有志Wiki更新検知</div>
        <p class="ai-comment">${escapeHtml(data.note)}</p>
        <a href="${escapeHtml(data.link)}" target="_blank" rel="noopener">詳細を見る(有志Wiki) →</a>
      </li>`;
      }
      if (type === "video") {
        const url = data.url ?? "#";
        const body = data.oembedHtml
          ? data.oembedHtml
          : `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">動画を見る(YouTube) →</a>`;
        return `
      <li class="card">
        <div class="meta">${formatDate(date)}・${escapeHtml(data.channelTitle ?? "")}さんの動画</div>
        ${data.comment ? `<p class="ai-comment">${escapeHtml(data.comment)}</p>` : ""}
        ${body}
      </li>`;
      }
      // type === "tweet"
      const body = data.oembedHtml
        ? data.oembedHtml
        : `<a href="${escapeHtml(data.url)}" target="_blank" rel="noopener">投稿を見る(X) →</a>`;
      return `
      <li class="card">
        <div class="meta">${formatDate(date)}・公式X投稿</div>
        ${data.comment ? `<p class="ai-comment">${escapeHtml(data.comment)}</p>` : ""}
        ${body}
      </li>`;
    })
    .join("\n");

  const trendCard = latestTrend
    ? `
  <div class="trend-card">
    <div class="trend-label">今週の傾向(${latestTrend.weekKey}週・実データ集計)</div>
    <p>${escapeHtml(latestTrend.summary)}</p>
    <div class="trend-meta">検知動画数: ${latestTrend.videoCount}本 / 投稿チャンネル数: ${latestTrend.channelCount} / 上位: ${escapeHtml(latestTrend.topChannels.join("、"))}</div>
  </div>`
    : "";

  const statsCard = (() => {
    if (!stats) return "";
    const maxCount = Math.max(1, ...stats.weeklyVideoCounts);
    const bars = stats.weeklyVideoCounts
      .map((c) => `<div class="bar" style="height:${Math.round((c / maxCount) * 100)}%" title="${c}本"></div>`)
      .join("");
    const wikiLine = stats.wikiUpdateInterval
      ? `Wiki更新の平均間隔: 約${stats.wikiUpdateInterval.averageDays}日(中央値${stats.wikiUpdateInterval.medianDays}日・${stats.wikiUpdateInterval.sampleSize}件のデータから算出)`
      : `Wiki更新の間隔統計: まだ集計に十分なデータがありません(蓄積中)`;
    const gachaLine = stats.gachaUpdateInterval
      ? `ガシャ関連更新の平均間隔: 約${stats.gachaUpdateInterval.averageDays}日(${stats.gachaUpdateInterval.sampleSize}件のデータから算出)`
      : `ガシャ関連更新の間隔統計: まだ集計に十分なデータがありません(蓄積中)`;
    return `
  <div class="stats-card">
    <div class="trend-label">蓄積データからの統計(AI不使用・実数のみ)</div>
    <div class="stats-line">${wikiLine}</div>
    <div class="stats-line">${gachaLine}</div>
    <div class="stats-line">追跡中: Wiki更新 ${stats.totalWikiUpdatesTracked}件 / 動画 ${stats.totalVideosTracked}件</div>
    <div class="sparkline" title="直近8週間の動画検知数(週ごと)">${bars}</div>
  </div>`;
  })();

  const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>ジージェネエターナル 更新チェッカー(非公式・個人プロジェクト)</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", sans-serif; max-width: 720px; margin: 0 auto; padding: 24px; background: #0f1115; color: #eee; }
  h1 { font-size: 1.3rem; }
  .disclaimer { font-size: 0.8rem; color: #999; border-left: 3px solid #555; padding-left: 10px; margin-bottom: 24px; }
  ul { list-style: none; padding: 0; }
  .card { background: #1b1e26; border-radius: 10px; padding: 14px 16px; margin-bottom: 12px; }
  .meta { font-size: 0.75rem; color: #8ab4f8; margin-bottom: 6px; }
  .ai-comment { font-size: 0.85rem; color: #cbd5e1; background: #262b36; border-radius: 6px; padding: 8px 10px; margin: 6px 0; }
  .trend-card { background: linear-gradient(135deg, #1e2a3a, #16202c); border: 1px solid #2f4256; border-radius: 12px; padding: 16px 18px; margin-bottom: 20px; }
  .trend-label { font-size: 0.75rem; color: #7dd3fc; font-weight: 600; margin-bottom: 8px; }
  .trend-meta { font-size: 0.7rem; color: #8899aa; margin-top: 8px; }
  .stats-card { background: #171b24; border: 1px solid #2a3444; border-radius: 12px; padding: 16px 18px; margin-bottom: 20px; }
  .stats-line { font-size: 0.8rem; color: #cbd5e1; margin: 4px 0; }
  .sparkline { display: flex; align-items: flex-end; gap: 4px; height: 40px; margin-top: 10px; }
  .sparkline .bar { flex: 1; background: #7dd3fc; border-radius: 2px 2px 0 0; min-height: 2px; }
  a { color: #8ab4f8; text-decoration: none; font-size: 0.9rem; }
  a:hover { text-decoration: underline; }
</style>
</head>
<body>
  <h1>SDガンダム ジージェネレーション エターナル 更新チェッカー</h1>
  ${trendCard}
  ${statsCard}
  <p class="disclaimer">
    本サイトはBandai Namco・atwiki運営・X Corpとは無関係の個人プロジェクトです。
    有志Wiki(著作権は当該Wikiに帰属)の「更新情報」は機械的に検知して通知するのみで本文は転載していません。
    X投稿はX公式の埋め込み機能(oEmbed)をそのまま利用し、画像加工や文章の改変は行っていません。
    YouTube動画はYouTube公式の埋め込み機能をそのまま利用しています(実況者・攻略勢の動画を含みます)。
    コメント文は自動生成された推測であり、公式発表・Wiki編集者・動画投稿者の見解ではありません。詳細は必ずリンク先でご確認ください。
  </p>
  <ul>
    ${items || "<li>まだ更新は検知されていません。</li>"}
  </ul>
  <script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>
</body>
</html>
`;

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_PATH, html);
  console.log(`wrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

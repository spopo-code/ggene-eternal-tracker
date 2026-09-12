import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const UPDATES_PATH = path.join(process.cwd(), "data", "updates.json");
const TWEETS_PATH = path.join(process.cwd(), "data", "tweets.json");
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
  const [updates, tweets] = await Promise.all([
    readFile(UPDATES_PATH, "utf8").then(JSON.parse).catch(() => []),
    readFile(TWEETS_PATH, "utf8").then(JSON.parse).catch(() => []),
  ]);

  // Wiki更新とX投稿を1本のタイムラインにまとめて日時順に並べる
  const timeline = [
    ...updates.map((u) => ({ type: "wiki", date: u.wikiDate, data: u })),
    ...tweets.map((t) => ({ type: "tweet", date: t.createdAt, data: t })),
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
  a { color: #8ab4f8; text-decoration: none; font-size: 0.9rem; }
  a:hover { text-decoration: underline; }
</style>
</head>
<body>
  <h1>SDガンダム ジージェネレーション エターナル 更新チェッカー</h1>
  <p class="disclaimer">
    本サイトはBandai Namco・atwiki運営・X Corpとは無関係の個人プロジェクトです。
    有志Wiki(著作権は当該Wikiに帰属)の「更新情報」は機械的に検知して通知するのみで本文は転載していません。
    X投稿はX公式の埋め込み機能(oEmbed)をそのまま利用し、画像加工や文章の改変は行っていません。
    コメント文は自動生成された推測であり、公式発表やWiki編集者の見解ではありません。詳細は必ずリンク先でご確認ください。
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

// 週次トレンド集計。
//
// 設計の核: 「話題になってる数」はAIに聞くのではなく、
// 実際に検知した動画データからこちらのコードで機械的に集計する。
// AIの役割は「その実数をもとに自然な文章にする」ことだけに限定し、
// 存在しない数字や傾向をAIが創作しないようにする。
// (これが個人の攻略サイトにはできない、AI×蓄積データならではの強み)
//
// 週に1回だけ生成すればいいので、実行のたびに重複生成しないよう
// 「今週分は既にあるか」をチェックしてから動く。
//
// 使い方:
//   node scripts/weekly-trend.mjs

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const VIDEOS_PATH = path.join(DATA_DIR, "videos.json");
const TRENDS_PATH = path.join(DATA_DIR, "trends.json");

const MODEL = "claude-haiku-4-5-20251001";
const MIN_VIDEOS_TO_REPORT = 3; // これ未満なら「今週はまだ十分なデータがない」として生成しない

async function loadJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

// 日本時間基準で「今週月曜日」のYYYY-MM-DDを週キーとして使う
function currentWeekKey(now = new Date()) {
  const jst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  const day = jst.getDay(); // 0=日
  const diffToMonday = day === 0 ? 6 : day - 1;
  jst.setDate(jst.getDate() - diffToMonday);
  return jst.toISOString().slice(0, 10);
}

async function generateSummaryText({ videoCount, channelCount, topChannels, titles }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  const fallback =
    `今週(直近7日間)は ${videoCount}本 の関連動画を検知しました` +
    `(投稿チャンネル数: ${channelCount})。`;

  if (!apiKey) return fallback;

  const prompt = `以下は、スマホゲーム「SDガンダム ジージェネレーション エターナル」に関連する
YouTube動画を、直近7日間で機械的に検知した実データです。これらの事実(本数・チャンネル数・タイトル一覧)
だけをもとに、3〜4文程度で「今週の傾向」を紹介する文章を書いてください。

厳守事項:
- ここに無い数字や情報を作り出さない(実際に検知した本数・チャンネル数以外の統計を捏造しない)
- タイトルから共通して読み取れる話題(例: 特定のユニット名やイベント名が複数タイトルに登場している等)があれば触れてよいが、
  「〜が話題になっていたようです」等、タイトルの傾向からの推測であることが分かる書き方にする
- 断定的な結論(例: 「大人気でした」等)は避ける

実データ:
- 検知した動画本数: ${videoCount}本
- 投稿したチャンネル数: ${channelCount}(上位: ${topChannels.join("、")})
- 動画タイトル一覧:
${titles.map((t) => `  - ${t}`).join("\n")}
`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      console.error("Anthropic API error", res.status, await res.text());
      return fallback;
    }
    const data = await res.json();
    const text = data.content?.find((b) => b.type === "text")?.text?.trim();
    return text || fallback;
  } catch (err) {
    console.error("Anthropic API call failed", err);
    return fallback;
  }
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true });

  const videos = await loadJson(VIDEOS_PATH, []);
  const trends = await loadJson(TRENDS_PATH, []);

  const weekKey = currentWeekKey();
  if (trends.some((t) => t.weekKey === weekKey)) {
    console.log(`week ${weekKey} already has a trend summary — skipping.`);
    return;
  }

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = videos.filter((v) => new Date(v.publishedAt).getTime() >= sevenDaysAgo);

  if (recent.length < MIN_VIDEOS_TO_REPORT) {
    console.log(
      `only ${recent.length} video(s) in the last 7 days (need ${MIN_VIDEOS_TO_REPORT}+) — skipping this week.`
    );
    return;
  }

  // ここから先の数字は全部、実際に検知したデータからの機械集計(AIは関与しない)
  const channelCounts = {};
  for (const v of recent) {
    channelCounts[v.channelTitle] = (channelCounts[v.channelTitle] ?? 0) + 1;
  }
  const topChannels = Object.entries(channelCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, count]) => `${name}(${count}本)`);

  const summary = await generateSummaryText({
    videoCount: recent.length,
    channelCount: Object.keys(channelCounts).length,
    topChannels,
    titles: recent.map((v) => v.title),
  });

  trends.unshift({
    weekKey,
    generatedAt: new Date().toISOString(),
    videoCount: recent.length,
    channelCount: Object.keys(channelCounts).length,
    topChannels,
    summary,
  });
  trends.length = Math.min(trends.length, 52); // 直近1年分まで保持

  await writeFile(TRENDS_PATH, JSON.stringify(trends, null, 2));
  console.log(`generated trend summary for week ${weekKey} (${recent.length} videos)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

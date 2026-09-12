// 蓄積データの統計分析。
//
// ここは意図的にAIを一切使わない。単純だが「時間をかけて溜め続けたデータでしか
// 出せない」実数の集計に徹する。個人の攻略サイトが手作業ではやらない
// (やれない)類の分析で、これこそがAI×自動化の最も分かりやすい強み。
//
// 使い方:
//   node scripts/history-stats.mjs

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const UPDATES_PATH = path.join(DATA_DIR, "updates.json");
const VIDEOS_PATH = path.join(DATA_DIR, "videos.json");
const STATS_PATH = path.join(DATA_DIR, "history-stats.json");

const MIN_POINTS_FOR_AVERAGE = 5; // これ未満の間隔データでは「平均」を出さない(誤解を招く数字にしない)

async function loadJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

// 日付の配列から「連続する検知の間隔(日数)」の配列を作る
function intervalsInDays(sortedDates) {
  const intervals = [];
  for (let i = 1; i < sortedDates.length; i++) {
    const diffMs = sortedDates[i] - sortedDates[i - 1];
    intervals.push(diffMs / (1000 * 60 * 60 * 24));
  }
  return intervals;
}

function average(nums) {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function median(nums) {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// タイトルに「ガシャ」「ガチャ」を含むものだけを抽出(ガチャ更新の周期を見るため)
function isGachaRelated(title) {
  return /ガシャ|ガチャ/.test(title ?? "");
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true });

  const updates = await loadJson(UPDATES_PATH, []);
  const videos = await loadJson(VIDEOS_PATH, []);

  // --- Wiki更新の全体的な検知間隔 ---
  const wikiDates = updates
    .map((u) => new Date(u.wikiDate).getTime())
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b);
  const wikiIntervals = intervalsInDays(wikiDates);

  // --- ガシャ関連の更新間隔(Wiki更新タイトル + 動画タイトルの両方から) ---
  const gachaDates = [
    ...updates.filter((u) => isGachaRelated(u.title)).map((u) => new Date(u.wikiDate).getTime()),
    ...videos.filter((v) => isGachaRelated(v.title)).map((v) => new Date(v.publishedAt).getTime()),
  ]
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b);
  const gachaIntervals = intervalsInDays(gachaDates);

  // --- 動画投稿数の週次推移(直近8週間、伸びているか一目で分かるように) ---
  const now = Date.now();
  const weeklyVideoCounts = [];
  for (let w = 7; w >= 0; w--) {
    const weekStart = now - (w + 1) * 7 * 24 * 60 * 60 * 1000;
    const weekEnd = now - w * 7 * 24 * 60 * 60 * 1000;
    const count = videos.filter((v) => {
      const t = new Date(v.publishedAt).getTime();
      return t >= weekStart && t < weekEnd;
    }).length;
    weeklyVideoCounts.push(count);
  }

  const stats = {
    generatedAt: new Date().toISOString(),
    totalWikiUpdatesTracked: updates.length,
    totalVideosTracked: videos.length,
    wikiUpdateInterval:
      wikiIntervals.length >= MIN_POINTS_FOR_AVERAGE
        ? {
            averageDays: Number(average(wikiIntervals).toFixed(1)),
            medianDays: Number(median(wikiIntervals).toFixed(1)),
            sampleSize: wikiIntervals.length,
          }
        : null, // データ不足時はnull(サイト側で「まだ集計中」と表示する)
    gachaUpdateInterval:
      gachaIntervals.length >= MIN_POINTS_FOR_AVERAGE
        ? {
            averageDays: Number(average(gachaIntervals).toFixed(1)),
            medianDays: Number(median(gachaIntervals).toFixed(1)),
            sampleSize: gachaIntervals.length,
          }
        : null,
    weeklyVideoCounts, // 常に出す(8週間、0埋めでOK。データが増えるほど意味が出てくる)
  };

  await writeFile(STATS_PATH, JSON.stringify(stats, null, 2));
  console.log(
    `history stats updated: wiki=${updates.length}件, videos=${videos.length}件, ` +
      `wikiInterval=${stats.wikiUpdateInterval ? stats.wikiUpdateInterval.averageDays + "日" : "データ不足"}, ` +
      `gachaInterval=${stats.gachaUpdateInterval ? stats.gachaUpdateInterval.averageDays + "日" : "データ不足"}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

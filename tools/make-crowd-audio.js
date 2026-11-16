// 从 CC0 的球场人群录音里挑最热闹的一段，做成可无缝循环的 assets/crowd.mp3
const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const SRC = path.join(process.env.TEMP, "crowd-src", "crowd-src.wav");
const root = path.resolve(__dirname, "..");
const OUT = path.join(root, "assets", "crowd.mp3");

function run(args) {
  const r = cp.spawnSync("ffmpeg", args, { encoding: "utf8", maxBuffer: 1 << 26 });
  return { out: r.stdout || "", err: r.stderr || "" };
}
function meanVol(start, dur) {
  const { err } = run(["-hide_banner", "-ss", String(start), "-t", String(dur), "-i", SRC,
    "-af", "volumedetect", "-f", "null", "-"]);
  const m = err.match(/mean_volume:\s*(-?[\d.]+) dB/);
  const p = err.match(/max_volume:\s*(-?[\d.]+) dB/);
  return { mean: m ? +m[1] : null, peak: p ? +p[1] : null };
}

console.log("① 扫描最热闹的 4 秒窗口（mean 越大越热闹，peak 接近 0 说明可能削波）");
const wins = [];
for (let t = 0; t < 56; t += 2) {
  const v = meanVol(t, 4);
  if (v.mean !== null) wins.push({ t, ...v });
}
wins.sort((a, b) => b.mean - a.mean);
wins.slice(0, 6).forEach(w => console.log(`   t=${String(w.t).padStart(2)}s  mean=${w.mean} dB  peak=${w.peak} dB`));

const best = wins[0];
const start = Math.max(0, best.t - 0.5);
const DUR = 6;
console.log(`\n② 选中最热闹的一段：从 ${start.toFixed(1)}s 起取 ${DUR}s`);

// 归一化到 mean -20dB 左右（背景级），mono / 44.1k，首尾 0.25s 淡入淡出保证循环不爆音
const target = -20;
const gain = (target - best.mean).toFixed(2);
console.log(`③ 处理：mono / 44100Hz / 增益 ${gain}dB / 首尾 0.25s 淡变 / mp3 64k`);

const args = [
  "-y", "-hide_banner", "-v", "error",
  "-ss", String(start), "-t", String(DUR), "-i", SRC,
  "-af", `volume=${gain}dB,afade=t=in:st=0:d=0.25,afade=t=out:st=${(DUR - 0.25).toFixed(2)}:d=0.25`,
  "-ac", "1", "-ar", "44100",
  "-c:a", "libmp3lame", "-b:a", "64k",
  OUT
];
const { err } = run(args);
if (err.trim()) console.log("ffmpeg:", err.trim().slice(0, 300));

if (!fs.existsSync(OUT)) { console.error("❌ 没生成文件"); process.exit(1); }
const kb = fs.statSync(OUT).size / 1024;
console.log(`④ 输出 assets/crowd.mp3  ${kb.toFixed(1)} KB`);

// 复核成品电平
const chk = run(["-hide_banner", "-i", OUT, "-af", "volumedetect", "-f", "null", "-"]);
const m = chk.err.match(/mean_volume:\s*(-?[\d.]+) dB/);
const p = chk.err.match(/max_volume:\s*(-?[\d.]+) dB/);
console.log(`   成品 mean=${m ? m[1] : "?"} dB  peak=${p ? p[1] : "?"} dB`);

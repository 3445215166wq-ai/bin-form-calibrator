// 在 Arrowhead 球场录音里找"起伏最有助威感"的一段，并据此生成 assets/crowd.mp3
const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const SRC = path.join(process.env.TEMP, "arena-src", "arrowhead.wav");
const root = path.resolve(__dirname, "..");
const OUT = path.join(root, "assets", "crowd.mp3");
const TARGET_MEAN_DB = -18;      // 与其他音效保持同一归一化基准

function ff(args) {
  const r = cp.spawnSync("ffmpeg", args, { encoding: "utf8", maxBuffer: 1 << 26 });
  return r.stderr || "";
}
const meanVol = (f, ss, t) => { const e = ff(["-hide_banner", "-ss", String(ss), "-t", String(t), "-i", f, "-af", "volumedetect", "-f", "null", "-"]); const m = e.match(/mean_volume:\s*(-?[\d.]+)/); return m ? +m[1] : null; };

function modulation(f, ss, t) {
  const r = cp.spawnSync("ffmpeg", ["-hide_banner", "-v", "error", "-ss", String(ss), "-t", String(t),
    "-i", f, "-ac", "1", "-ar", "8000", "-f", "s16le", "-"], { maxBuffer: 1 << 26 });
  const buf = r.stdout;
  if (!buf || buf.length < 1600) return null;
  const n = Math.floor(buf.length / 2), win = 800, rms = [];
  for (let i = 0; i + win <= n; i += win) {
    let s = 0;
    for (let j = 0; j < win; j++) { const v = buf.readInt16LE((i + j) * 2) / 32768; s += v * v; }
    rms.push(Math.sqrt(s / win));
  }
  const mean = rms.reduce((a, b) => a + b, 0) / rms.length;
  const sd = Math.sqrt(rms.reduce((a, b) => a + (b - mean) ** 2, 0) / rms.length);
  return mean > 0 ? +(sd / mean).toFixed(2) : null;
}

const DUR_WIN = 6;
console.log("扫描 Arrowhead（13.5s）每 1 秒起点的 6 秒窗口：\n");
console.log(" 起点   mean(dB)  起伏CV");
const rows = [];
for (let ss = 0; ss + DUR_WIN <= 13.4; ss += 1) {
  const v = meanVol(SRC, ss, DUR_WIN);
  const cv = modulation(SRC, ss, DUR_WIN);
  rows.push({ ss, v, cv });
  console.log(`  ${String(ss).padStart(2)}s  ${String(v).padStart(8)}  ${cv}`);
}

// 选：起伏(CV)最高、且响度不低于最大值 6dB 的那一段 —— 既有能量又有起伏
const maxV = Math.max(...rows.map(r => r.v));
const ok = rows.filter(r => r.v >= maxV - 6 && r.cv !== null);
ok.sort((a, b) => b.cv - a.cv);
const pick = ok[0];
console.log(`\n选中：起点 ${pick.ss}s（mean ${pick.v} dB，CV ${pick.cv}）`);

const gain = (TARGET_MEAN_DB - pick.v).toFixed(2);
console.log(`归一化增益 ${gain} dB → 目标 mean ${TARGET_MEAN_DB} dB`);

const args = ["-y", "-hide_banner", "-v", "error",
  "-ss", String(pick.ss), "-t", String(DUR_WIN), "-i", SRC,
  "-af", `volume=${gain}dB,afade=t=in:st=0:d=0.3,afade=t=out:st=${(DUR_WIN - 0.3).toFixed(2)}:d=0.3`,
  "-ac", "1", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "80k",
  OUT];
const e = ff(args);
if (e.trim()) console.log("ffmpeg:", e.trim().slice(0, 200));
if (!fs.existsSync(OUT)) { console.error("生成失败"); process.exit(1); }

const kb = fs.statSync(OUT).size / 1024;
const chk = ff(["-hide_banner", "-i", OUT, "-af", "volumedetect", "-f", "null", "-"]);
const mm = chk.match(/mean_volume:\s*(-?[\d.]+)/);
const pk = chk.match(/max_volume:\s*(-?[\d.]+)/);
const cv2 = modulation(OUT, 0, DUR_WIN);
console.log(`\n✅ 已生成 assets/crowd.mp3  ${kb.toFixed(1)} KB`);
console.log(`   成品 mean=${mm ? mm[1] : "?"} dB  peak=${pk ? pk[1] : "?"} dB  起伏CV=${cv2}`);

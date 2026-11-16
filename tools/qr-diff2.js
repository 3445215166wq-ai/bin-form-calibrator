// 反读矩阵里的码字，判断到底是"码字算错"还是"填装位置错"
const path = require("path");
const QRLib = require(path.join(__dirname, "qr-encoder.js"));
const ref = require(path.join(process.env.TEMP, "qrtest", "node_modules", "qrcode"));

const text = "https://a.co/1";
const q = ref.create(text, { errorCorrectionLevel: "M" });
const n = q.modules.size;
const ver = q.version;
const refM = [];
for (let r = 0; r < n; r++) {
  const row = [];
  for (let c = 0; c < n; c++) row.push(!!q.modules.get(r, c));
  refM.push(row);
}
const mask = q.maskPattern;

const { fn } = QRLib.fnMap(ver);

function readBits(m) {
  const bits = [];
  let up = true;
  for (let col = n - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    for (let row = 0; row < n; row++) {
      const r = up ? (n - 1 - row) : row;
      for (let k = 0; k < 2; k++) {
        const c = col - k;
        if (fn[r][c]) continue;
        let v = m[r][c];
        if (QRLib.maskFn(mask, r, c)) v = !v;
        bits.push(v ? 1 : 0);
      }
    }
    up = !up;
  }
  return bits;
}

function toBytes(bits) {
  const out = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
    out.push(v);
  }
  return out;
}

const refCw = toBytes(readBits(refM));
const mineCw = QRLib.codewords(text).cw;

console.log("version:", ver, " mask:", mask, " 码字总数: ref=" + refCw.length + " mine=" + mineCw.length);
let firstBad = -1;
for (let i = 0; i < Math.min(refCw.length, mineCw.length); i++) {
  if (refCw[i] !== mineCw[i]) { firstBad = i; break; }
}
if (firstBad < 0) {
  console.log("✓ 码字完全一致 —— 问题在填装/格式信息/掩码，不在 RS");
} else {
  console.log("✗ 第 " + firstBad + " 个码字开始不一致");
  console.log("  ref :", refCw.slice(0, 26).map(b => b.toString(16).padStart(2, "0")).join(" "));
  console.log("  mine:", mineCw.slice(0, 26).map(b => b.toString(16).padStart(2, "0")).join(" "));
  console.log("  数据段(前16) ref :", refCw.slice(0, 16).map(b => b.toString(16).padStart(2, "0")).join(" "));
  console.log("  数据段(前16) mine:", mineCw.slice(0, 16).map(b => b.toString(16).padStart(2, "0")).join(" "));
  console.log("  校验段(后10) ref :", refCw.slice(16).map(b => b.toString(16).padStart(2, "0")).join(" "));
  console.log("  校验段(后10) mine:", mineCw.slice(16).map(b => b.toString(16).padStart(2, "0")).join(" "));
}

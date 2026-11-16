// 用 jsQR 反解，验证自写编码器生成的二维码是合规的
const path = require("path");
const QRLib = require(path.join(__dirname, "qr-encoder.js"));
const jsQR = require(path.join(process.env.TEMP, "qrtest", "node_modules", "jsqr")).default;

function raster(matrix, scale) {
  const n = matrix.length;
  const quiet = 4 * scale;
  const size = n * scale + quiet * 2;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      let dark = false;
      const mx = Math.floor((x - quiet) / scale), my = Math.floor((y - quiet) / scale);
      if (mx >= 0 && my >= 0 && mx < n && my < n) dark = matrix[my][mx];
      const v = dark ? 0 : 255;
      data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
    }
  }
  return { data, size };
}

const cases = [
  "https://binform-d0g0vgl1rde2f7fde-1533757942.tcloudbaseapp.com/?t=6",
  "https://binform-d0g0vgl1rde2f7fde-1533757942.tcloudbaseapp.com/?t=1",
  "https://illustrious-praline-5f50b9.netlify.app/?t=3",
  "http://127.0.0.1:8099/index.html?t=7",
  "https://a.co/1",
  "https://example.com/" + "x".repeat(70)
];

let ok = 0, bad = 0;
for (const text of cases) {
  try {
    const m = QRLib.matrix(text);
    const { data, size } = raster(m, 6);
    const res = jsQR(data, size, size);
    const got = res ? res.data : "(解码失败)";
    const pass = got === text;
    console.log((pass ? "✓" : "✗") + `  ${m.length}x${m.length}  len=${text.length}  ${pass ? "" : "→ " + got}`);
    pass ? ok++ : bad++;
  } catch (e) {
    console.log("✗  " + text.slice(0, 40) + " → " + e.message);
    bad++;
  }
}
console.log(`\n通过 ${ok} / 失败 ${bad}`);
process.exit(bad ? 1 : 0);

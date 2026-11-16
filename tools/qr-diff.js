// 定位 bug：逐掩码对比参考实现 + 单独验证光栅化/解码链路
const path = require("path");
const QRLib = require(path.join(__dirname, "qr-encoder.js"));
const ref = require(path.join(process.env.TEMP, "qrtest", "node_modules", "qrcode"));
const jsQR = require(path.join(process.env.TEMP, "qrtest", "node_modules", "jsqr")).default;

const text = "https://a.co/1";
const q = ref.create(text, { errorCorrectionLevel: "M" });
const n = q.modules.size;
const refM = [];
for (let r = 0; r < n; r++) {
  const row = [];
  for (let c = 0; c < n; c++) row.push(!!q.modules.get(r, c));
  refM.push(row);
}

function raster(matrix, scale) {
  const n = matrix.length, quiet = 4 * scale, size = n * scale + quiet * 2;
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const mx = Math.floor((x - quiet) / scale), my = Math.floor((y - quiet) / scale);
      const dark = (mx >= 0 && my >= 0 && mx < n && my < n) ? matrix[my][mx] : false;
      const v = dark ? 0 : 255;
      data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
    }
  }
  return { data, size };
}

// ① 光栅化 + 解码链路是否可信：拿参考矩阵去解
{
  const { data, size } = raster(refM, 6);
  const res = jsQR(data, size, size);
  console.log("① 参考矩阵解码:", res ? JSON.stringify(res.data) : "(失败) → 说明光栅化或 jsQR 用法有问题");
}

// ② 我的 8 个掩码分别和参考（mask=" + q.maskPattern + "）比
console.log("② 参考用的 mask =", q.maskPattern);
for (let mask = 0; mask < 8; mask++) {
  const m = QRLib.matrix(text, mask);
  let diff = 0;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m[r][c] !== refM[r][c]) diff++;
  console.log(`   mask=${mask}  不一致 ${diff}/${n * n}`);
}

// ③ 最优掩码版本的自解码
{
  const m = QRLib.matrix(text);
  const { data, size } = raster(m, 6);
  const res = jsQR(data, size, size);
  console.log("③ 自选掩码版本解码:", res ? JSON.stringify(res.data) : "(失败)");
}

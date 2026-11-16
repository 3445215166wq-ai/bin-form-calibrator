// 把新的分享区块 + 自写二维码编码器拼进 index.html，并删掉九宫格海报那一整段
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const file = path.join(root, "index.html");
const lines = fs.readFileSync(file, "utf8").split("\n");

function findIdx(pred, label) {
  const i = lines.findIndex(pred);
  if (i < 0) throw new Error("找不到: " + label);
  return i;
}

/* 1) 二维码编码器：直接复用已验证的 tools/qr-encoder.js（去掉 module 导出那几行） */
let qr = fs.readFileSync(path.join(__dirname, "qr-encoder.js"), "utf8");
qr = qr.slice(0, qr.indexOf("if (typeof module"));
qr = qr.replace(/^\/\* QR 编码器[\s\S]*?\*\//, "/* QR 编码器（字节模式 / EC M / 版本 1~6 / 自动掩码）：已用 jsQR 反解验证 */");
qr = qr.trimEnd();

const shareBlock = fs.readFileSync(path.join(__dirname, "_shareblock.js"), "utf8").trimEnd();
const newBlock = (qr + "\n\n" + shareBlock).split("\n");

/* 2) 先处理靠后的海报段（避免行号漂移） */
const pStart = findIdx(l => l.includes("九宫格海报"), "海报段开始");
const pEnd = findIdx(l => l.includes('btnPoster").addEventListener'), "海报段结束");
console.log(`删除海报段: 第 ${pStart + 1} ~ ${pEnd + 1} 行（${pEnd - pStart + 1} 行）`);
lines.splice(pStart, pEnd - pStart + 1);

/* 3) 再替换分享段 */
const sStart = findIdx(l => l.includes("分享：当前画面 + 分享边框"), "分享段开始");
const sEnd = findIdx(l => l.includes('btnShare").addEventListener'), "分享段结束");
console.log(`替换分享段: 第 ${sStart + 1} ~ ${sEnd + 1} 行 → 新 ${newBlock.length} 行`);
lines.splice(sStart, sEnd - sStart + 1, ...newBlock);

fs.writeFileSync(file, lines.join("\n"), "utf8");
console.log("已写回 index.html");

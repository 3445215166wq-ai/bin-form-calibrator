/* QR 编码器（字节模式 / EC level M / 版本 1~6 / 自动挑最优掩码）
   零依赖，纯函数，同一份文本既能被 Node require（测试用），也能直接内联进 index.html。
   mask / format info / Reed-Solomon 全按 ISO/IEC 18004 实现。 */
var QRLib = (function () {
  "use strict";

  /* ---- GF(256) ---- */
  var EXP = new Array(512), LOG = new Array(256);
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) {
      EXP[i] = x; LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
  })();
  function mul(a, b) { return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]]; }

  /* ---- 版本表：EC level M = [每块校验码字数, [[块数, 每块数据码字数], ...]] ---- */
  var VER = {
    1: [10, [[1, 16]]],
    2: [16, [[1, 28]]],
    3: [26, [[1, 44]]],
    4: [18, [[2, 32]]],
    5: [24, [[2, 43]]],
    6: [16, [[4, 27]]]
  };
  var ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34] };
  var EC_M = 0;                     /* EC 指示符：L=01 M=00 Q=11 H=10 */

  /* ---- Reed-Solomon ---- */
  function genPoly(deg) {
    var g = [1];
    for (var i = 0; i < deg; i++) {
      var ng = new Array(g.length + 1);
      for (var k = 0; k < ng.length; k++) ng[k] = 0;
      for (var j = 0; j < g.length; j++) {
        ng[j] ^= g[j];
        ng[j + 1] ^= mul(g[j], EXP[i]);
      }
      g = ng;
    }
    return g;
  }
  function ecBytes(data, ecLen) {
    var g = genPoly(ecLen);
    var res = new Array(ecLen);
    for (var i = 0; i < ecLen; i++) res[i] = 0;
    for (var d = 0; d < data.length; d++) {
      var factor = data[d] ^ res[0];
      res.shift(); res.push(0);
      if (factor !== 0) for (var i2 = 0; i2 < ecLen; i2++) res[i2] ^= mul(g[i2 + 1], factor);
    }
    return res;
  }

  /* ---- 生成码字流 ---- */
  function codewords(text) {
    var bytes;
    if (typeof TextEncoder !== "undefined") bytes = Array.from(new TextEncoder().encode(text));
    else {
      bytes = [];
      for (var i = 0; i < text.length; i++) bytes.push(text.charCodeAt(i) & 0xff);
    }

    var ver = 0;
    for (var v = 1; v <= 6; v++) {
      var cap = 0, groups = VER[v][1];
      for (var gi = 0; gi < groups.length; gi++) cap += groups[gi][0] * groups[gi][1];
      if (4 + 8 + bytes.length * 8 <= cap * 8) { ver = v; break; }
    }
    if (!ver) throw new Error("QR: 内容太长（版本 1~6 装不下）");

    /* 比特流 */
    var bits = [];
    function push(val, len) { for (var i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); }
    push(4, 4);                          /* 字节模式 */
    push(bytes.length, 8);               /* 长度指示符（v1~9 是 8 位） */
    for (var b = 0; b < bytes.length; b++) push(bytes[b], 8);

    var ecLen = VER[ver][0], groups2 = VER[ver][1];
    var dataCw = 0;
    for (var g2 = 0; g2 < groups2.length; g2++) dataCw += groups2[g2][0] * groups2[g2][1];

    /* 结束符 + 补齐到字节 */
    var maxBits = dataCw * 8;
    for (var t = 0; t < 4 && bits.length < maxBits; t++) bits.push(0);
    while (bits.length % 8 !== 0) bits.push(0);

    var dc = [];
    for (var p = 0; p < bits.length; p += 8) {
      var byteVal = 0;
      for (var q = 0; q < 8; q++) byteVal = (byteVal << 1) | bits[p + q];
      dc.push(byteVal);
    }
    /* 填充字节 */
    var pad = [0xec, 0x11], pi = 0;
    while (dc.length < dataCw) { dc.push(pad[pi & 1]); pi++; }

    /* 分块 + 计算校验 + 交错 */
    var blocks = [], k = 0;
    for (var bi = 0; bi < groups2.length; bi++) {
      for (var nb = 0; nb < groups2[bi][0]; nb++) {
        var d = dc.slice(k, k + groups2[bi][1]); k += groups2[bi][1];
        blocks.push({ d: d, e: ecBytes(d, ecLen) });
      }
    }
    var out = [];
    var maxD = 0;
    for (var m1 = 0; m1 < blocks.length; m1++) maxD = Math.max(maxD, blocks[m1].d.length);
    for (var c1 = 0; c1 < maxD; c1++) {
      for (var b1 = 0; b1 < blocks.length; b1++) {
        if (c1 < blocks[b1].d.length) out.push(blocks[b1].d[c1]);
      }
    }
    for (var c2 = 0; c2 < ecLen; c2++) {
      for (var b2 = 0; b2 < blocks.length; b2++) out.push(blocks[b2].e[c2]);
    }
    return { ver: ver, cw: out };
  }

  /* ---- 矩阵 ---- */
  function formatBits(mask) {
    var data = (EC_M << 3) | mask;               /* 5 位 */
    var v = data << 10, G = 0x537;
    for (var i = 14; i >= 10; i--) if ((v >> i) & 1) v ^= G << (i - 10);
    return ((data << 10) | v) ^ 0x5412;
  }
  function maskFn(mask, r, c) {
    switch (mask) {
      case 0: return (r + c) % 2 === 0;
      case 1: return r % 2 === 0;
      case 2: return c % 3 === 0;
      case 3: return (r + c) % 3 === 0;
      case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
      case 5: return (r * c) % 2 + (r * c) % 3 === 0;
      case 6: return ((r * c) % 2 + (r * c) % 3) % 2 === 0;
      default: return ((r + c) % 2 + (r * c) % 3) % 2 === 0;
    }
  }

  function build(ver, cwArr, mask) {
    var n = 17 + 4 * ver, r, c, i, j;
    var m = [], fn = [];
    for (r = 0; r < n; r++) {
      m.push(new Array(n)); fn.push(new Array(n));
      for (c = 0; c < n; c++) { m[r][c] = false; fn[r][c] = false; }
    }
    function set(rr, cc, v) { m[rr][cc] = v; fn[rr][cc] = true; }

    /* 定位图形 + 分隔带 */
    function finder(r0, c0) {
      for (var dr = -1; dr <= 7; dr++) for (var dc = -1; dc <= 7; dc++) {
        var rr = r0 + dr, cc = c0 + dc;
        if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
        var dark = (dr >= 0 && dr <= 6 && (dc === 0 || dc === 6)) ||
                   (dc >= 0 && dc <= 6 && (dr === 0 || dr === 6)) ||
                   (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4);
        set(rr, cc, dark);
      }
    }
    finder(0, 0); finder(0, n - 7); finder(n - 7, 0);

    /* 时序图形 */
    for (i = 8; i < n - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }

    /* 校正图形 */
    var al = ALIGN[ver];
    for (var ai = 0; ai < al.length; ai++) {
      for (var aj = 0; aj < al.length; aj++) {
        var ar = al[ai], ac = al[aj];
        var skip = (ar === 6 && ac === 6) || (ar === 6 && ac === n - 7) || (ar === n - 7 && ac === 6);
        if (skip) continue;
        for (var pr = -2; pr <= 2; pr++) for (var pc = -2; pc <= 2; pc++) {
          var mx = Math.max(Math.abs(pr), Math.abs(pc));
          set(ar + pr, ac + pc, mx === 2 || mx === 0);
        }
      }
    }

    /* 格式信息（15 位，两份拷贝 + 固定黑点）
       注意方向：第一份沿"列 8 向下 + 行 8 向左"，第二份沿"行 8 向右 + 列 8 向下"，
       写反了（行列转置）解码器就读不出格式信息，整张图扫不出来。 */
    var fb = formatBits(mask);
    function bit(idx) { return ((fb >> idx) & 1) === 1; }
    for (i = 0; i <= 5; i++) set(i, 8, bit(i));          /* col 8, rows 0..5 */
    set(7, 8, bit(6));                                    /* col 8, row 7 */
    set(8, 8, bit(7));                                    /* col 8, row 8 */
    set(8, 7, bit(8));                                    /* col 7, row 8 */
    for (i = 9; i < 15; i++) set(8, 14 - i, bit(i));      /* row 8, cols 5..0 */
    for (i = 0; i < 8; i++) set(8, n - 1 - i, bit(i));    /* row 8, cols n-1..n-8 */
    for (i = 8; i < 15; i++) set(n - 15 + i, 8, bit(i));  /* col 8, rows n-7..n-1 */
    set(n - 8, 8, true);                                  /* 固定黑点 */

    /* 数据比特（低位在前按字节 MSB 顺序） */
    var bits = [];
    for (i = 0; i < cwArr.length; i++) for (var b = 7; b >= 0; b--) bits.push((cwArr[i] >> b) & 1);

    /* 之字形填装 + 掩码 */
    var idx = 0, up = true;
    for (var col = n - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      for (var row = 0; row < n; row++) {
        var rr2 = up ? (n - 1 - row) : row;
        for (var kk = 0; kk < 2; kk++) {
          var cc2 = col - kk;
          if (fn[rr2][cc2]) continue;
          var v = idx < bits.length ? bits[idx] === 1 : false;
          idx++;
          if (maskFn(mask, rr2, cc2)) v = !v;
          m[rr2][cc2] = v;
        }
      }
      up = !up;
    }
    return m;
  }

  /* ---- 掩码评分（四条 penalty 规则） ---- */
  function penalty(m) {
    var n = m.length, score = 0, r, c, i;
    /* N1 同色连续 5+ */
    for (r = 0; r < n; r++) {
      var run = 1;
      for (c = 1; c < n; c++) {
        if (m[r][c] === m[r][c - 1]) run++;
        else { if (run >= 5) score += 3 + (run - 5); run = 1; }
      }
      if (run >= 5) score += 3 + (run - 5);
    }
    for (c = 0; c < n; c++) {
      var run2 = 1;
      for (r = 1; r < n; r++) {
        if (m[r][c] === m[r - 1][c]) run2++;
        else { if (run2 >= 5) score += 3 + (run2 - 5); run2 = 1; }
      }
      if (run2 >= 5) score += 3 + (run2 - 5);
    }
    /* N2 2x2 同色块 */
    for (r = 0; r < n - 1; r++) for (c = 0; c < n - 1; c++) {
      var v = m[r][c];
      if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
    }
    /* N3 类定位图形 */
    var pat = [true, false, true, true, true, false, true, false, false, false, false];
    var patR = [false, false, false, false, true, false, true, true, true, false, true];
    function scanLine(get, len) {
      for (var s = 0; s + 11 <= len; s++) {
        var ok1 = true, ok2 = true;
        for (var t = 0; t < 11; t++) {
          var val = get(s + t);
          if (val !== pat[t]) ok1 = false;
          if (val !== patR[t]) ok2 = false;
          if (!ok1 && !ok2) break;
        }
        if (ok1) score += 40;
        if (ok2) score += 40;
      }
    }
    for (r = 0; r < n; r++) scanLine(function (x) { return m[r][x]; }, n);
    for (c = 0; c < n; c++) scanLine(function (x) { return m[x][c]; }, n);
    /* N4 黑白比例 */
    var dark = 0;
    for (r = 0; r < n; r++) for (c = 0; c < n; c++) if (m[r][c]) dark++;
    var pct = dark * 100 / (n * n);
    score += Math.floor(Math.abs(pct - 50) / 5) * 10;
    return score;
  }

  /* ---- 功能图形占位图（调试用：用来从矩阵里反读码字） ---- */
  function fnMap(ver) {
    var n = 17 + 4 * ver, r, c, i;
    var fn = [];
    for (r = 0; r < n; r++) { fn.push(new Array(n)); for (c = 0; c < n; c++) fn[r][c] = false; }
    function mark(rr, cc) { if (rr >= 0 && cc >= 0 && rr < n && cc < n) fn[rr][cc] = true; }
    function finderMark(r0, c0) {
      for (var dr = -1; dr <= 7; dr++) for (var dc = -1; dc <= 7; dc++) mark(r0 + dr, c0 + dc);
    }
    finderMark(0, 0); finderMark(0, n - 7); finderMark(n - 7, 0);
    for (i = 8; i < n - 8; i++) { mark(6, i); mark(i, 6); }
    var al = ALIGN[ver];
    for (var ai = 0; ai < al.length; ai++) for (var aj = 0; aj < al.length; aj++) {
      var ar = al[ai], ac = al[aj];
      if ((ar === 6 && ac === 6) || (ar === 6 && ac === n - 7) || (ar === n - 7 && ac === 6)) continue;
      for (var pr = -2; pr <= 2; pr++) for (var pc = -2; pc <= 2; pc++) mark(ar + pr, ac + pc);
    }
    for (i = 0; i <= 8; i++) { mark(i, 8); mark(8, i); }
    for (i = 0; i < 8; i++) mark(8, n - 1 - i);
    for (i = 8; i < 15; i++) mark(n - 15 + i, 8);
    mark(n - 8, 8);                       /* 固定黑点也算功能模块 */
    return { n: n, fn: fn };
  }

  /* ---- 对外：文本 → 二维布尔矩阵；forceMask 仅用于对拍调试 ---- */
  function matrix(text, forceMask) {
    var enc = codewords(text);
    if (typeof forceMask === "number") return build(enc.ver, enc.cw, forceMask);
    var best = null, bestScore = Infinity;
    for (var mask = 0; mask < 8; mask++) {
      var mtx = build(enc.ver, enc.cw, mask);
      var sc = penalty(mtx);
      if (sc < bestScore) { bestScore = sc; best = mtx; }
    }
    return best;
  }

  return { matrix: matrix, fnMap: fnMap, codewords: codewords, maskFn: maskFn };
})();

if (typeof module !== "undefined" && module.exports) module.exports = QRLib;

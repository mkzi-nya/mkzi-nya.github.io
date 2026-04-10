import { createScoreEngine } from './score_engine.js';

let engine = null;
let searcher = null;
let running = false;
let rafId = 0;
let foundCount = 0;
const seenCompressed = new Set();

const $ = (id) => document.getElementById(id);

function showTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.tab-buttons button').forEach(btn => btn.classList.remove('active'));
  $(tabId).classList.add('active');
  document.querySelector(`.tab-buttons button[data-tab="${tabId}"]`)?.classList.add('active');
}
window.showTab = showTab;

function calcCaps(noteAmount) {
  return {
    bMax: Math.min(192, Math.max((noteAmount * 12 / 50) | 0, 1)),
    gCap: Math.min(128, Math.max((noteAmount * 8 / 50) | 0, 1)),
    nCap: Math.min(96,  Math.max((noteAmount * 6 / 50) | 0, 1)),
    bCap: Math.min(64,  Math.max((noteAmount * 5 / 50) | 0, 1)),
    mCap: Math.min(64,  Math.max((noteAmount * 4 / 50) | 0, 1)),
  };
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}


function formatRunChar(c, len) {
  return len > 1 ? `${c}${len}` : c;
}

function tokenEncodedLength(tokens) {
  let n = 0;
  for (const t of tokens) n += 1 + (t.len > 1 ? String(t.len).length : 0);
  return n;
}

function tokensToText(tokens) {
  let out = '';
  for (const t of tokens) out += formatRunChar(t.c, t.len);
  return out;
}

function makeCandidate(tokens) {
  return {
    tokens,
    runs: tokens.length,
    encLen: tokenEncodedLength(tokens),
    key: tokensToText(tokens)
  };
}

function betterCandidate(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (a.runs !== b.runs) return a.runs < b.runs ? a : b;
  if (a.encLen !== b.encLen) return a.encLen < b.encLen ? a : b;
  return a.key <= b.key ? a : b;
}

function prependCandidateChar(child, c) {
  const tokens = child.tokens.slice();
  if (tokens.length && tokens[0].c === c) {
    tokens[0] = { c, len: tokens[0].len + 1 };
  } else {
    tokens.unshift({ c, len: 1 });
  }
  return makeCandidate(tokens);
}

function applyEpRunContribution(score, bMax, c, len) {
  if (len <= 0) return { sum: 0, endScore: score };
  if (score >= bMax) return { sum: len * bMax, endScore: bMax };
  const a = c === 'e' ? 2 : 1;
  let u = ((bMax - 1 - score) / a) | 0;
  if (u < 0) u = 0;
  if (u > len) u = len;
  let sum = 0;
  if (u) sum += u * (2 * (score + a) + (u - 1) * a) / 2;
  sum += (len - u) * bMax;
  let endScore = score + len * a;
  if (endScore > bMax) endScore = bMax;
  return { sum, endScore };
}

function epContributionBounds(score, bMax, eCount, pCount) {
  const minP = applyEpRunContribution(score, bMax, 'p', pCount);
  const minE = applyEpRunContribution(minP.endScore, bMax, 'e', eCount);
  const maxE = applyEpRunContribution(score, bMax, 'e', eCount);
  const maxP = applyEpRunContribution(maxE.endScore, bMax, 'p', pCount);
  return {
    min: minP.sum + minE.sum,
    max: maxE.sum + maxP.sum
  };
}

function groupedSatTokens(prev, eCount, pCount) {
  const out = [];
  const push = (c, len) => {
    if (len <= 0) return;
    if (out.length && out[out.length - 1].c === c) out[out.length - 1].len += len;
    else out.push({ c, len });
  };

  if (prev === 'e' && eCount > 0) {
    push('e', eCount);
    push('p', pCount);
    return out;
  }
  if (prev === 'p' && pCount > 0) {
    push('p', pCount);
    push('e', eCount);
    return out;
  }

  push('e', eCount);
  push('p', pCount);
  return out;
}

const canonicalEpMemoGlobal = new Map();

function solveCanonicalEpBlock(startScore, bMax, eCount, pCount, targetSum) {
  const globalKey = `${startScore}|${bMax}|${eCount}|${pCount}|${targetSum}`;
  if (canonicalEpMemoGlobal.has(globalKey)) return canonicalEpMemoGlobal.get(globalKey);

  const memo = new Map();

  function solve(eLeft, pLeft, score, target, prev) {
    const key = `${eLeft}|${pLeft}|${score}|${target}|${prev}`;
    if (memo.has(key)) {
      const got = memo.get(key);
      return got === false ? null : got;
    }

    let ans = null;

    if (eLeft === 0 && pLeft === 0) {
      ans = target === 0 ? makeCandidate([]) : null;
      memo.set(key, ans || false);
      return ans;
    }

    if (score === bMax) {
      const rem = eLeft + pLeft;
      ans = target === rem * bMax ? makeCandidate(groupedSatTokens(prev, eLeft, pLeft)) : null;
      memo.set(key, ans || false);
      return ans;
    }

    const { min, max } = epContributionBounds(score, bMax, eLeft, pLeft);
    if (target < min || target > max) {
      memo.set(key, false);
      return null;
    }

    if (eLeft > 0) {
      const nextScore = Math.min(score + 2, bMax);
      const child = solve(eLeft - 1, pLeft, nextScore, target - nextScore, 'e');
      if (child) ans = betterCandidate(ans, prependCandidateChar(child, 'e'));
    }

    if (pLeft > 0) {
      const nextScore = Math.min(score + 1, bMax);
      const child = solve(eLeft, pLeft - 1, nextScore, target - nextScore, 'p');
      if (child) ans = betterCandidate(ans, prependCandidateChar(child, 'p'));
    }

    memo.set(key, ans || false);
    return ans;
  }

  const solved = solve(eCount, pCount, startScore, targetSum, '');
  const result = solved ? solved.tokens : groupedSatTokens('', eCount, pCount);
  canonicalEpMemoGlobal.set(globalKey, result);
  return result;
}

function canonicalCompress(seq) {
  const n = seq.length;
  if (!n) return { text: '', html: '' };

  const { bMax, gCap, nCap, bCap, mCap } = calcCaps(n);
  let currentComboScore = bMax;
  const parts = [];
  const htmlParts = [];

  const pushPart = (text, hit) => {
    if (!text) return;
    parts.push(text);
    htmlParts.push(`<span class="token${hit ? ' hit' : ''}">${escapeHtml(text)}</span>`);
  };

  const pushColoredRun = (c, len) => {
    if (len <= 0) return;
    if (c === 'e' || c === 'p') {
      const a = c === 'e' ? 2 : 1;
      let uncapped = 0;
      if (currentComboScore < bMax) {
        uncapped = ((bMax - 1 - currentComboScore) / a) | 0;
        if (uncapped < 0) uncapped = 0;
        if (uncapped > len) uncapped = len;
      }
      const capped = len - uncapped;
      if (uncapped) pushPart(formatRunChar(c, uncapped), false);
      if (capped) pushPart(formatRunChar(c, capped), true);
      currentComboScore = Math.min(currentComboScore + a * len, bMax);
      return;
    }

    if (c === 'g') currentComboScore = Math.min(currentComboScore, gCap);
    else if (c === 'n') currentComboScore = Math.min(currentComboScore, nCap);
    else if (c === 'b') currentComboScore = Math.min(currentComboScore, bCap);
    else if (c === 'm') currentComboScore = Math.min(currentComboScore, mCap);
    pushPart(formatRunChar(c, len), false);
  };

  for (let i = 0; i < n;) {
    const c = seq[i];

    if (c === 'e' || c === 'p') {
      let j = i;
      let eCount = 0;
      let pCount = 0;
      let blockSum = 0;
      let blockScore = currentComboScore;

      while (j < n && (seq[j] === 'e' || seq[j] === 'p')) {
        const ch = seq[j];
        if (ch === 'e') eCount++;
        else pCount++;
        if (ch === 'e') blockScore = Math.min(blockScore + 2, bMax);
        else blockScore = Math.min(blockScore + 1, bMax);
        blockSum += blockScore;
        j++;
      }

      const tokens = solveCanonicalEpBlock(currentComboScore, bMax, eCount, pCount, blockSum);
      for (const t of tokens) pushColoredRun(t.c, t.len);
      i = j;
      continue;
    }

    let j = i + 1;
    while (j < n && seq[j] === c) j++;
    pushColoredRun(c, j - i);
    i = j;
  }

  return { text: parts.join(''), html: htmlParts.join('') };
}
function calculateScoreDetailed(input) {
  input = String(input).toLowerCase();
  const noteAmount = input.length;
  const emptyResult = {
    noteAmount: 0,
    maxCombo: 0,
    finalScore: 0,
    counts: { e: 0, p: 0, g: 0, n: 0, b: 0, m: 0 },
    comboMult: 0,
    totalAccScore: 0,
    totalComboScore: 0,
    bMax: 0
  };
  if (!noteAmount) return emptyResult;

  const { bMax, gCap, nCap, bCap, mCap } = calcCaps(noteAmount);
  const counts = { e: 0, p: 0, g: 0, n: 0, b: 0, m: 0 };
  const scoreMap = { e: 1000000, p: 990000, g: 600000, n: 300000, b: 150000, m: 0 };

  if (noteAmount < 100000) {
    let totalAccScore = 0;
    let totalComboScore = 0;
    let maxCombo = 0;
    let currentCombo = 0;
    let prevLoss = 0;
    let currentComboScore = bMax;
    const realtimeScores = [];

    for (let i = 0; i < noteAmount; i++) {
      const judge = input[i];
      if (!(judge in scoreMap)) continue;
      const n = i + 1;

      counts[judge]++;
      totalAccScore += scoreMap[judge];

      if (judge === 'e' || judge === 'p' || judge === 'g' || judge === 'n') {
        currentCombo++;
        if (currentCombo > maxCombo) maxCombo = currentCombo;
      } else {
        currentCombo = 0;
      }

      switch (judge) {
        case 'e':
          currentComboScore += 2;
          if (currentComboScore > bMax) currentComboScore = bMax;
          break;
        case 'p':
          currentComboScore += 1;
          if (currentComboScore > bMax) currentComboScore = bMax;
          break;
        case 'g':
          if (currentComboScore > gCap) currentComboScore = gCap;
          break;
        case 'n':
          if (currentComboScore > nCap) currentComboScore = nCap;
          break;
        case 'b':
          if (currentComboScore > bCap) currentComboScore = bCap;
          break;
        case 'm':
          if (currentComboScore > mCap) currentComboScore = mCap;
          break;
      }

      totalComboScore += currentComboScore;

      if (judge !== 'e' && (noteAmount - n) * 2 < bMax - currentComboScore) {
        const tillFull = Math.ceil((bMax - currentComboScore) / 2);
        totalComboScore += prevLoss;
        prevLoss = (
          2 * (bMax - currentComboScore) -
          2 * (noteAmount + 1 - n + tillFull)
        ) * (n + tillFull - noteAmount) / 2;
        totalComboScore -= prevLoss;
        if (totalComboScore < 0) totalComboScore = 0;
      }

      const apBonusNow = /^[ep]+$/i.test(input.slice(0, n)) ? 5000 * n / noteAmount : 0;
      const accScoreNow = totalAccScore / noteAmount;
      const comboMultNow = totalComboScore / (n * bMax);
      const comboBonusNow = 5000 * maxCombo / noteAmount;
      const finalScoreNow =
        Math.floor(accScoreNow * (0.4 + 0.6 * comboMultNow)) +
        Math.floor(comboBonusNow) +
        Math.floor(apBonusNow);

      realtimeScores.push(`${n}\t${finalScoreNow}`);
    }

    $('devBox').textContent = `当前判定序列大小\t实时分数\n${realtimeScores.join('\n')}`;

    const apBonus = /^[ep]+$/i.test(input) ? 5000 : 0;
    const accScore = totalAccScore / noteAmount;
    const comboMult = totalComboScore / (noteAmount * bMax);
    const comboBonus = 5000 * maxCombo / noteAmount;

    return {
      noteAmount,
      maxCombo,
      finalScore: engine ? engine.calculateScore(input) : Math.floor(accScore * (0.4 + 0.6 * comboMult)) + Math.floor(comboBonus) + apBonus,
      counts,
      comboMult,
      totalAccScore,
      totalComboScore,
      bMax
    };
  }

  let totalAccScore = 0;
  let totalComboScore = 0;
  let currentComboScore = bMax;
  let maxCombo = 0;
  let combo = 0;
  let allEP = true;
  $('devBox').textContent = '判定数量过大，已跳过中间分数输出，仅计算最终分数。';

  for (let i = 0; i < noteAmount;) {
    const c = input.charCodeAt(i);
    let j = i + 1;
    while (j < noteAmount && input.charCodeAt(j) === c) j++;
    const len = j - i;

    switch (c) {
      case 101: {
        counts.e += len;
        totalAccScore += 1000000 * len;
        combo += len;
        if (combo > maxCombo) maxCombo = combo;
        if (currentComboScore < bMax) {
          const u = Math.min(len, ((bMax - 1 - currentComboScore) / 2) | 0);
          totalComboScore += u ? u * (2 * (currentComboScore + 2) + (u - 1) * 2) / 2 : 0;
          totalComboScore += (len - u) * bMax;
        } else {
          totalComboScore += len * bMax;
        }
        currentComboScore += len * 2;
        if (currentComboScore > bMax) currentComboScore = bMax;
        break;
      }
      case 112: {
        counts.p += len;
        totalAccScore += 990000 * len;
        combo += len;
        if (combo > maxCombo) maxCombo = combo;
        if (currentComboScore < bMax) {
          const u = Math.min(len, bMax - 1 - currentComboScore);
          totalComboScore += u ? u * (2 * (currentComboScore + 1) + (u - 1)) / 2 : 0;
          totalComboScore += (len - u) * bMax;
        } else {
          totalComboScore += len * bMax;
        }
        currentComboScore += len;
        if (currentComboScore > bMax) currentComboScore = bMax;
        break;
      }
      case 103:
        counts.g += len;
        totalAccScore += 600000 * len;
        combo += len;
        if (combo > maxCombo) maxCombo = combo;
        if (currentComboScore > gCap) currentComboScore = gCap;
        totalComboScore += len * currentComboScore;
        allEP = false;
        break;
      case 110:
        counts.n += len;
        totalAccScore += 300000 * len;
        combo += len;
        if (combo > maxCombo) maxCombo = combo;
        if (currentComboScore > nCap) currentComboScore = nCap;
        totalComboScore += len * currentComboScore;
        allEP = false;
        break;
      case 98:
        counts.b += len;
        totalAccScore += 150000 * len;
        combo = 0;
        if (currentComboScore > bCap) currentComboScore = bCap;
        totalComboScore += len * currentComboScore;
        allEP = false;
        break;
      case 109:
        counts.m += len;
        combo = 0;
        if (currentComboScore > mCap) currentComboScore = mCap;
        totalComboScore += len * currentComboScore;
        allEP = false;
        break;
      default:
        combo = 0;
        allEP = false;
        break;
    }
    i = j;
  }

  if (currentComboScore < bMax) {
    totalComboScore += (1 - (bMax - currentComboScore - 1) ** 2) / 4;
    if (totalComboScore < 0) totalComboScore = 0;
  }

  const comboMult = totalComboScore / (noteAmount * bMax);
  return {
    noteAmount,
    maxCombo,
    finalScore: engine ? engine.calculateScore(input) : 0,
    counts,
    comboMult,
    totalAccScore,
    totalComboScore,
    bMax
  };
}

function expandSequenceExpression(raw) {
  let tmp = '';
  let inAngle = false;
  for (const ch of raw) {
    if (ch === '<') inAngle = true;
    if (ch === '>') inAngle = false;
    if (ch === ',' && !inAngle) continue;
    tmp += ch;
  }

  const input = tmp.trim().toLowerCase()
    .replace(/[^espgnbm{}\[\]()<>0-9,]/g, '')
    .replace(/s/g, 'e');

  const randInt = (n) => Math.floor(Math.random() * n);
  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  const readNumber = (s, i) => {
    let j = i, num = '';
    while (j < s.length && /[0-9]/.test(s[j])) num += s[j++];
    return [num === '' ? null : parseInt(num, 10), j];
  };
  const findMatch = (s, i, openCh, closeCh) => {
    let d = 0;
    for (let k = i; k < s.length; k++) {
      if (s[k] === openCh) d++;
      else if (s[k] === closeCh) {
        d--;
        if (d === 0) return k;
      }
    }
    return -1;
  };

  const evalExpr = (s, i = 0, stop = null) => {
    let out = '';
    while (i < s.length) {
      const ch = s[i];
      if (stop && ch === stop) return [out, i + 1];

      if ('epgnbm'.includes(ch)) {
        let [n, j] = readNumber(s, i + 1);
        if (n === 0) { i = j; continue; }
        out += n == null ? ch : ch.repeat(n);
        i = n == null ? i + 1 : j;
        continue;
      }

      if (ch === '[' || ch === '(' || ch === '{' || ch === '<') {
        const pairs = { '[': ']', '(': ')', '{': '}', '<': '>' };
        const j = findMatch(s, i, ch, pairs[ch]);
        if (j < 0) { i++; continue; }

        const innerRaw = s.slice(i + 1, j);
        let [n, k] = readNumber(s, j + 1);
        if (n === 0) { i = k; continue; }
        if (n == null) n = 1;

        if (ch === '[') {
          const [once] = evalExpr(innerRaw, 0, null);
          out += shuffle(once.split('')).join('').repeat(n);
        } else if (ch === '(') {
          const [once] = evalExpr(innerRaw, 0, null);
          out += once.repeat(n);
        } else if (ch === '{') {
          let acc = '';
          for (let t = 0; t < n; t++) {
            const [piece] = evalExpr(innerRaw, 0, null);
            acc += piece;
          }
          out += acc;
        } else if (ch === '<') {
          let acc = '';
          const isList = innerRaw.includes(',');
          if (isList) {
            const items = innerRaw.split(',');
            acc = n > items.length ? shuffle(items.slice()).join('') : shuffle(items.slice()).slice(0, n).join('');
          } else {
            const chars = innerRaw.split('');
            if (n > chars.length) {
              acc = shuffle(chars.slice()).join('');
            } else {
              for (let t = 0; t < n; t++) acc += chars[randInt(chars.length)];
            }
          }
          out += acc;
        }
        i = k;
        continue;
      }
      i++;
    }
    return [out, i];
  };

  const [expanded] = evalExpr(input, 0, null);
  return expanded.replace(/[^epgnbm]/g, '');
}

window.calculateFromInput = function calculateFromInput() {
  const finalOutput = expandSequenceExpression($('keyInput').value || '');
  if (!finalOutput) return;
  const result = calculateScoreDetailed(finalOutput);

  $('totalNotes').innerText = `总音符数：${result.noteAmount}`;
  $('maxCombo').innerText = `最大连击数：${result.maxCombo}`;
  $('score').innerText = `最终得分：${result.finalScore}`;
  $('detail').innerText = `各判定数量：e:${result.counts.e}, p:${result.counts.p}, g:${result.counts.g}, n:${result.counts.n}, b:${result.counts.b}, m:${result.counts.m}`;
  $('comboMult').innerText = `连击倍率：${result.comboMult.toFixed(6)}`;
  $('totalAccScore').innerText = `总准度分：${result.totalAccScore}`;
  $('totalComboScore').innerText = `总连击分：${result.totalComboScore}`;
  $('bMax').innerText = `bMax值：${result.bMax}`;
  $('result').style.display = 'block';
};

function setProgress(stats) {
  const ratio = stats.rootTotal > 0 ? Math.min(1, stats.rootDone / stats.rootTotal) : 0;
  $('progressBar').style.width = `${(ratio * 100).toFixed(3)}%`;
  $('progressText').textContent = `近似根分支进度 ${(ratio * 100).toFixed(3)}% · 已访问节点 ${Math.floor(stats.visited).toLocaleString()} · 当前深度 ${stats.depth}`;
}

function addResult(seq) {
  const compressed = canonicalCompress(seq);
  if (!compressed.text || seenCompressed.has(compressed.text)) return;
  seenCompressed.add(compressed.text);
  foundCount += 1;
  $('foundCount').textContent = String(foundCount);

  const score = engine.calculateScore(seq);
  const item = document.createElement('div');
  item.className = 'result-item';
  item.innerHTML = `
    <div class="result-head">
      <span>#${foundCount}</span>
      <span>score ${score}</span>
      <span>len ${seq.length}</span>
      <span>compressed ${compressed.text.length}</span>
    </div>
    <div class="result-seq">${compressed.html}</div>
  `;
  $('results').prepend(item);
}

function stopLoop() {
  running = false;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
}

function loop() {
  if (!running || !searcher) return;
  const t0 = performance.now();
  let lastStats = searcher.stats();

  while (running && performance.now() - t0 < 14) {
    const step = searcher.step(16000);
    lastStats = step;
    if (step.result) addResult(step.result);
    if (step.done) {
      stopLoop();
      $('searchState').textContent = '已完成';
      break;
    }
  }

  setProgress(lastStats);
  if (running) rafId = requestAnimationFrame(loop);
}

function initSearchUI() {
  $('startBtn').addEventListener('click', () => {
    const noteCount = Number($('noteCount').value);
    const targetScore = Number($('targetScore').value);
    if (!Number.isInteger(noteCount) || noteCount <= 0) {
      $('searchState').textContent = '物量必须是正整数';
      return;
    }
    if (!Number.isInteger(targetScore) || targetScore < 0) {
      $('searchState').textContent = '目标分数必须是非负整数';
      return;
    }

    try {
      stopLoop();
      searcher = engine.createSearcher(noteCount, targetScore);
      foundCount = 0;
      seenCompressed.clear();
      $('foundCount').textContent = '0';
      $('results').innerHTML = '';
      $('pauseBtn').textContent = '暂停';
      $('searchState').textContent = '搜索中（精确遍历 + 剪枝）';
      running = true;
      setProgress(searcher.stats());
      loop();
    } catch (err) {
      $('searchState').textContent = String(err.message || err);
    }
  });

  $('pauseBtn').addEventListener('click', () => {
    if (!searcher) return;
    running = !running;
    $('pauseBtn').textContent = running ? '暂停' : '继续';
    $('searchState').textContent = running ? '搜索中' : '已暂停';
    if (running) loop();
  });

  $('clearBtn').addEventListener('click', () => {
    stopLoop();
    searcher = null;
    foundCount = 0;
    seenCompressed.clear();
    $('foundCount').textContent = '0';
    $('results').innerHTML = '';
    $('progressText').textContent = '等待开始';
    $('progressBar').style.width = '0%';
    $('searchState').textContent = '已清空';
    $('pauseBtn').textContent = '暂停';
  });
}

function initSequenceScoreUI() {
  $('keyInput').placeholder =
`e/s: Exact p: Perfect g: Great n: Good b: Bad m: Miss
输入的内容后面跟数字会重复
定义后缀数字n=1时等同于不加,n=0时等同于没写这个运算
小括号是重复n次计算结果
中括号是随机排序内部的字符
定义[]n=([])n
大括号是重复计算n次并记录结果
<a,b,c>n用于随机从m中选择n个字符或从a,b,c中选择n个字符集，当n大于内部的长度时会返回随机排列后的结果
逗号在<>之外的逗号会被判定为无效字符
定义<epgn>=<e,p,g,n>
对于不属于
espgnbm0123456789{}[]()<,>
的字符会直接忽略，可以随便写
<Expr> ::= <Term> <Expr> | <Term>
<Term> ::= <Letter> <Number>?
     | "[" <Expr> "]" <Number>?
     | "{" <Expr> "}" <Number>?
     | "(" <Expr> ")" <Number>?
     | "<" <AngleContent> ">" <Number>?
<Letter> ::= "e" | "p" | "g" | "n" | "b" | "m"
<Number> ::= <Digit>+
<Digit> ::= "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"
<AngleContent> ::= <CharList> | <StringList>
<CharList> ::= <Letter>+
<StringList> ::= <String> ("," <String>)*
<String> ::= <Letter>+`;
}

(async function init() {
  initSequenceScoreUI();
  initSearchUI();
  try {
    engine = await createScoreEngine();
    $('engineStatus').textContent = 'WASM 已加载：算分与目标序列搜索可用';
  } catch (err) {
    $('engineStatus').textContent = `WASM 加载失败：${err.message || err}`;
  }
})();

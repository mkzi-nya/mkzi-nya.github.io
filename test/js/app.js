(function () {
  'use strict';

  const QUIZ_ORDER = ['SAS', 'SDS', 'SCL_90', 'MMPI', 'PDQ4', 'DES_II', 'GSES', 'HCL_32', 'PASS'];
  const DATA = window.QUIZ_DATA || {};
  const app = document.getElementById('app');
  const modalRoot = document.getElementById('modalRoot');
  const themeToggle = document.getElementById('themeToggle');
  const brandHome = document.getElementById('brandHome');

  const STORE_PREFIX = 'scale-web:';
  const THEME_KEY = STORE_PREFIX + 'theme';

  let current = {
    quizId: null,
    quiz: null,
    answers: {},
    gender: 'male',
    startTime: Date.now(),
    saveTimer: null,
    shortcutIndex: 0,
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function cleanDisplayText(value) {
    return String(value ?? '')
      .replace(/该量表包含\d+个项目，其中包含一些反向计分的题目。?/g, '')
      .replace(/对反向计分的题目[^。]*。?/g, '')
      .replace(/计算总分后乘以[^。]*。?/g, '')
      .trim();
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function round(n, digits = 1) {
    const k = 10 ** digits;
    return Math.round((Number(n) + Number.EPSILON) * k) / k;
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function formatTime(isoOrMs) {
    if (!isoOrMs) return '未知时间';
    const d = typeof isoOrMs === 'number' ? new Date(isoOrMs) : new Date(isoOrMs);
    if (Number.isNaN(d.getTime())) return '未知时间';
    return d.toLocaleString('zh-CN', { hour12: false });
  }

  function query() {
    return new URLSearchParams(location.search);
  }

  function getQuizIdFromQuery() {
    const p = query();
    return p.get('quiz') || p.get('id') || p.get('xx') || '';
  }

  function setRoute(params) {
    const p = new URLSearchParams();
    if (params.quiz) p.set('quiz', params.quiz);
    if (params.view) p.set('view', params.view);
    if (params.mode) p.set('mode', params.mode);
    const url = location.pathname + (p.toString() ? '?' + p.toString() : '');
    history.pushState({}, '', url);
    renderFromRoute();
  }

  function replaceRoute(params) {
    const p = new URLSearchParams();
    if (params.quiz) p.set('quiz', params.quiz);
    if (params.view) p.set('view', params.view);
    if (params.mode) p.set('mode', params.mode);
    const url = location.pathname + (p.toString() ? '?' + p.toString() : '');
    history.replaceState({}, '', url);
  }

  function draftKey(id) { return `${STORE_PREFIX}draft:${id}`; }
  function resultKey(id) { return `${STORE_PREFIX}result:${id}`; }

  function readStore(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeStore(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function removeStore(key) {
    localStorage.removeItem(key);
  }

  function getQuestionId(question, index) {
    return question.id !== undefined && question.id !== null ? question.id : index + 1;
  }

  function getQuestionById(quiz, qid) {
    const num = Number(qid);
    return quiz.questions.find((q, index) => Number(getQuestionId(q, index)) === num);
  }

  function getOptions(quiz, question) {
    return question.options || quiz.defaultOptions || [];
  }

  function getOptionValue(option, index) {
    if (option.value !== undefined) return option.value;
    if (option.score !== undefined) return option.score;
    return index;
  }

  function parseNumber(value, fallback = 0) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function scoreAnswer(answer, question, quiz) {
    let score = Array.isArray(answer)
      ? answer.reduce((sum, item) => sum + parseNumber(item), 0)
      : parseNumber(answer);

    if (question && question.reverse) {
      const options = getOptions(quiz, question);
      if (options.length) {
        const scores = options.map((o, i) => parseNumber(o.score !== undefined ? o.score : getOptionValue(o, i)));
        score = Math.max(...scores) + Math.min(...scores) - score;
      }
    }
    return score;
  }

  function isAnswered(question, answer) {
    if (question.type === 'special') {
      const len = (question.subQuestions || []).length;
      return Array.isArray(answer) && answer.length >= len && answer.slice(0, len).every(v => v !== undefined && v !== null && v !== '');
    }
    return answer !== undefined && answer !== null && !(typeof answer === 'string' && answer.trim() === '') && !(Array.isArray(answer) && answer.length === 0);
  }

  function answeredCount(quiz, answers) {
    return quiz.questions.reduce((count, q, index) => count + (isAnswered(q, answers[getQuestionId(q, index)]) ? 1 : 0), 0);
  }

  function validateAnswers(quiz, answers) {
    const missing = [];
    quiz.questions.forEach((q, index) => {
      if (q.required === false) return;
      const id = getQuestionId(q, index);
      if (!isAnswered(q, answers[id])) missing.push(id);
    });
    return missing;
  }

  function applyGenericScoring(quiz, answers, result) {
    result.rawScore = Object.entries(answers).reduce((sum, [qid, value]) => {
      const q = getQuestionById(quiz, qid);
      return sum + scoreAnswer(value, q, quiz);
    }, 0);

    if (Array.isArray(quiz.subscales)) {
      quiz.subscales.forEach(sub => {
        result.subscores[sub.name] = sub.questions.reduce((sum, qid) => {
          const q = getQuestionById(quiz, qid);
          return sum + scoreAnswer(answers[qid], q, quiz);
        }, 0);
      });
    }

    result.scaledScore = result.rawScore;
    return result;
  }

  function applySasOrSdsScoring(quiz, answers, result) {
    result.rawScore = Object.entries(answers).reduce((sum, [qid, value]) => {
      const q = getQuestionById(quiz, qid);
      return sum + scoreAnswer(value, q, quiz);
    }, 0);
    result.scaledScore = Math.round(result.rawScore * 1.25);
    return result;
  }

  function applyDesScoring(quiz, answers, result) {
    result.rawScore = Object.entries(answers).reduce((sum, [, value]) => sum + parseNumber(value), 0);
    const average = result.rawScore / quiz.questions.length;
    result.scaledScore = round(average, 1);
    result.extra = {
      averageScore: round(average, 1),
    };
    return result;
  }

  function scl90Level(avg) {
    if (avg < 2.0) return '正常';
    if (avg < 3.0) return '轻度';
    if (avg < 4.0) return '中度';
    return '重度';
  }

  function scl90Description(name, level) {
    const map = {
      '躯体化': { '正常': '躯体化症状在正常范围内', '轻度': '存在一些躯体不适感，但程度较轻', '中度': '躯体化症状较为明显，可能影响日常生活', '重度': '躯体化症状严重，可能需要专业医疗干预' },
      '强迫症状': { '正常': '强迫症状在正常范围内', '轻度': '存在一些强迫思维或行为，但程度较轻', '中度': '强迫症状较为明显，可能影响日常活动', '重度': '强迫症状严重，可能明显影响生活功能' },
      '人际关系敏感': { '正常': '人际关系敏感度在正常范围内', '轻度': '在人际交往中可能有轻度敏感', '中度': '人际敏感较明显，可能影响社交', '重度': '人际关系敏感严重，可能导致明显社交困难' },
      '抑郁': { '正常': '抑郁症状在正常范围内', '轻度': '存在一些抑郁情绪，但程度较轻', '中度': '抑郁症状较明显，可能影响情绪和动力', '重度': '抑郁症状严重，建议寻求专业帮助' },
      '焦虑': { '正常': '焦虑症状在正常范围内', '轻度': '存在一些焦虑感，但程度较轻', '中度': '焦虑症状较明显，可能影响日常状态', '重度': '焦虑症状严重，可能需要专业干预' },
      '敌对': { '正常': '敌对症状在正常范围内', '轻度': '存在一些烦躁或敌对情绪', '中度': '敌对情绪较明显，可能影响人际关系', '重度': '敌对症状严重，可能需要情绪管理干预' },
      '恐怖': { '正常': '恐怖症状在正常范围内', '轻度': '存在一些恐惧体验，但程度较轻', '中度': '恐怖症状较明显，可能出现回避行为', '重度': '恐怖症状严重，可能明显限制生活' },
      '偏执': { '正常': '偏执症状在正常范围内', '轻度': '存在一些猜疑或敏感想法', '中度': '偏执症状较明显，可能影响判断和关系', '重度': '偏执症状严重，建议专业评估' },
      '精神病性': { '正常': '精神病性症状在正常范围内', '轻度': '存在一些精神病性症状，但程度较轻', '中度': '精神病性症状较为明显，可能需要关注', '重度': '精神病性症状严重，可能需要专业心理干预' },
    };
    return map[name]?.[level] || '';
  }

  function applyScl90Scoring(quiz, answers, result) {
    applyGenericScoring(quiz, answers, result);
    const legacyDivisors = {
      '躯体化': 12,
      '强迫症状': 10,
      '人际关系敏感': 9,
      '抑郁': 13,
      '焦虑': 10,
      '敌对': 6,
      '恐怖': 7,
      '偏执': 6,
      '精神病性': 10,
    };
    result.dimensions = {};
    Object.entries(result.subscores).forEach(([name, score]) => {
      const realCount = quiz.subscales.find(s => s.name === name)?.questions.length || legacyDivisors[name] || 1;
      const divisor = legacyDivisors[name] || realCount;
      const avg = score / divisor;
      const level = scl90Level(avg);
      result.dimensions[name] = {
        score,
        divisor,
        itemCount: realCount,
        average: round(avg, 2),
        level,
        description: scl90Description(name, level),
      };
    });
    return result;
  }

  function specialItemScore(question, answer) {
    if (!question || question.type !== 'special') return answer === 1 ? 1 : 0;
    const yesCount = Array.isArray(answer) ? answer.reduce((sum, v) => sum + (Number(v) === 1 ? 1 : 0), 0) : 0;
    return yesCount >= (question.threshold || 1) ? 1 : 0;
  }

  function applyPDQ4Scoring(quiz, answers, result) {
    const rules = quiz.scoring?.scoringRules || {};
    result.pdqScores = {};
    Object.entries(rules).forEach(([key, type]) => {
      let score = 0;
      (type.items || []).forEach(qid => {
        const q = getQuestionById(quiz, qid);
        if (q?.type === 'special') {
          score += specialItemScore(q, answers[qid]);
        } else if (Number(answers[qid]) === 1) {
          score += 1;
        }
      });
      const threshold = type.threshold ?? null;
      result.subscores[type.name] = score;
      result.pdqScores[key] = {
        name: type.name,
        score,
        threshold,
        reached: threshold !== null ? score >= threshold : false,
        totalItems: (type.items || []).length,
      };
    });

    const conceal = quiz.scoring?.concealmentScale;
    if (conceal?.items) {
      const c12 = 1 - parseNumber(answers[12]);
      const c25 = 1 - parseNumber(answers[25]);
      const c38 = 1 - parseNumber(answers[38]);
      const c51 = parseNumber(answers[51]);
      result.concealmentScale = {
        name: '掩饰量表',
        score: c12 + c25 + c38 + c51,
      };
    }

    result.rawScore = Object.values(result.subscores).reduce((sum, score) => sum + score, 0);
    result.scaledScore = result.rawScore;
    return result;
  }

  function calculateTScore(rawScore, mean, sd) {
    return Math.round(50 + 10 * (rawScore - mean) / sd);
  }

  function countTrueFalseScale(scale, answers) {
    let raw = 0;
    (scale.trueAnswers || []).forEach(qid => { if (Number(answers[qid]) === 1) raw++; });
    (scale.falseAnswers || []).forEach(qid => { if (Number(answers[qid]) === 0) raw++; });
    return raw;
  }

  function applyMMPIScoring(quiz, answers, result, gender) {
    const rules = quiz.scoringRules;
    const selectedGender = rules.norms[gender] ? gender : 'male';
    const norms = rules.norms[selectedGender];
    result.mmpiScores = { validity: {}, clinical: {}, additional: {}, gender: selectedGender };

    if (rules.validity?.Q) {
      let qScore = 0;
      (rules.validity.Q.pairs || []).forEach(pair => {
        const a = answers[pair[0]];
        const b = answers[pair[1]];
        if (a !== undefined && b !== undefined && Number(a) === Number(b)) qScore++;
      });
      result.mmpiScores.validity.Q = { name: rules.validity.Q.name || '疑问分数', rawScore: qScore, description: rules.validity.Q.description };
    }

    ['L', 'F', 'K'].forEach(key => {
      const scale = rules.validity?.[key];
      const norm = norms[key];
      if (!scale || !norm) return;
      const rawScore = countTrueFalseScale(scale, answers);
      const tScore = calculateTScore(rawScore, norm.mean, norm.sd);
      result.mmpiScores.validity[key] = { name: scale.name, rawScore, tScore, description: scale.description };
      if (key === 'K') result.mmpiScores.kScore = rawScore;
    });

    Object.entries(rules.clinical || {}).forEach(([key, scale]) => {
      const rawScore = countTrueFalseScale(scale, answers);
      const norm = norms[key];
      const out = { name: scale.name, rawScore, description: scale.description };
      if (norm) out.tScore = calculateTScore(rawScore, norm.mean, norm.sd);
      if (scale.kCorrection && result.mmpiScores.kScore !== undefined) {
        const correctedRaw = rawScore + Math.round(result.mmpiScores.kScore * scale.kCorrection);
        const correctedKey = `${key}+${scale.kCorrection}K`;
        const correctedNorm = norms[correctedKey];
        if (correctedNorm) {
          out.kCorrected = {
            rawScore: correctedRaw,
            tScore: calculateTScore(correctedRaw, correctedNorm.mean, correctedNorm.sd),
            coefficient: scale.kCorrection,
          };
        }
      }
      result.mmpiScores.clinical[key] = out;
    });

    Object.entries(rules.additional || {}).forEach(([key, scale]) => {
      const rawScore = countTrueFalseScale(scale, answers);
      const norm = norms[key];
      result.mmpiScores.additional[key] = {
        name: scale.name,
        rawScore,
        tScore: norm ? calculateTScore(rawScore, norm.mean, norm.sd) : undefined,
        description: scale.description,
      };
    });

    const clinicalTScores = Object.values(result.mmpiScores.clinical)
      .map(s => s.tScore)
      .filter(t => t !== undefined);
    result.rawScore = clinicalTScores.length ? Math.round(clinicalTScores.reduce((sum, t) => sum + t, 0) / clinicalTScores.length) : 0;
    result.scaledScore = result.rawScore;
    return result;
  }

  function calculateResult(quizId, quiz, answers, startTime, gender) {
    const end = Date.now();
    const result = {
      quizId,
      rawScore: 0,
      scaledScore: 0,
      subscores: {},
      timeTaken: Math.max(0, Math.round((end - (startTime || end)) / 60000)),
      answers: structuredCloneSafe(answers),
      gender,
      completedAt: nowISO(),
    };
    const title = quiz.title || '';
    if (title.includes('MMPI')) return applyMMPIScoring(quiz, answers, result, gender);
    if (title.includes('SAS')) return applySasOrSdsScoring(quiz, answers, result);
    if (title.includes('SDS')) return applySasOrSdsScoring(quiz, answers, result);
    if (title.includes('PDQ')) return applyPDQ4Scoring(quiz, answers, result);
    if (title.includes('DES')) return applyDesScoring(quiz, answers, result);
    if (title.includes('SCL-90')) return applyScl90Scoring(quiz, answers, result);
    return applyGenericScoring(quiz, answers, result);
  }

  function structuredCloneSafe(value) {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function interpretationScore(quiz, result) {
    const title = quiz.title || '';
    if (title.includes('SAS') || title.includes('SDS') || title.includes('DES')) return result.scaledScore;
    return result.rawScore;
  }

  function findInterpretation(quiz, result) {
    const ranges = quiz.scoring?.interpretations || quiz.interpretation;
    if (!Array.isArray(ranges)) return null;
    const score = interpretationScore(quiz, result);
    return ranges.find(r => score >= r.min && score <= r.max) || null;
  }

  function tScoreClass(t) {
    if (t === undefined || t === null) return '';
    if (t >= 70 || t <= 30) return 'bad';
    if ((t >= 60 && t < 70) || (t > 30 && t <= 40)) return 'warn';
    return 'ok';
  }

  function dimensionBadge(level) {
    if (level === '正常') return 'ok';
    if (level === '轻度') return 'warn';
    return 'bad';
  }

  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    const preferDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = saved || (preferDark ? 'dark' : 'light');
    document.documentElement.dataset.theme = theme;
    themeToggle.textContent = theme === 'dark' ? '亮色模式' : '暗色模式';
  }

  function toggleTheme() {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem(THEME_KEY, next);
    themeToggle.textContent = next === 'dark' ? '亮色模式' : '暗色模式';
  }

  function saveDraftSoon() {
    clearTimeout(current.saveTimer);
    current.saveTimer = setTimeout(saveDraft, 120);
  }

  function saveDraft() {
    if (!current.quizId || !current.quiz) return;
    writeStore(draftKey(current.quizId), {
      quizId: current.quizId,
      answers: current.answers,
      gender: current.gender,
      startTime: current.startTime,
      updatedAt: nowISO(),
    });
    const el = document.getElementById('saveStatus');
    if (el) el.textContent = '已自动保存 ' + new Date().toLocaleTimeString('zh-CN', { hour12: false });
  }

  function clearDraft(id) { removeStore(draftKey(id)); }
  function clearResult(id) { removeStore(resultKey(id)); }

  function quizTitle(id) {
    return DATA[id]?.title || id;
  }

  function renderHome() {
    current = { quizId: null, quiz: null, answers: {}, gender: 'male', startTime: Date.now(), saveTimer: null, shortcutIndex: 0 };
    const cards = QUIZ_ORDER.filter(id => DATA[id]).map(id => {
      const q = DATA[id];
      const draft = readStore(draftKey(id));
      const savedResult = readStore(resultKey(id));
      const progress = draft ? `${answeredCount(q, draft.answers || {})}/${q.questions.length}` : `${q.questions.length}题`;
      return `<article class="quiz-card">
        <h2>${escapeHtml(q.title || id)}</h2>
        <p>${escapeHtml(cleanDisplayText(q.description || q.instruction || ''))}</p>
        <div class="quiz-meta">
          <span class="meta-pill">${escapeHtml(progress)}</span>
          ${q.timeLimit ? `<span class="meta-pill">建议 ${escapeHtml(q.timeLimit)} 分钟</span>` : ''}
          ${savedResult ? `<span class="meta-pill">有上次结果</span>` : ''}
          ${draft && !savedResult ? `<span class="meta-pill">有未完成草稿</span>` : ''}
        </div>
        <div class="card-actions">
          <button class="btn primary small" data-action="start" data-id="${escapeHtml(id)}">开始 / 继续</button>
          ${savedResult ? `<button class="btn small" data-action="view-result" data-id="${escapeHtml(id)}">上次结果</button>` : ''}
        </div>
      </article>`;
    }).join('');

    app.innerHTML = `<section class="hero">
      <h1>心理量表评估</h1>
      <p>请选择需要填写的量表。填写过程会自动保存，完成后可随时查看上次结果。</p>
    </section>
    <section class="quiz-grid">${cards}</section>`;

    app.querySelectorAll('[data-action="start"]').forEach(btn => btn.addEventListener('click', () => enterQuiz(btn.dataset.id)));
    app.querySelectorAll('[data-action="view-result"]').forEach(btn => btn.addEventListener('click', () => setRoute({ quiz: btn.dataset.id, view: 'result' })));
  }

  function enterQuiz(id) {
    const savedResult = readStore(resultKey(id));
    if (savedResult) {
      showSavedResultPrompt(id);
      return;
    }
    setRoute({ quiz: id });
  }

  function showSavedResultPrompt(id) {
    const saved = readStore(resultKey(id));
    const draft = readStore(draftKey(id));
    showModal({
      title: '检测到上次结果',
      body: `量表：${escapeHtml(quizTitle(id))}<br>完成时间：${escapeHtml(formatTime(saved?.createdAt || saved?.result?.completedAt))}<br>可以直接查看结果，也可以重新填写。`,
      actions: [
        { text: '显示上次结果', className: 'primary', onClick: () => { hideModal(); setRoute({ quiz: id, view: 'result' }); } },
        draft ? { text: '继续草稿', onClick: () => { hideModal(); setRoute({ quiz: id }); } } : null,
        { text: '重新填写', className: 'danger', onClick: () => { hideModal(); clearDraft(id); clearResult(id); setRoute({ quiz: id, mode: 'retake' }); } },
        { text: '取消', className: 'ghost', onClick: hideModal },
      ].filter(Boolean),
    });
  }

  function loadStateForForm(id) {
    const quiz = DATA[id];
    const draft = readStore(draftKey(id), {});
    current.quizId = id;
    current.quiz = quiz;
    current.answers = draft.answers || {};
    current.gender = draft.gender || 'male';
    current.startTime = draft.startTime || Date.now();
    current.shortcutIndex = Math.max(0, quiz.questions.findIndex((q, index) => !isAnswered(q, current.answers[getQuestionId(q, index)])));
    if (current.shortcutIndex < 0) current.shortcutIndex = 0;
  }

  function renderForm(id) {
    const quiz = DATA[id];
    if (!quiz) return renderNotFound(id);
    loadStateForForm(id);

    const p = query();
    if (readStore(resultKey(id)) && p.get('mode') !== 'retake' && p.get('view') !== 'result') {
      setTimeout(() => showSavedResultPrompt(id), 0);
    }

    const completed = answeredCount(quiz, current.answers);
    const pct = Math.round(completed / quiz.questions.length * 100);
    const genderSelect = (quiz.title || '').includes('MMPI') ? `<div class="select-line">
        <span class="muted">常模性别</span>
        <select id="genderSelect" aria-label="选择MMPI常模性别">
          <option value="male" ${current.gender === 'male' ? 'selected' : ''}>男性常模</option>
          <option value="female" ${current.gender === 'female' ? 'selected' : ''}>女性常模</option>
        </select>
      </div>` : '';

    app.innerHTML = `<section class="screen">
      <div class="screen-head">
        <div>
          <h1>${escapeHtml(quiz.title || id)}</h1>
          <div class="desc">${escapeHtml(cleanDisplayText(quiz.description || ''))}</div>
        </div>
        <div class="form-tools">
          ${genderSelect}
          <button class="btn danger" id="resetTopBtn" type="button">重置</button>
          <button class="btn" id="homeBtn" type="button">返回主页</button>
        </div>
      </div>
      ${quiz.instruction ? `<div class="notice">${escapeHtml(quiz.instruction)}</div>` : ''}
      <div class="sticky-tools">
        <div class="progress-card">
          <div class="progress-row">
            <span>填写进度：<strong id="progressText">${completed}/${quiz.questions.length}</strong></span>
            <span id="saveStatus">${readStore(draftKey(id)) ? '已恢复上次草稿' : '尚未保存'}</span>
          </div>
          <div class="progress-row shortcut-hint">
            <span>可按数字键 1、2、3、4… 快速选择当前题选项</span>
            <span>选择后自动跳到下一题</span>
          </div>
          <div class="bar" aria-hidden="true"><span id="progressBar" style="width:${pct}%"></span></div>
        </div>
      </div>
      <form id="quizForm">
        <div class="question-list">${quiz.questions.map((q, index) => renderQuestion(quiz, q, index, current.answers[getQuestionId(q, index)])).join('')}</div>
        <div class="form-footer">
          <button class="btn" type="button" id="saveNowBtn">保存草稿</button>
          <button class="btn danger" type="button" id="resetBtn">重置</button>
          <button class="btn primary" type="submit">提交并查看结果</button>
        </div>
      </form>
    </section>`;

    app.querySelector('#homeBtn').addEventListener('click', () => setRoute({}));
    const genderEl = app.querySelector('#genderSelect');
    if (genderEl) genderEl.addEventListener('change', () => { current.gender = genderEl.value; saveDraftSoon(); });
    app.querySelector('#saveNowBtn').addEventListener('click', saveDraft);
    app.querySelector('#resetBtn').addEventListener('click', () => confirmResetForm(id));
    app.querySelector('#resetTopBtn')?.addEventListener('click', () => confirmResetForm(id));
    app.querySelector('#quizForm').addEventListener('change', onFormChange);
    app.querySelector('#quizForm').addEventListener('submit', onFormSubmit);
  }

  function renderQuestion(quiz, q, index, answer) {
    const id = getQuestionId(q, index);
    const type = q.type || quiz.defaultQuestionType || 'radio';
    const answered = isAnswered(q, answer);
    if (type === 'special') {
      const sub = (q.subQuestions || []).map((text, i) => {
        const val = Array.isArray(answer) ? answer[i] : undefined;
        return `<div class="subq">
          <div><strong>${String.fromCharCode(97 + i)})</strong> ${escapeHtml(text)}</div>
          <div class="subq-actions">
            <label><input type="radio" name="q${escapeHtml(id)}_${i}" data-qid="${escapeHtml(id)}" data-sub="${i}" value="1" ${Number(val) === 1 ? 'checked' : ''}> 是</label>
            <label><input type="radio" name="q${escapeHtml(id)}_${i}" data-qid="${escapeHtml(id)}" data-sub="${i}" value="0" ${Number(val) === 0 ? 'checked' : ''}> 否</label>
          </div>
        </div>`;
      }).join('');
      return `<article class="question ${answered ? 'answered' : ''}" id="q-${escapeHtml(id)}" data-question-index="${index}" tabindex="-1">
        <div class="q-head"><span class="q-num">${index + 1}</span><div class="q-text">${escapeHtml(q.text || '')}</div></div>
        <div class="special-block">${sub}</div>
      </article>`;
    }

    const options = getOptions(quiz, q);
    const html = options.map((option, i) => {
      const value = getOptionValue(option, i);
      const checked = valuesEqual(answer, value) ? 'checked' : '';
      return `<label class="option">
        <input type="radio" name="q${escapeHtml(id)}" data-qid="${escapeHtml(id)}" value="${escapeHtml(value)}" ${checked}>
        <span>${escapeHtml(option.text || option.label || value)}</span>
      </label>`;
    }).join('');
    return `<article class="question ${answered ? 'answered' : ''}" id="q-${escapeHtml(id)}" data-question-index="${index}" tabindex="-1">
      <div class="q-head"><span class="q-num">${index + 1}</span><div class="q-text">${escapeHtml(q.text || '')}</div></div>
      <div class="options">${html}</div>
    </article>`;
  }

  function valuesEqual(a, b) {
    if (a === undefined || a === null) return false;
    const na = parseNumber(a, NaN);
    const nb = parseNumber(b, NaN);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na === nb;
    return String(a) === String(b);
  }

  function onFormChange(e) {
    const target = e.target;
    const qid = target.dataset.qid;
    if (!qid) return;
    if (target.dataset.sub !== undefined) {
      const q = getQuestionById(current.quiz, qid);
      const arr = Array.isArray(current.answers[qid]) ? [...current.answers[qid]] : Array((q?.subQuestions || []).length).fill(undefined);
      arr[Number(target.dataset.sub)] = parseNumber(target.value);
      current.answers[qid] = arr;
    } else {
      current.answers[qid] = parseNumber(target.value, target.value);
    }
    updateProgressUI();
    saveDraftSoon();
  }


  function handleAnswerShortcut(e) {
    if (!current.quiz || !document.getElementById('quizForm')) return;
    if (modalRoot.classList.contains('show')) return;
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const key = e.key;
    if (!/^[1-9]$/.test(key)) return;
    const target = e.target;
    const tag = target?.tagName;
    if (tag === 'SELECT' || tag === 'TEXTAREA' || target?.isContentEditable) return;

    const optionNumber = Number(key);
    const questionEl = getShortcutQuestion();
    if (!questionEl) return;
    const didAnswer = answerQuestionByNumber(questionEl, optionNumber);
    if (didAnswer) e.preventDefault();
  }

  function getShortcutQuestion() {
    const questions = Array.from(app.querySelectorAll('.question'));
    if (!questions.length) return null;

    const focusedQuestion = document.activeElement?.closest?.('.question');
    if (focusedQuestion && app.contains(focusedQuestion) && !focusedQuestion.classList.contains('answered')) {
      return focusedQuestion;
    }

    const indexedQuestion = Number.isInteger(current.shortcutIndex) ? questions[current.shortcutIndex] : null;
    if (indexedQuestion && !indexedQuestion.classList.contains('answered')) return indexedQuestion;

    const visible = questions
      .map(el => ({ el, rect: el.getBoundingClientRect() }))
      .filter(item => !item.el.classList.contains('answered') && item.rect.bottom > 96 && item.rect.top < window.innerHeight * 0.72)
      .sort((a, b) => Math.abs(a.rect.top - 128) - Math.abs(b.rect.top - 128));
    if (visible.length) return visible[0].el;

    return questions.find(el => !el.classList.contains('answered')) || questions[0];
  }

  function answerQuestionByNumber(questionEl, optionNumber) {
    const simpleInputs = Array.from(questionEl.querySelectorAll('.options input[type="radio"]'));
    if (simpleInputs.length) {
      const input = simpleInputs[optionNumber - 1];
      if (!input) return false;
      setRadioAndNotify(input);
      setTimeout(() => scrollToNextQuestion(questionEl), 80);
      return true;
    }

    const groups = new Map();
    questionEl.querySelectorAll('.special-block input[type="radio"]').forEach(input => {
      if (!groups.has(input.name)) groups.set(input.name, []);
      groups.get(input.name).push(input);
    });
    if (!groups.size) return false;

    let targetGroup = null;
    for (const group of groups.values()) {
      if (!group.some(input => input.checked)) {
        targetGroup = group;
        break;
      }
    }
    if (!targetGroup) targetGroup = Array.from(groups.values())[0];

    const input = targetGroup[optionNumber - 1];
    if (!input) return false;
    setRadioAndNotify(input);

    setTimeout(() => {
      const qid = input.dataset.qid;
      const question = getQuestionById(current.quiz, qid);
      if (question && isAnswered(question, current.answers[qid])) scrollToNextQuestion(questionEl);
    }, 80);
    return true;
  }

  function setRadioAndNotify(input) {
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function scrollToNextQuestion(questionEl) {
    updateProgressUI();
    const questions = Array.from(app.querySelectorAll('.question'));
    const index = questions.indexOf(questionEl);
    let next = questions.slice(index + 1).find(el => !el.classList.contains('answered'));
    if (!next) next = questions.find(el => !el.classList.contains('answered'));

    if (next) {
      current.shortcutIndex = questions.indexOf(next);
      next.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.setTimeout(() => {
        if (typeof next.focus === 'function') next.focus({ preventScroll: true });
      }, 120);
    } else {
      current.shortcutIndex = Math.max(0, questions.length - 1);
      document.activeElement?.blur?.();
      document.querySelector('.form-footer')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function updateProgressUI() {
    const total = current.quiz.questions.length;
    const completed = answeredCount(current.quiz, current.answers);
    const pct = Math.round(completed / total * 100);
    const progressText = document.getElementById('progressText');
    const progressBar = document.getElementById('progressBar');
    if (progressText) progressText.textContent = `${completed}/${total}`;
    if (progressBar) progressBar.style.width = pct + '%';

    current.quiz.questions.forEach((q, index) => {
      const id = getQuestionId(q, index);
      const el = document.getElementById('q-' + id);
      if (el) el.classList.toggle('answered', isAnswered(q, current.answers[id]));
    });
  }

  function onFormSubmit(e) {
    e.preventDefault();
    const missing = validateAnswers(current.quiz, current.answers);
    if (missing.length) {
      const first = missing[0];
      showModal({
        title: '还有题目未完成',
        body: `当前还有 ${missing.length} 题未作答。第一题未完成题号：${escapeHtml(first)}。`,
        actions: [
          { text: '定位到第一题', className: 'primary', onClick: () => { hideModal(); document.getElementById('q-' + first)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } },
          { text: '关闭', className: 'ghost', onClick: hideModal },
        ],
      });
      return;
    }

    saveDraft();
    const result = calculateResult(current.quizId, current.quiz, current.answers, current.startTime, current.gender);
    writeStore(resultKey(current.quizId), { quizId: current.quizId, result, answers: current.answers, gender: current.gender, createdAt: nowISO() });
    clearDraft(current.quizId);
    setRoute({ quiz: current.quizId, view: 'result' });
  }

  function confirmResetForm(id) {
    showModal({
      title: '清空当前填写？',
      body: '这会删除当前量表的本地草稿，并清空页面上的答案。已有结果不会被删除。',
      actions: [
        { text: '清空', className: 'danger', onClick: () => { hideModal(); clearDraft(id); current.answers = {}; current.startTime = Date.now(); renderForm(id); } },
        { text: '取消', className: 'ghost', onClick: hideModal },
      ],
    });
  }

  function renderResult(id) {
    const quiz = DATA[id];
    if (!quiz) return renderNotFound(id);
    const saved = readStore(resultKey(id));
    if (!saved?.result) {
      app.innerHTML = `<section class="screen"><div class="empty"><h1>没有可显示的上次结果</h1><p>该量表还没有完成记录。</p><p><button class="btn primary" id="startNoResult">开始填写</button> <button class="btn" id="homeNoResult">返回主页</button></p></div></section>`;
      app.querySelector('#startNoResult').addEventListener('click', () => setRoute({ quiz: id }));
      app.querySelector('#homeNoResult').addEventListener('click', () => setRoute({}));
      return;
    }
    const result = saved.result;
    const conclusion = findInterpretation(quiz, result);
    const interpScore = interpretationScore(quiz, result);

    app.innerHTML = `<section class="screen" id="resultScreen">
      <div class="screen-head">
        <div>
          <h1>${escapeHtml(quiz.title || id)} · 结果</h1>
          <div class="desc">完成时间：${escapeHtml(formatTime(saved.createdAt || result.completedAt))} · 用时：${escapeHtml(result.timeTaken ?? 0)} 分钟</div>
        </div>
        <div class="form-tools">
          <button class="btn" id="backToFormBtn">返回填写页</button>
          <button class="btn" id="homeBtn">主页</button>
        </div>
      </div>
      <div class="result-grid">
        <div class="stat"><div class="label">总分</div><div class="value">${escapeHtml(formatScore(result.rawScore))}</div></div>
        <div class="stat"><div class="label">参考分</div><div class="value">${escapeHtml(formatScore(result.scaledScore))}</div></div>
        <div class="stat"><div class="label">评估分</div><div class="value">${escapeHtml(formatScore(interpScore))}</div></div>
      </div>
      ${conclusion ? renderConclusion(conclusion) : `<div class="notice">当前分数暂无对应解释。</div>`}
      ${renderSpecialResultSections(quiz, result)}
      <div class="form-footer">
        <button class="btn primary" id="downloadBtn">下载结果截图</button>
        <button class="btn danger" id="retakeBtn">重新填写</button>
      </div>
    </section>`;

    app.querySelector('#homeBtn').addEventListener('click', () => setRoute({}));
    app.querySelector('#backToFormBtn').addEventListener('click', () => setRoute({ quiz: id, mode: 'retake' }));
    app.querySelector('#downloadBtn').addEventListener('click', () => downloadResultScreenshot(id));
    app.querySelector('#retakeBtn').addEventListener('click', () => {
      showModal({
        title: '重新填写？',
        body: '这会删除该量表的上次结果和草稿。',
        actions: [
          { text: '重新填写', className: 'danger', onClick: () => { hideModal(); clearDraft(id); clearResult(id); setRoute({ quiz: id, mode: 'retake' }); } },
          { text: '取消', className: 'ghost', onClick: hideModal },
        ],
      });
    });
  }

  function formatScore(value) {
    if (value === undefined || value === null || Number.isNaN(value)) return '-';
    return Number.isInteger(value) ? String(value) : String(round(value, 2));
  }

  function renderConclusion(c) {
    return `<section class="conclusion"><h2>${escapeHtml(c.level || '结果解释')}</h2><div>${escapeHtml(cleanDisplayText(c.description || ''))}</div>${Array.isArray(c.suggestions) && c.suggestions.length ? `<ul class="suggestions">${c.suggestions.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul>` : ''}</section>`;
  }

  function renderSpecialResultSections(quiz, result) {
    const chunks = [];
    if (result.mmpiScores) chunks.push(renderMMPI(result));
    if (result.pdqScores) chunks.push(renderPDQ(result));
    if (result.dimensions) chunks.push(renderDimensions(result));
    if (result.extra?.averageScore !== undefined) chunks.push(`<h2 class="section-title">平均分</h2><div class="notice">平均分：<strong>${escapeHtml(formatScore(result.extra.averageScore))}</strong></div>`);
    if (result.subscores && Object.keys(result.subscores).length && !result.mmpiScores && !result.pdqScores && !result.dimensions) chunks.push(renderSubscores(result.subscores));
    return chunks.join('');
  }

  function renderDimensions(result) {
    const rows = Object.entries(result.dimensions).map(([name, d]) => `<tr>
      <td>${escapeHtml(name)}</td>
      <td>${escapeHtml(formatScore(d.score))}</td>
      <td>${escapeHtml(formatScore(d.average))}</td>
      <td><span class="badge ${dimensionBadge(d.level)}">${escapeHtml(d.level)}</span></td>
      <td>${escapeHtml(cleanDisplayText(d.description))}</td>
    </tr>`).join('');
    return `<h2 class="section-title">SCL-90 分项结果</h2><div class="table-wrap"><table><thead><tr><th>项目</th><th>得分</th><th>均分</th><th>等级</th><th>说明</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function renderSubscores(subscores) {
    const rows = Object.entries(subscores).map(([name, score]) => `<tr><td>${escapeHtml(name)}</td><td>${escapeHtml(formatScore(score))}</td></tr>`).join('');
    return `<h2 class="section-title">分项得分</h2><div class="table-wrap"><table><thead><tr><th>项目</th><th>得分</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function renderPDQ(result) {
    const rows = Object.entries(result.pdqScores).map(([, s]) => `<tr>
      <td>${escapeHtml(s.name)}</td>
      <td>${escapeHtml(s.score)} / ${escapeHtml(s.totalItems)}</td>
      <td>${escapeHtml(s.threshold ?? '-')}</td>
      <td><span class="badge ${s.reached ? 'warn' : 'ok'}">${s.reached ? '达到参考线' : '未达到参考线'}</span></td>
    </tr>`).join('');
    const conceal = result.concealmentScale ? `<div class="notice">掩饰量表得分：<strong>${escapeHtml(result.concealmentScale.score)}</strong></div>` : '';
    return `<h2 class="section-title">PDQ-4+ 分项结果</h2>${conceal}<div class="table-wrap"><table><thead><tr><th>类型</th><th>得分</th><th>参考线</th><th>状态</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  function renderMMPI(result) {
    const genderLabel = result.mmpiScores.gender === 'female' ? '女性常模' : '男性常模';
    const validity = renderScaleTable('效度量表', result.mmpiScores.validity, true);
    const clinical = renderScaleTable('临床量表', result.mmpiScores.clinical, true, true);
    const additional = renderScaleTable('附加量表', result.mmpiScores.additional, true);
    return `<h2 class="section-title">MMPI 多项结果</h2><div class="notice">当前使用：<strong>${escapeHtml(genderLabel)}</strong>。</div>${validity}${clinical}${additional}`;
  }

  function renderScaleTable(title, scales, showT, showK) {
    const rows = Object.entries(scales || {}).map(([key, s]) => {
      const t = s.tScore !== undefined ? `<span class="badge ${tScoreClass(s.tScore)}">${escapeHtml(s.tScore)}</span>` : '-';
      const k = showK && s.kCorrected ? `${escapeHtml(s.kCorrected.rawScore)} / <span class="badge ${tScoreClass(s.kCorrected.tScore)}">${escapeHtml(s.kCorrected.tScore)}</span> (${escapeHtml(s.kCorrected.coefficient)}K)` : '-';
      return `<tr><td>${escapeHtml(key)}</td><td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.rawScore)}</td>${showT ? `<td>${t}</td>` : ''}${showK ? `<td>${k}</td>` : ''}<td>${escapeHtml(cleanDisplayText(s.description || ''))}</td></tr>`;
    }).join('');
    return `<h3 class="section-title">${escapeHtml(title)}</h3><div class="table-wrap"><table><thead><tr><th>代码</th><th>名称</th><th>得分</th>${showT ? '<th>T分</th>' : ''}${showK ? '<th>校正后</th>' : ''}<th>说明</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  async function downloadResultScreenshot(id) {
    const quiz = DATA[id];
    const saved = readStore(resultKey(id));
    const button = document.getElementById('downloadBtn');
    if (!quiz || !saved?.result) return;

    const originalText = button ? button.textContent : '';
    if (button) {
      button.disabled = true;
      button.textContent = '正在生成图片…';
    }

    try {
      await new Promise(resolve => requestAnimationFrame(resolve));
      const result = saved.result;
      const conclusion = findInterpretation(quiz, result);
      const interpScore = interpretationScore(quiz, result);
      const canvas = renderResultPageCanvas(id, quiz, saved, result, conclusion, interpScore);
      await saveCanvasAsPng(canvas, `quiz_result_${id}_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.png`);
    } catch (err) {
      showModal({
        title: '图片生成失败',
        body: '当前浏览器未能生成图片。请换用最新版 Chrome、Edge 或 Safari 后再试。',
        actions: [
          { text: '关闭', className: 'primary', onClick: hideModal },
        ],
      });
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = originalText || '下载结果截图';
      }
    }
  }

  function saveCanvasAsPng(canvas, filename) {
    return new Promise((resolve, reject) => {
      const finish = url => {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        resolve();
      };

      if (canvas.toBlob) {
        canvas.toBlob(blob => {
          if (!blob) {
            reject(new Error('empty image'));
            return;
          }
          finish(URL.createObjectURL(blob));
        }, 'image/png');
        return;
      }

      try {
        const dataUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  function renderResultPageCanvas(id, quiz, saved, result, conclusion, interpScore) {
    const target = document.getElementById('resultScreen') || app.querySelector('.screen');
    const width = clamp(Math.round(target?.getBoundingClientRect().width || 980), 760, 1180);
    const scale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const padding = width < 820 ? 28 : 38;
    const contentWidth = width - padding * 2;
    const colors = getCanvasColors();

    const build = (ctx, dryRun) => {
      let y = padding;
      const gap = 16;
      ctx.textBaseline = 'top';
      ctx.lineJoin = 'round';

      drawCanvasHeader(ctx, quiz, saved, result, id, padding, y, contentWidth, colors, dryRun);
      y += 96;

      const statGap = 12;
      const statW = (contentWidth - statGap * 2) / 3;
      const statH = 102;
      [
        ['总分', formatScore(result.rawScore)],
        ['参考分', formatScore(result.scaledScore)],
        ['评估分', formatScore(interpScore)],
      ].forEach(([label, value], index) => {
        drawStatCard(ctx, padding + index * (statW + statGap), y, statW, statH, label, value, colors);
      });
      y += statH + gap;

      if (conclusion) {
        y = drawConclusionBlock(ctx, padding, y, contentWidth, conclusion, colors) + gap;
      } else {
        y = drawNoticeBlock(ctx, padding, y, contentWidth, '当前分数暂无对应解释。', colors) + gap;
      }

      y = drawCanvasSpecialSections(ctx, padding, y, contentWidth, result, colors) + gap;
      y = drawFooterText(ctx, padding, y, contentWidth, quiz, saved, colors) + padding;
      return y;
    };

    const measureCanvas = document.createElement('canvas');
    measureCanvas.width = width;
    measureCanvas.height = 1000;
    const measureCtx = measureCanvas.getContext('2d');
    const height = Math.ceil(build(measureCtx, true));

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    drawCanvasBackground(ctx, width, height, colors);
    build(ctx, false);
    return canvas;
  }

  function getCanvasColors() {
    const cs = getComputedStyle(document.documentElement);
    const theme = document.documentElement.dataset.theme || 'light';
    const fallback = theme === 'dark'
      ? { bg: '#090d16', panel: '#131928', panelStrong: '#182033', text: '#eef3ff', muted: '#9aa7bd', line: 'rgba(226,232,240,.16)', brand: '#82a5ff', brand2: '#b08cff', chip: 'rgba(130,165,255,.14)', ok: '#40d37d', warn: '#f6b445', bad: '#ff6b6b' }
      : { bg: '#f4f7fb', panel: '#ffffff', panelStrong: '#ffffff', text: '#182033', muted: '#647084', line: 'rgba(30,41,59,.14)', brand: '#4f7cff', brand2: '#7c4dff', chip: 'rgba(79,124,255,.10)', ok: '#12a150', warn: '#d97706', bad: '#dc2626' };
    const read = (name, key) => (cs.getPropertyValue(name).trim() || fallback[key]);
    return {
      theme,
      bg: read('--bg', 'bg'),
      panel: read('--panel-strong', 'panel'),
      panelStrong: read('--panel-strong', 'panelStrong'),
      text: read('--text', 'text'),
      muted: read('--muted', 'muted'),
      line: read('--line', 'line'),
      brand: read('--brand', 'brand'),
      brand2: read('--brand-2', 'brand2'),
      chip: read('--chip', 'chip'),
      ok: read('--ok', 'ok'),
      warn: read('--warn', 'warn'),
      bad: read('--bad', 'bad'),
      cardShadow: theme === 'dark' ? 'rgba(0,0,0,.24)' : 'rgba(31,45,75,.08)',
    };
  }

  function drawCanvasBackground(ctx, width, height, colors) {
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, width, height);
    const g1 = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(width * .55, 420));
    g1.addColorStop(0, withAlpha(colors.brand, .24));
    g1.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, width, height);
    const g2 = ctx.createRadialGradient(width * .88, 60, 0, width * .88, 60, Math.max(width * .42, 360));
    g2.addColorStop(0, withAlpha(colors.brand2, .18));
    g2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, width, Math.min(height, 780));
  }

  function withAlpha(color, alpha) {
    const v = String(color || '').trim();
    if (v.startsWith('#')) {
      const hex = v.slice(1);
      const full = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex;
      const r = parseInt(full.slice(0, 2), 16);
      const g = parseInt(full.slice(2, 4), 16);
      const b = parseInt(full.slice(4, 6), 16);
      if ([r, g, b].every(Number.isFinite)) return `rgba(${r},${g},${b},${alpha})`;
    }
    if (v.startsWith('rgb(')) return v.replace('rgb(', 'rgba(').replace(')', `,${alpha})`);
    return v;
  }

  function setFont(ctx, weight, size, color) {
    ctx.font = `${weight} ${size}px Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`;
    ctx.fillStyle = color;
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function drawRounded(ctx, x, y, w, h, r, fill, stroke) {
    ctx.save();
    if (fill) {
      ctx.shadowColor = 'rgba(0,0,0,.08)';
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 8;
    }
    roundRectPath(ctx, x, y, w, h, r);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    ctx.restore();
    if (stroke) {
      roundRectPath(ctx, x, y, w, h, r);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function wrapLines(ctx, text, maxWidth) {
    const source = String(text ?? '').replace(/\s+/g, ' ').trim();
    if (!source) return [];
    const lines = [];
    let line = '';
    for (const char of source) {
      const test = line + char;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = char;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
    const lines = wrapLines(ctx, text, maxWidth);
    const visible = maxLines ? lines.slice(0, maxLines) : lines;
    visible.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
    return y + visible.length * lineHeight;
  }

  function drawCanvasHeader(ctx, quiz, saved, result, id, x, y, w, colors) {
    const logoSize = 54;
    const gradient = ctx.createLinearGradient(x, y, x + logoSize, y + logoSize);
    gradient.addColorStop(0, colors.brand);
    gradient.addColorStop(1, colors.brand2);
    drawRounded(ctx, x, y, logoSize, logoSize, 17, gradient, null);
    setFont(ctx, 900, 28, '#ffffff');
    ctx.fillText('Ψ', x + 16, y + 11);

    setFont(ctx, 850, 30, colors.text);
    drawWrappedText(ctx, `${quiz.title || id} · 结果`, x + logoSize + 16, y + 2, w - logoSize - 16, 36, 2);
    setFont(ctx, 500, 14, colors.muted);
    ctx.fillText(`完成时间：${formatTime(saved.createdAt || result.completedAt)} · 用时：${result.timeTaken ?? 0} 分钟`, x + logoSize + 16, y + 58);
  }

  function drawStatCard(ctx, x, y, w, h, label, value, colors) {
    drawRounded(ctx, x, y, w, h, 20, colors.panel, colors.line);
    setFont(ctx, 600, 15, colors.muted);
    ctx.fillText(label, x + 18, y + 18);
    setFont(ctx, 900, 34, colors.text);
    drawWrappedText(ctx, value, x + 18, y + 48, w - 36, 40, 1);
  }

  function drawNoticeBlock(ctx, x, y, w, text, colors) {
    setFont(ctx, 500, 16, colors.muted);
    const lines = wrapLines(ctx, text, w - 36);
    const h = Math.max(58, lines.length * 24 + 28);
    drawRounded(ctx, x, y, w, h, 18, colors.chip, colors.line);
    lines.forEach((line, index) => ctx.fillText(line, x + 18, y + 16 + index * 24));
    return y + h;
  }

  function drawConclusionBlock(ctx, x, y, w, conclusion, colors) {
    setFont(ctx, 800, 22, colors.text);
    const titleLines = wrapLines(ctx, conclusion.level || '结果解释', w - 36);
    setFont(ctx, 500, 16, colors.text);
    const descLines = wrapLines(ctx, cleanDisplayText(conclusion.description || ''), w - 36);
    const suggestions = Array.isArray(conclusion.suggestions) ? conclusion.suggestions.map(s => cleanDisplayText(s)) : [];
    const suggestionLines = suggestions.flatMap(s => {
      setFont(ctx, 500, 15, colors.muted);
      return wrapLines(ctx, '• ' + s, w - 46);
    });
    const h = 24 + titleLines.length * 29 + descLines.length * 25 + suggestionLines.length * 23 + (suggestionLines.length ? 8 : 0);
    drawRounded(ctx, x, y, w, h, 20, colors.chip, colors.line);
    let cy = y + 18;
    setFont(ctx, 800, 22, colors.text);
    titleLines.forEach(line => { ctx.fillText(line, x + 18, cy); cy += 29; });
    cy += 4;
    setFont(ctx, 500, 16, colors.text);
    descLines.forEach(line => { ctx.fillText(line, x + 18, cy); cy += 25; });
    if (suggestionLines.length) cy += 6;
    setFont(ctx, 500, 15, colors.muted);
    suggestionLines.forEach(line => { ctx.fillText(line, x + 24, cy); cy += 23; });
    return y + h;
  }

  function drawSectionTitle(ctx, title, x, y, colors) {
    setFont(ctx, 820, 21, colors.text);
    ctx.fillText(title, x, y);
    return y + 34;
  }

  function drawCanvasSpecialSections(ctx, x, y, w, result, colors) {
    if (result.mmpiScores) {
      y = drawSectionTitle(ctx, 'MMPI 多项结果', x, y + 4, colors);
      y = drawNoticeBlock(ctx, x, y, w, `当前使用：${result.mmpiScores.gender === 'female' ? '女性常模' : '男性常模'}。`, colors) + 12;
      y = drawScaleCanvasTable(ctx, '效度量表', result.mmpiScores.validity, false, x, y, w, colors) + 16;
      y = drawScaleCanvasTable(ctx, '临床量表', result.mmpiScores.clinical, true, x, y, w, colors) + 16;
      y = drawScaleCanvasTable(ctx, '附加量表', result.mmpiScores.additional, false, x, y, w, colors) + 16;
    }
    if (result.pdqScores) {
      y = drawSectionTitle(ctx, 'PDQ-4+ 分项结果', x, y + 4, colors);
      if (result.concealmentScale) y = drawNoticeBlock(ctx, x, y, w, `掩饰量表得分：${result.concealmentScale.score}`, colors) + 12;
      const rows = Object.entries(result.pdqScores).map(([, s]) => [s.name, `${s.score} / ${s.totalItems}`, s.threshold ?? '-', s.reached ? '达到参考线' : '未达到参考线']);
      y = drawCanvasTable(ctx, x, y, w, ['类型', '得分', '参考线', '状态'], rows, [0.42, 0.18, 0.16, 0.24], colors) + 16;
    }
    if (result.dimensions) {
      y = drawSectionTitle(ctx, 'SCL-90 分项结果', x, y + 4, colors);
      const rows = Object.entries(result.dimensions).map(([name, d]) => [name, formatScore(d.score), formatScore(d.average), d.level, cleanDisplayText(d.description)]);
      y = drawCanvasTable(ctx, x, y, w, ['项目', '得分', '均分', '等级', '说明'], rows, [0.18, 0.12, 0.12, 0.12, 0.46], colors) + 16;
    }
    if (result.extra?.averageScore !== undefined) {
      y = drawSectionTitle(ctx, '平均分', x, y + 4, colors);
      y = drawNoticeBlock(ctx, x, y, w, `平均分：${formatScore(result.extra.averageScore)}`, colors) + 16;
    }
    if (result.subscores && Object.keys(result.subscores).length && !result.mmpiScores && !result.pdqScores && !result.dimensions) {
      y = drawSectionTitle(ctx, '分项得分', x, y + 4, colors);
      const rows = Object.entries(result.subscores).map(([name, score]) => [name, formatScore(score)]);
      y = drawCanvasTable(ctx, x, y, w, ['项目', '得分'], rows, [0.72, 0.28], colors) + 16;
    }
    return y;
  }

  function drawScaleCanvasTable(ctx, title, scales, showK, x, y, w, colors) {
    y = drawSectionTitle(ctx, title, x, y, colors);
    const headers = showK ? ['代码', '名称', '得分', 'T分', '校正后', '说明'] : ['代码', '名称', '得分', 'T分', '说明'];
    const widths = showK ? [0.08, 0.17, 0.10, 0.10, 0.15, 0.40] : [0.10, 0.20, 0.12, 0.12, 0.46];
    const rows = Object.entries(scales || {}).map(([key, s]) => {
      const corrected = showK && s.kCorrected ? `${s.kCorrected.rawScore} / ${s.kCorrected.tScore} (${s.kCorrected.coefficient}K)` : '-';
      return showK
        ? [key, s.name, s.rawScore, s.tScore ?? '-', corrected, cleanDisplayText(s.description || '')]
        : [key, s.name, s.rawScore, s.tScore ?? '-', cleanDisplayText(s.description || '')];
    });
    return drawCanvasTable(ctx, x, y, w, headers, rows, widths, colors);
  }

  function drawCanvasTable(ctx, x, y, w, headers, rows, widths, colors) {
    const colGap = 0;
    const cols = widths.map(ratio => Math.floor(w * ratio));
    cols[cols.length - 1] += Math.round(w - cols.reduce((a, b) => a + b, 0));
    const padX = 12;
    const headerH = 42;
    const lineH = 21;
    const minRowH = 48;

    setFont(ctx, 700, 14, colors.muted);
    const rowHeights = rows.map(row => {
      let maxLines = 1;
      row.forEach((cell, i) => {
        const lines = wrapLines(ctx, cell, Math.max(10, cols[i] - padX * 2));
        maxLines = Math.max(maxLines, lines.length || 1);
      });
      return Math.max(minRowH, maxLines * lineH + 22);
    });
    const tableH = headerH + rowHeights.reduce((a, b) => a + b, 0);
    drawRounded(ctx, x, y, w, tableH, 18, colors.panel, colors.line);

    ctx.save();
    roundRectPath(ctx, x, y, w, tableH, 18);
    ctx.clip();

    ctx.fillStyle = withAlpha(colors.muted, colors.theme === 'dark' ? .08 : .06);
    ctx.fillRect(x, y, w, headerH);
    setFont(ctx, 700, 14, colors.muted);
    let cx = x;
    headers.forEach((h, i) => {
      drawWrappedText(ctx, h, cx + padX, y + 12, cols[i] - padX * 2, 18, 1);
      cx += cols[i] + colGap;
    });

    let cy = y + headerH;
    rows.forEach((row, rowIndex) => {
      ctx.strokeStyle = colors.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, cy);
      ctx.lineTo(x + w, cy);
      ctx.stroke();

      cx = x;
      row.forEach((cell, i) => {
        setFont(ctx, 500, 14, i === 0 ? colors.text : colors.muted);
        if (i === 3 && ['正常', '轻度', '中度', '重度', '达到参考线', '未达到参考线'].includes(String(cell))) {
          const klassColor = String(cell).includes('未达到') || String(cell) === '正常' ? colors.ok : (String(cell) === '轻度' ? colors.warn : colors.bad);
          drawPill(ctx, String(cell), cx + padX, cy + 12, klassColor, colors);
        } else {
          drawWrappedText(ctx, cell, cx + padX, cy + 12, cols[i] - padX * 2, lineH);
        }
        cx += cols[i] + colGap;
      });
      cy += rowHeights[rowIndex];
    });
    ctx.restore();
    return y + tableH;
  }

  function drawPill(ctx, text, x, y, color, colors) {
    setFont(ctx, 700, 13, color);
    const tw = Math.min(ctx.measureText(text).width + 18, 120);
    drawRounded(ctx, x, y - 2, tw, 26, 13, withAlpha(color, .10), withAlpha(color, .30));
    ctx.fillStyle = color;
    ctx.fillText(text, x + 9, y + 4);
  }

  function drawFooterText(ctx, x, y, w, quiz, saved, colors) {
    const text = `${quiz.title || saved.quizId || '量表'} · 结果图片`;
    setFont(ctx, 500, 13, colors.muted);
    ctx.fillText(text, x, y + 8);
    ctx.textAlign = 'right';
    ctx.fillText(formatTime(saved.createdAt), x + w, y + 8);
    ctx.textAlign = 'left';
    return y + 32;
  }

  function renderNotFound(id) {
    app.innerHTML = `<section class="screen"><div class="empty"><h1>找不到量表</h1><p>未找到 ID：${escapeHtml(id)}</p><p><button class="btn primary" id="backHome">返回主页</button></p></div></section>`;
    app.querySelector('#backHome').addEventListener('click', () => setRoute({}));
  }

  function showModal({ title, body, actions }) {
    modalRoot.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
      <h2 id="modalTitle">${escapeHtml(title)}</h2>
      <p>${body}</p>
      <div class="modal-actions">${actions.map((a, i) => `<button class="btn ${escapeHtml(a.className || '')}" data-modal-action="${i}" type="button">${escapeHtml(a.text)}</button>`).join('')}</div>
    </div>`;
    modalRoot.classList.add('show');
    actions.forEach((action, i) => {
      modalRoot.querySelector(`[data-modal-action="${i}"]`).addEventListener('click', action.onClick);
    });
  }

  function hideModal() {
    modalRoot.classList.remove('show');
    modalRoot.innerHTML = '';
  }

  function renderFromRoute() {
    hideModal();
    const id = getQuizIdFromQuery();
    const p = query();
    const view = p.get('view');
    if (!id) return renderHome();
    if (!DATA[id]) return renderNotFound(id);
    if (view === 'result') return renderResult(id);
    return renderForm(id);
  }

  window.addEventListener('popstate', renderFromRoute);
  window.addEventListener('keydown', handleAnswerShortcut);
  themeToggle.addEventListener('click', toggleTheme);
  brandHome.addEventListener('click', () => setRoute({}));
  brandHome.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') setRoute({}); });
  modalRoot.addEventListener('click', e => { if (e.target === modalRoot) hideModal(); });

  initTheme();
  renderFromRoute();
})();

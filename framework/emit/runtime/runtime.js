/* ==========================================================================
   GameSpec runtime v1.0 — hand-written once, parameterised by a spec.
   The emitter inlines this file plus a JSON spec; it never generates logic.
   Global: window.__SPEC__ is the GameSpec document.
   ========================================================================== */
(function () {
  'use strict';
  var SPEC = window.__SPEC__;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var el = function (t, a, h) {
    var n = document.createElement(t);
    if (a) for (var k in a) { if (a[k] == null) continue; k === 'class' ? (n.className = a[k]) : n.setAttribute(k, a[k]); }
    if (h != null) n.innerHTML = h;
    return n;
  };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var LETTERS = 'ABCDEFGH';

  /* ---------------------------------------------------- knowledge scope */
  var FN = {
    abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil,
    min: Math.min, max: Math.max, sqrt: Math.sqrt, pow: Math.pow,
    sum: function (a) { return a.reduce(function (x, y) { return x + Number(y); }, 0); },
    count: function (a) { return a.length; },
    mean: function (a) { return a.reduce(function (x, y) { return x + Number(y); }, 0) / a.length; }
  };
  var scope = (function () {
    var K = SPEC.knowledge || {};
    var p = {}; for (var k in (K.params || {})) p[k] = K.params[k];
    (K.thresholds || []).forEach(function (t) { p[t.name.replace(/-/g, '_')] = t.value; });
    var ds = {};
    (K.datasets || []).forEach(function (d) {
      var key = d.id.replace(/-/g, '_'); ds[key] = { __rows: d.rows };
      (d.columns || []).forEach(function (c) {
        ds[key][c.key.replace(/-/g, '_')] = d.rows.map(function (r) { return r[c.key]; });
      });
    });
    var d = {}, sc = { p: p, ds: ds, d: d };
    (K.derivations || []).forEach(function (der) {
      Object.defineProperty(d, der.id.replace(/-/g, '_'), {
        enumerable: true, get: function () { return evalExpr(der.expr, sc); }
      });
    });
    return sc;
  })();
  function evalExpr(src, sc) {
    if (src == null) return undefined;
    if (typeof src === 'number') return src;
    var names = Object.keys(FN);
    /* eslint-disable no-new-func */
    var fn = new Function('p', 'ds', 'd', names.join(','), '"use strict";return (' + src + ');');
    return fn(sc.p, sc.ds, sc.d, ...names.map(function (n) { return FN[n]; }));
  }
  function fmt(v, how) {
    if (typeof v !== 'number') return String(v);
    if (how === 'usd') return '$' + v.toLocaleString('en-US', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
    if (how === 'percent') return (v * 100).toFixed(v * 100 % 1 ? 1 : 0) + '%';
    if (how === 'integer') return String(Math.round(v));
    return String(Math.round(v * 1e6) / 1e6);
  }
  var datasetById = {}; (SPEC.knowledge && SPEC.knowledge.datasets || []).forEach(function (d) { datasetById[d.id] = d; });
  var artifactById = {}; (SPEC.knowledge && SPEC.knowledge.artifacts || []).forEach(function (a) { artifactById[a.id] = a; });
  var beatById = {}; ((SPEC.scenario || {}).beats || []).forEach(function (b) { beatById[b.id] = b; });
  var castById = {}; ((SPEC.scenario || {}).cast || []).forEach(function (c) { castById[c.id] = c; });
  var extById = {}; (SPEC.extensions || []).forEach(function (e) { extById[e.id] = e; });
  var objById = {}; (SPEC.objectives || []).forEach(function (o) { objById[o.id] = o; });

  /* ---------------------------------------------------------- flow index */
  var _ceiling = null;
  var ALL_SEG = (SPEC.flow.segments || []).slice().sort(function (a, b) { return a.order - b.order; });
  var PERSONAS = ((SPEC.scenario || {}).personas || []);
  var SEG = ALL_SEG;
  function applyPersona(pid) {
    S.persona = pid;
    SEG = pid ? ALL_SEG.filter(function (s) { return !(s.personaScope || []).length || s.personaScope.indexOf(pid) >= 0; }) : ALL_SEG;
    _ceiling = null;
  }
  var STEPS = (SPEC.flow.steps || []).slice().sort(function (a, b) { return a.order - b.order; });
  var stepsOf = {}; SEG.forEach(function (s) { stepsOf[s.id] = STEPS.filter(function (t) { return t.segmentId === s.id; }); });
  var stepById = {}; STEPS.forEach(function (s) { stepById[s.id] = s; });

  /* --------------------------------------------------------------- state */
  var S = {
    segIndex: 0, stepIndex: 0, unlocked: 0,
    answered: {},         // stepId -> {correct, optionId, attempts, hinted, ms, earned}
    meters: {}, records: [], startedAt: 0, mode: (SPEC.modes || []).filter(function (m) { return m.default; })[0]
  };
  (SPEC.scoring.meters || []).forEach(function (m) { S.meters[m.id] = m.initial; });
  var meterById = {}; (SPEC.scoring.meters || []).forEach(function (m) { meterById[m.id] = m; });
  var GRADE_METER = ((SPEC.scoring.meters || []).filter(function (m) { return m.affectsFinalGrade; })[0] || { id: 'score' }).id;
  if (S.meters[GRADE_METER] == null) S.meters[GRADE_METER] = 0;

  /* -------------------------------------------------------------- scoring */
  function inScope() {
    var ids = {}; SEG.forEach(function (s) { ids[s.id] = 1; });
    return STEPS.filter(function (s) { return ids[s.segmentId]; });
  }
  function stepCap(step) {
    var m = SPEC.scoring.model;
    if (m === 'weighted-cap') {
      var seg = SEG.filter(function (s) { return s.id === step.segmentId; })[0] || {};
      var maxScore = (SPEC.scoring.params || {}).maxScore || 100;
      var graded = stepsOf[step.segmentId].filter(function (s) { return s.graded; });
      return Math.round(Math.round(maxScore * (seg.scoringWeight || 0)) / Math.max(1, graded.length));
    }
    return (step.award && (step.award.cap != null ? step.award.cap : step.award.base)) || 0;
  }
  function award(step, opt, firstTry, hinted) {
    var m = SPEC.scoring.model, P = SPEC.scoring.params || {};
    var base = (opt && opt.award != null) ? opt.award : ((step.award && step.award.base) || 0);
    if (m === 'weighted-cap') return Math.max(0, Math.min(stepCap(step), base));
    if (m === 'checkpoint-binary') return base ? 1 : 0;
    if (m === 'flat-per-item') return base;
    if (m === 'flat-penalty') return base > 0 ? base : (P.incorrect || 0);
    if (m === 'base-streak-speed') {
      if (!base) return 0;
      if (!firstTry || hinted) return Math.round(base * (P.nonFirstTryFactor || 0.5));
      S.meters.streak = Math.min((meterById.streak || {}).ceiling || 5, (S.meters.streak || 0) + 1);
      var mult = Math.min(P.multiplierCap || 1.5, 1 + (S.meters.streak) * (P.multiplierStep || 0.1));
      return Math.round(base * mult);
    }
    return base;
  }
  function bumpMeter(id, delta) {
    var m = meterById[id]; if (!m || !delta) return;
    var v = (S.meters[id] || 0) + delta;
    if (m.floor != null) v = Math.max(m.floor, v);
    if (m.ceiling != null) v = Math.min(m.ceiling, v);
    S.meters[id] = v;
  }
  function reachableCeiling() {
    var saved = S.meters.streak, t = 0;
    S.meters.streak = (meterById.streak || {}).initial || 0;
    inScope().forEach(function (s) {
      if (!s.graded) return;
      var opts = (s.interaction.options || []).filter(function (o) { return o.correct; });
      var best = opts[0] || { award: (s.award || {}).base || 0, correct: true };
      t += award(s, best, true, false);
    });
    S.meters.streak = saved;
    return t;
  }
  function maxScore() {
    if (SPEC.scoring.model === 'weighted-cap') return (SPEC.scoring.params || {}).maxScore || 100;
    if (_ceiling != null) return _ceiling;
    // Simulate a flawless first-try run through the same award() the student
    // hits, so a streak-multiplied denominator is one a student can reach.
    var savedStreak = S.meters.streak, t = 0;
    S.meters.streak = (meterById.streak || {}).initial || 0;
    inScope().forEach(function (s) {
      if (!s.graded) return;
      var opts = (s.interaction.options || []).filter(function (o) { return o.correct; });
      var best = opts[0] || { award: (s.award || {}).base || 0, correct: true };
      t += award(s, best, true, false);
    });
    S.meters.streak = savedStreak;
    _ceiling = t;
    return t;
  }

  /* ------------------------------------------------------------ rendering */
  var mainEl, liveEl;
  function announce(msg) { if (liveEl) liveEl.textContent = msg; }

  function renderHud() {
    var h = $('header.hud');
    h.innerHTML = '';
    h.appendChild(el('div', { class: 'title' },
      esc(SPEC.meta.title) + (SPEC.meta.subtitle ? ' <span class="sub">' + esc(SPEC.meta.subtitle) + '</span>' : '')));
    (SPEC.scoring.meters || []).forEach(function (m) {
      var denom = m.id === GRADE_METER ? ' / ' + maxScore() : (m.ceiling != null && m.id !== 'streak' ? ' / ' + m.ceiling : '');
      h.appendChild(el('div', { class: 'meter', title: esc(m.label) },
        esc(m.label) + ' <b>' + S.meters[m.id] + denom + '</b>'));
    });
    var themeBtn = el('button', { class: 'btn ghost', type: 'button', 'aria-label': 'Toggle light or dark theme' }, 'Theme');
    themeBtn.onclick = function () {
      var r = document.documentElement;
      var now = r.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      r.setAttribute('data-theme', now);
      try { localStorage.setItem('gs_theme', now); } catch (e) { /* private mode */ }
    };
    h.appendChild(themeBtn);

    var rail = el('nav', { class: 'rail', 'aria-label': 'Sections' });
    SEG.forEach(function (seg, i) {
      var done = stepsOf[seg.id].every(function (s) { return !s.graded || S.answered[s.id]; });
      var locked = SPEC.flow.progression === 'unlock-plus-one' && i > S.unlocked;
      var b = el('button', {
        type: 'button', class: done ? 'done' : '',
        'aria-current': i === S.segIndex ? 'step' : null, disabled: locked ? 'disabled' : null
      }, String(i + 1).padStart(2, '0') + ' · ' + esc(seg.title));
      b.onclick = function () { S.segIndex = i; S.stepIndex = 0; render(); };
      rail.appendChild(b);
    });
    h.appendChild(rail);
  }

  function artifactNode(id) {
    var a = artifactById[id]; if (!a) return null;
    var d = el('details', { class: 'artifact' });
    d.appendChild(el('summary', null, esc(a.title) +
      (a.isDistractor ? '' : '') + ' <span class="tag">' + esc(a.kind) + '</span>'));
    var body = el('div', { class: 'body' });
    if (a.kind === 'dataset-view' && datasetById[a.datasetId]) body.appendChild(tableNode(datasetById[a.datasetId]));
    else body.appendChild(el('div', null, mdish(a.content || '')));
    if (a.provenanceLabel) body.appendChild(el('p', { class: 'caption' }, esc(a.provenanceLabel)));
    d.appendChild(body);
    return d;
  }
  function tableNode(ds) {
    var wrap = el('div', { class: 'scroll' });
    var t = el('table', { class: 'data' });
    var head = '<tr>' + ds.columns.map(function (c) { return '<th>' + esc(c.label) + (c.unit ? ' (' + esc(c.unit) + ')' : '') + '</th>'; }).join('') + '</tr>';
    var rows = ds.rows.map(function (r) {
      return '<tr>' + ds.columns.map(function (c) {
        var v = r[c.key];
        var cls = c.key === ds.labelColumn ? ' class="label-col"' : '';
        return '<td' + cls + '>' + esc(c.type === 'currency' ? fmt(v, 'usd') : c.type === 'percent' ? fmt(v, 'percent') : v) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    t.innerHTML = head + rows;
    wrap.appendChild(t);
    if (ds.provenanceLabel) wrap.appendChild(el('p', { class: 'caption' }, esc(ds.provenanceLabel)));
    return wrap;
  }
  function mdish(s) {
    return esc(s)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/^- (.*)$/gm, '<li>$1</li>')
      .replace(/(<li>[\s\S]*<\/li>)/, '<ul>$1</ul>')
      .replace(/\n{2,}/g, '</p><p>')
      .replace(/^/, '<p>').replace(/$/, '</p>');
  }

  function currentStep() {
    if (S.finished) return null;
    var list = stepsOf[SEG[S.segIndex].id];
    return list[Math.min(S.stepIndex, list.length - 1)] || null;
  }

  function renderPersonaPicker() {
    renderHud();
    mainEl.innerHTML = '';
    var c = el('section', { class: 'card' });
    c.appendChild(el('div', { class: 'eyebrow' }, 'Choose your role'));
    c.appendChild(el('h2', null, esc(SPEC.meta.title)));
    if (SPEC.meta.description) c.appendChild(el('p', { class: 'caption' }, esc(SPEC.meta.description.split('.')[0] + '.')));
    var wrap = el('div', { class: 'opts' });
    PERSONAS.forEach(function (p, i) {
      var b = el('button', { class: 'opt', type: 'button', 'data-opt': p.id },
        '<span class="k">' + LETTERS[i] + '</span><span>' + esc(p.label) +
        (p.mission || p.description ? '<span class="detail">' + esc(p.mission || p.description) + '</span>' : '') + '</span>');
      b.onclick = function () { applyPersona(p.id); S.segIndex = 0; S.stepIndex = 0; render(); };
      wrap.appendChild(b);
    });
    c.appendChild(wrap);
    mainEl.appendChild(c);
    announce('Choose your role to begin.');
  }
  function render() {
    if (PERSONAS.length && !S.persona) return renderPersonaPicker();
    renderHud();
    mainEl.innerHTML = '';
    var seg = SEG[S.segIndex], step = currentStep();
    if (!step) { renderDebrief(); return; }

    var card = el('section', { class: 'card' });
    card.appendChild(el('div', { class: 'eyebrow' }, esc(seg.title) + ' · step ' + (S.stepIndex + 1) + ' of ' + stepsOf[seg.id].length));
    if (step.title) card.appendChild(el('h2', null, esc(step.title)));
    if (step.prompt) card.appendChild(el('p', { class: 'prompt' }, mdish(step.prompt).replace(/^<p>|<\/p>$/g, '')));
    if (step.caption) card.appendChild(el('p', { class: 'caption' }, esc(step.caption)));

    (step.artifactIds || []).forEach(function (id) { var n = artifactNode(id); if (n) card.appendChild(n); });
    (((SPEC.scaffolding || {}).referencePanels) || []).forEach(function (p) {
      if (p.persistent || (p.shownAtSteps || []).indexOf(step.id) >= 0) {
        if ((step.artifactIds || []).indexOf(p.artifactId) < 0) {
          var n = artifactNode(p.artifactId); if (n) card.appendChild(n);
        }
      }
    });

    S.startedAt = Date.now();
    RENDER[step.interaction.type] ? RENDER[step.interaction.type](step, card) : RENDER.unsupported(step, card);
    mainEl.appendChild(card);
    announce((step.title || 'Step') + '. ' + (step.prompt || ''));
    var first = card.querySelector('button.opt,input,button.btn');
    if (first && document.activeElement === document.body) first.focus();
  }

  /* -------------------------------------------------------------- hints */
  function hintFor(step) {
    var hs = ((SPEC.scaffolding || {}).hints || []).filter(function (h) {
      return h.stepId === step.id && (!h.personaId || h.personaId === '*' || h.personaId === S.persona);
    });
    return hs[0] || null;
  }
  function addHint(step, card, onUse) {
    var h = hintFor(step); if (!h) return;
    var b = el('button', { class: 'btn ghost', type: 'button' },
      'Hint' + (h.announceCost && h.cost ? ' (costs ' + h.cost.amount + ' ' + esc((meterById[h.cost.meterId] || {}).label || h.cost.meterId) + ')' : ''));
    b.onclick = function () {
      b.replaceWith(el('p', { class: 'caption' }, '💡 ' + esc(h.text)));
      if (h.cost) bumpMeter(h.cost.meterId, -h.cost.amount);
      onUse();
      renderHud();
      announce('Hint: ' + h.text);
    };
    card.appendChild(el('div', { class: 'row' })).appendChild(b);
  }

  /* -------------------------------------------------- answer bookkeeping */
  function commit(step, res) {
    var prev = S.answered[step.id] || { attempts: 0, hinted: false };
    var attempts = prev.attempts + 1;
    var firstTry = attempts === 1 && !prev.hinted;
    var earned = res.correct ? award(step, res.option, firstTry, prev.hinted) : 0;
    if (!res.correct && SPEC.scoring.model === 'flat-penalty') earned = (SPEC.scoring.params || {}).incorrect || 0;
    var policy = SPEC.scoring.retryPolicy;
    var locks = policy === 'lock-after-select' || res.correct;

    if (locks) {
      S.answered[step.id] = { correct: res.correct, optionId: res.optionId, attempts: attempts, hinted: prev.hinted, ms: Date.now() - S.startedAt, earned: earned };
      S.meters[GRADE_METER] = (S.meters[GRADE_METER] || 0) + earned;
      var gm = meterById[GRADE_METER];
      if (gm) {
        if (gm.floor != null) S.meters[GRADE_METER] = Math.max(gm.floor, S.meters[GRADE_METER]);
        if (gm.ceiling != null) S.meters[GRADE_METER] = Math.min(gm.ceiling, S.meters[GRADE_METER]);
      }
      var deltas = (step.award && step.award.meterDeltas) || {};
      for (var k in deltas) bumpMeter(k, res.correct ? deltas[k] : -deltas[k]);
      (SPEC.scoring.meters || []).forEach(function (m) {
        if (m.id === GRADE_METER || m.id === 'streak') return;
        var d = (m.deltas || {})[res.correct ? 'correct' : 'incorrect'];
        if (d) bumpMeter(m.id, d);
      });
      if (!res.correct) S.meters.streak = 0;
      S.records.push({ stepId: step.id, correct: res.correct, attempts: attempts, hinted: prev.hinted, ms: Date.now() - S.startedAt, optionId: res.optionId });
    } else {
      S.answered[step.id] = null; delete S.answered[step.id];
      prev.attempts = attempts; S.answered['~' + step.id] = prev;
    }
    return { earned: earned, locks: locks, attempts: attempts };
  }
  function advanceControl(step, card, locked) {
    var row = el('div', { class: 'row' });
    var b = el('button', { class: 'btn', type: 'button', 'data-role': 'advance' }, 'Continue');
    b.onclick = function () { next(step); };
    if (!locked) b.setAttribute('disabled', 'disabled');
    row.appendChild(b);
    card.appendChild(row);
    return b;
  }
  function feedbackNode(ok, lead, text, pts) {
    var f = el('div', { class: 'fb ' + (ok ? 'ok' : 'no'), role: 'status' });
    f.appendChild(el('span', { class: 'lead' }, esc(lead) +
      (pts != null && (SPEC.feedback.policy || {}).showPointDelta !== false ? '<span class="pts">' + (pts >= 0 ? '+' : '') + pts + '</span>' : '')));
    f.appendChild(el('div', null, mdish(text || '')));
    return f;
  }
  function timingFor(correct) {
    var t = (SPEC.feedback.policy || {}).timing;
    if (typeof t === 'string') return t;
    return correct ? (t.correct || 'immediate') : (t.incorrect || 'immediate');
  }
  function next(step) {
    var list = stepsOf[SEG[S.segIndex].id];
    var opt = S.answered[step.id];
    var jump = null;
    if (opt && SPEC.flow.runtimeSemantics.optionBranching === 'active') {
      var chosen = (step.interaction.options || []).filter(function (o) { return o.id === opt.optionId; })[0];
      if (chosen && chosen.goTo) jump = chosen.goTo;
    }
    if (!jump) {
      var edge = (step.edges || []).filter(function (e) { return !e.when || e.when === 'always'; })[0];
      if (edge) jump = edge.to;
    }
    if (jump && stepById[jump]) {
      var t = stepById[jump];
      S.segIndex = SEG.findIndex(function (s) { return s.id === t.segmentId; });
      S.stepIndex = stepsOf[t.segmentId].indexOf(t);
      return render();
    }
    if (S.stepIndex + 1 < list.length) { S.stepIndex++; return render(); }
    if (S.segIndex + 1 < SEG.length) { S.unlocked = Math.max(S.unlocked, S.segIndex + 1); S.segIndex++; S.stepIndex = 0; return render(); }
    renderDebrief();
  }

  /* --------------------------------------------------------- renderers */
  var RENDER = {};

  RENDER.mcq = function (step, card) {
    var prev = S.answered['~' + step.id];
    if (prev) S.answered['~' + step.id] = prev;
    var opts = step.interaction.options.slice();
    if (step.interaction.shuffle !== false) opts = shuffle(opts, step.id);
    var wrap = el('div', { class: 'opts', role: 'group', 'aria-label': 'Answer options' });
    var done = false;
    opts.forEach(function (o, i) {
      var b = el('button', { class: 'opt', type: 'button', 'data-opt': o.id },
        '<span class="k">' + LETTERS[i] + '</span><span>' + esc(o.label) +
        (o.detail ? '<span class="detail">' + esc(o.detail) + '</span>' : '') + '</span>');
      b.onclick = function () {
        if (done) return;
        var r = commit(step, { correct: !!o.correct, optionId: o.id, option: o });
        if (r.locks) {
          done = true;
          wrap.querySelectorAll('button.opt').forEach(function (x) { x.setAttribute('disabled', 'disabled'); });
          opts.forEach(function (oo, j) {
            if (oo.correct) wrap.children[j].classList.add('is-correct');
          });
          if (!o.correct) b.classList.add('is-incorrect');
        } else {
          b.setAttribute('disabled', 'disabled'); b.classList.add('is-incorrect');
        }
        showFeedback(step, card, o, r, done);
        renderHud();
      };
      wrap.appendChild(b);
    });
    card.appendChild(wrap);
    addHint(step, card, function () { var p = S.answered['~' + step.id] || { attempts: 0 }; p.hinted = true; S.answered['~' + step.id] = p; });
    if (!step.graded) advanceControl(step, card, true);
  };

  function showFeedback(step, card, o, r, locked) {
    var old = card.querySelector('.fb'); if (old) old.remove();
    var pol = SPEC.feedback.policy || {}, cont = SPEC.feedback.content || {};
    var timing = timingFor(!!o.correct);
    var text = o.correct ? (o.feedback || step.why) : (o.consequence || o.feedback || '');
    if (timing !== 'deferred-to-debrief')
      card.appendChild(feedbackNode(!!o.correct,
        o.correct ? (cont.correctPrefix || 'Correct') : (cont.incorrectPrefix || 'Not quite'),
        text, r.earned));
    else if (!o.correct)
      card.appendChild(feedbackNode(false, cont.incorrectPrefix || 'Not quite', text, r.earned));
    announce((o.correct ? 'Correct. ' : 'Incorrect. ') + text);
    if (locked) {
      var b = card.querySelector('.row .btn[data-role="advance"]');
      if (b) b.removeAttribute('disabled'); else advanceControl(step, card, true);
    }
  }

  RENDER['multi-select'] = function (step, card) {
    var it = step.interaction, chosen = {};
    var wrap = el('div', { class: 'opts' });
    it.options.forEach(function (o) {
      var b = el('button', { class: 'opt', type: 'button', 'aria-pressed': 'false' },
        '<span class="k"></span><span>' + esc(o.label) + '</span>');
      b.onclick = function () {
        chosen[o.id] = !chosen[o.id];
        b.setAttribute('aria-pressed', chosen[o.id] ? 'true' : 'false');
        b.classList.toggle('is-correct', false); b.style.borderColor = chosen[o.id] ? 'var(--accent)' : '';
      };
      wrap.appendChild(b);
    });
    card.appendChild(wrap);
    var btn = advanceControl(step, card, true); btn.textContent = 'Check';
    btn.onclick = function () {
      var picked = Object.keys(chosen).filter(function (k) { return chosen[k]; });
      var want = it.correctSet.slice().sort().join(','), got = picked.slice().sort().join(',');
      var ok = want === got;
      var r = commit(step, { correct: ok, optionId: got, option: { correct: ok, award: ok ? (step.award || {}).base : 0 } });
      card.appendChild(feedbackNode(ok, ok ? 'Correct' : 'Not quite', step.why || '', r.earned));
      btn.textContent = 'Continue'; btn.onclick = function () { next(step); };
      renderHud();
    };
  };

  RENDER.numeric = function (step, card) {
    var it = step.interaction;
    var want = Number(evalExpr(it.expectedExpr, scope));
    var lab = el('label', { class: 'blank' });
    lab.appendChild(el('span', null, esc(it.unit ? 'Your answer (' + it.unit + ')' : 'Your answer')));
    var input = el('input', { type: 'text', inputmode: 'decimal', 'aria-label': 'Your answer' });
    lab.appendChild(input); card.appendChild(lab);
    addHint(step, card, function () { var p = S.answered['~' + step.id] || { attempts: 0 }; p.hinted = true; S.answered['~' + step.id] = p; });
    var btn = advanceControl(step, card, true); btn.textContent = 'Check';
    btn.onclick = function () {
      var v = Number(String(input.value).replace(/[$,\s]/g, ''));
      if (!isFinite(v) || input.value.trim() === '') { announce('Enter a number.'); input.focus(); return; }
      var ok = Math.abs(v - want) <= (it.tol || 0);
      var r = commit(step, { correct: ok, optionId: String(v), option: { correct: ok, award: (step.award || {}).base } });
      var old = card.querySelector('.fb'); if (old) old.remove();
      card.appendChild(feedbackNode(ok, ok ? 'Correct' : 'Not quite',
        ok ? (step.why || '') : ((SPEC.feedback.content || {}).softWrongByInteraction || {}).numeric || 'Check the arithmetic and try again.', r.earned));
      announce(ok ? 'Correct.' : 'Not quite.');
      if (r.locks) { input.setAttribute('disabled', 'disabled'); btn.textContent = 'Continue'; btn.onclick = function () { next(step); }; }
      renderHud();
    };
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') btn.click(); });
  };

  RENDER['multi-blank'] = function (step, card) {
    var it = step.interaction, inputs = [];
    it.blanks.forEach(function (b, i) {
      var lab = el('label', { class: 'blank' });
      lab.appendChild(el('span', null, esc(b.label)));
      var inp = el('input', { type: 'text', inputmode: 'decimal', 'aria-label': b.label });
      lab.appendChild(inp); inputs.push(inp); card.appendChild(lab);
    });
    addHint(step, card, function () { var p = S.answered['~' + step.id] || { attempts: 0 }; p.hinted = true; S.answered['~' + step.id] = p; });
    var btn = advanceControl(step, card, true); btn.textContent = 'Check';
    btn.onclick = function () {
      var results = it.blanks.map(function (b, i) {
        var want = Number(evalExpr(b.expectedExpr, scope));
        var v = Number(String(inputs[i].value).replace(/[$,\s]/g, ''));
        return isFinite(v) && Math.abs(v - want) <= (b.tol || 0);
      });
      var ok = it.grading === 'partial' ? results.some(Boolean) : results.every(Boolean);
      if (it.blankDiagnosis === 'per-blank') results.forEach(function (r, i) {
        inputs[i].style.borderColor = r ? 'var(--correct)' : 'var(--incorrect)';
      });
      var r = commit(step, { correct: ok, optionId: inputs.map(function (i) { return i.value; }).join('|'), option: { correct: ok, award: (step.award || {}).base } });
      var old = card.querySelector('.fb'); if (old) old.remove();
      card.appendChild(feedbackNode(ok, ok ? 'Correct' : 'Not quite',
        ok ? (step.why || '') : (((SPEC.feedback.content || {}).softWrongByInteraction || {})['multi-blank'] || 'One of the blanks is off.'), r.earned));
      announce(ok ? 'Correct.' : 'Not quite.');
      if (r.locks) { inputs.forEach(function (i) { i.setAttribute('disabled', 'disabled'); }); btn.textContent = 'Continue'; btn.onclick = function () { next(step); }; }
      renderHud();
    };
  };

  RENDER.classify = function (step, card) {
    var it = step.interaction, assigned = {};
    var tray = el('div', null, '');
    it.items.forEach(function (item) {
      var row = el('div', { class: 'row', style: 'align-items:flex-start' });
      row.appendChild(el('div', { style: 'flex:1 1 220px' }, mdish(item.text)));
      it.buckets.forEach(function (bk) {
        var c = el('button', { class: 'chip', type: 'button', 'aria-pressed': 'false' }, esc(bk.label));
        c.onclick = function () {
          assigned[item.id] = bk.id;
          row.querySelectorAll('.chip').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
          c.setAttribute('aria-pressed', 'true');
        };
        row.appendChild(c);
      });
      tray.appendChild(row);
    });
    card.appendChild(tray);
    var btn = advanceControl(step, card, true); btn.textContent = 'Check';
    btn.onclick = function () {
      var right = it.items.filter(function (i) { return assigned[i.id] === i.correctBucket; });
      var ok = right.length === it.items.length;
      var r = commit(step, { correct: ok, optionId: JSON.stringify(assigned), option: { correct: ok, award: (step.award || {}).base } });
      var old = card.querySelector('.fb'); if (old) old.remove();
      var detail = it.items.map(function (i) {
        var got = assigned[i.id] === i.correctBucket;
        return (got ? '✓ ' : '✗ ') + i.text.replace(/<[^>]+>/g, '') + (got ? '' : ' — ' + (i.why || ''));
      }).join('\n\n');
      card.appendChild(feedbackNode(ok, ok ? 'Correct' : right.length + ' of ' + it.items.length, detail, r.earned));
      announce(right.length + ' of ' + it.items.length + ' correct.');
      if (r.locks) { btn.textContent = 'Continue'; btn.onclick = function () { next(step); }; }
      renderHud();
    };
  };

  RENDER['select-from-set'] = function (step, card) {
    var it = step.interaction, ds = datasetById[it.datasetId], picked = {};
    card.appendChild(tableNode(ds));
    var chips = el('div', null, '');
    ds.rows.forEach(function (row, i) {
      var key = String(row[ds.columns[0].key]);
      var label = ds.columns.slice(1).map(function (c) { return c.type === 'currency' ? fmt(row[c.key], 'usd') : row[c.key]; }).join(' · ');
      var c = el('button', { class: 'chip', type: 'button', 'aria-pressed': 'false' }, esc(label));
      c.onclick = function () {
        picked[key] = !picked[key]; c.setAttribute('aria-pressed', picked[key] ? 'true' : 'false');
      };
      chips.appendChild(c);
    });
    card.appendChild(chips);
    var btn = advanceControl(step, card, true); btn.textContent = 'Check';
    btn.onclick = function () {
      var got = Object.keys(picked).filter(function (k) { return picked[k]; }).sort().join(',');
      var ok = got === it.correct.slice().sort().join(',');
      var r = commit(step, { correct: ok, optionId: got, option: { correct: ok, award: (step.award || {}).base } });
      var old = card.querySelector('.fb'); if (old) old.remove();
      var why = ok ? (step.why || '') : ((it.distractors || [])[0] || {}).feedback || step.why || '';
      card.appendChild(feedbackNode(ok, ok ? 'Correct' : 'Not quite', why, r.earned));
      if (r.locks) { btn.textContent = 'Continue'; btn.onclick = function () { next(step); }; }
      renderHud();
    };
  };

  RENDER.traverse = function (step, card) {
    var it = step.interaction, tree = (SPEC.tree || []).filter(function (t) { return t.id === it.treeId; })[0];
    var ds = datasetById[it.datasetId];
    var recId = (it.recordOrder || [])[0];
    var rec = ds.rows.filter(function (r) { return String(r[ds.columns[0].key]) === String(recId); })[0] || ds.rows[0];
    var facts = el('div', { class: 'row' });
    ds.columns.forEach(function (c) { facts.appendChild(el('span', { class: 'tag' }, esc(c.label + ': ' + rec[c.key]))); });
    card.appendChild(facts);
    var path = [], nodeId = tree.rootNodeId;
    var area = el('div', null, ''); card.appendChild(area);
    function nodeOf(id) { return tree.nodes.filter(function (n) { return n.id === id; })[0]; }
    function matches(pred) {
      var v = rec[pred.feature];
      switch (pred.op) {
        case 'eq': return v === pred.value; case 'ne': return v !== pred.value;
        case 'lt': return v < pred.value; case 'lte': return v <= pred.value;
        case 'gt': return v > pred.value; case 'gte': return v >= pred.value;
      } return false;
    }
    function drawNode() {
      area.innerHTML = '';
      var n = nodeOf(nodeId);
      if (n.kind === 'leaf') {
        var ok = true;
        var r = commit(step, { correct: ok, optionId: path.join('>'), option: { correct: true, award: (step.award || {}).base } });
        area.appendChild(feedbackNode(true, 'Leaf reached', '**' + n.prediction + '** — path: ' + path.join(' → ') + '. ' + (step.why || ''), r.earned));
        var b = el('button', { class: 'btn', type: 'button' }, 'Continue');
        b.onclick = function () { next(step); };
        area.appendChild(el('div', { class: 'row' })).appendChild(b);
        renderHud(); return;
      }
      area.appendChild(el('p', { class: 'prompt' }, esc(n.label || (it.promptTemplate || 'Which branch?'))));
      var wrap = el('div', { class: 'opts' });
      tree.branches.filter(function (b) { return b.from === nodeId; }).forEach(function (b, i) {
        var btn = el('button', { class: 'opt', type: 'button' }, '<span class="k">' + LETTERS[i] + '</span><span>' + esc(b.label) + '</span>');
        btn.onclick = function () {
          if (matches(b.predicate)) { path.push(b.label); nodeId = b.to; drawNode(); announce('Correct branch: ' + b.label); }
          else {
            btn.classList.add('is-incorrect'); btn.setAttribute('disabled', 'disabled');
            announce('That branch does not match this record.');
            var f = area.querySelector('.fb'); if (f) f.remove();
            area.appendChild(feedbackNode(false, 'Not this branch', 'Compare the record against the question at this node.', 0));
          }
        };
        wrap.appendChild(btn);
      });
      area.appendChild(wrap);
    }
    drawNode();
  };

  RENDER.sandbox = function (step, card) {
    var it = step.interaction, g = it.generator;
    var counts = [0, 0, 0, 0, 0, 0, 0, 0, 0], total = 0;
    var seed = g.seed >>> 0;
    function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
    var bench = (SPEC.knowledge.datasets || []).filter(function (d) { return d.id === 'benford-first'; })[0];
    var expected = bench ? bench.rows.map(function (r) { return r.p; }) : null;
    var chart = el('div', { class: 'bars', role: 'img', 'aria-label': 'Expected versus observed first-digit shares' });
    var status = el('p', { class: 'caption' }, 'No sample yet.');
    function draw() {
      chart.innerHTML = '';
      for (var d = 1; d <= 9; d++) {
        var obs = total ? counts[d - 1] / total : 0;
        var exp = expected ? expected[d - 1] : 0;
        var row = el('div', { class: 'b' });
        row.appendChild(el('span', null, String(d)));
        row.appendChild(el('span', null, '<span class="fill e" style="width:' + (exp / 0.42 * 100).toFixed(1) + '%;display:block"></span>' + (exp * 100).toFixed(1) + '% expected'));
        row.appendChild(el('span', null, '<span class="fill o" style="width:' + (obs / 0.42 * 100).toFixed(1) + '%;display:block"></span>' + (obs * 100).toFixed(1) + '% observed'));
        chart.appendChild(row);
      }
    }
    draw();
    card.appendChild(chart); card.appendChild(status);
    var b = el('button', { class: 'btn', type: 'button' }, 'Generate ' + (it.batchSize || 25) + ' invoices');
    b.onclick = function () {
      for (var i = 0; i < (it.batchSize || 25); i++) {
        var lo = (g.params && g.params.decades || [1, 6])[0], hi = (g.params && g.params.decades || [1, 6])[1];
        var v = Math.pow(10, lo + rnd() * (hi - lo));
        var first = Number(String(v).replace(/[^1-9]/, '').charAt(0) || String(Math.floor(v)).charAt(0));
        if (first >= 1 && first <= 9) { counts[first - 1]++; total++; }
      }
      draw();
      var msg = (it.feedbackThresholds || []).filter(function (t) { return total <= t.max; })[0];
      status.textContent = total + ' invoices. ' + (msg ? msg.text : '');
      announce(status.textContent);
    };
    card.appendChild(el('div', { class: 'row' })).appendChild(b);
    advanceControl(step, card, true);
  };

  RENDER.navigate = function (step, card) {
    // The generatable fallback for a spatial layer: a plain, focusable list.
    var b = el('button', { class: 'btn', type: 'button' }, 'Go to ' + esc(step.interaction.targetId));
    b.onclick = function () { next(step); };
    card.appendChild(el('div', { class: 'row' })).appendChild(b);
  };

  RENDER['drag-to-target'] = function (step, card) {
    var it = step.interaction;
    card.appendChild(el('p', { class: 'caption' }, esc(it.sourceLabel || 'Choose the target')));
    var wrap = el('div', { class: 'opts' });
    it.targets.forEach(function (t, i) {
      var b = el('button', { class: 'opt', type: 'button', 'data-opt': t.id }, '<span class="k">' + LETTERS[i] + '</span><span>' + esc(t.label) + '</span>');
      b.onclick = function () {
        var r = commit(step, { correct: !!t.correct, optionId: t.id, option: t });
        wrap.querySelectorAll('button').forEach(function (x) { x.setAttribute('disabled', 'disabled'); });
        b.classList.add(t.correct ? 'is-correct' : 'is-incorrect');
        card.appendChild(feedbackNode(!!t.correct, t.correct ? 'Correct' : 'Not quite', t.feedback || step.why || '', r.earned));
        advanceControl(step, card, true);
        renderHud();
      };
      wrap.appendChild(b);
    });
    card.appendChild(wrap);
  };

  RENDER.narrative = function (step, card) {
    var b = beatById[step.interaction.beatId];
    if (b) card.appendChild(beatNode(b));
    var btn = el('button', { class: 'btn', type: 'button' }, (b && b.cta) || 'Continue');
    btn.onclick = function () { next(step); };
    card.appendChild(el('div', { class: 'row' })).appendChild(btn);
  };
  function beatNode(b) {
    var box = el('div', null, '');
    if (b.stamp) box.appendChild(el('div', { class: 'eyebrow' }, esc(b.stamp)));
    if (b.lines) {
      var d = el('div', { class: 'dialogue' });
      b.lines.forEach(function (l) {
        var who = l.who === 'narrator' ? null : (castById[l.who] || {}).displayName || (l.who === 'you' ? 'You' : l.who);
        var line = el('div', { class: 'line' + (who ? '' : ' narrator') });
        if (who) line.appendChild(el('span', { class: 'who' }, esc(who)));
        line.appendChild(el('span', null, mdish(l.text).replace(/^<p>|<\/p>$/g, '')));
        d.appendChild(line);
      });
      box.appendChild(d);
    }
    (b.blocks || []).forEach(function (blk) {
      if (blk.kind === 'row') box.appendChild(el('div', { class: 'orow' },
        '<b>' + esc(blk.label) + '</b><span class="aux">' + esc(blk.aux || '') + '</span><span>' + esc(blk.value || '') + '</span>'));
      else if (blk.kind === 'quip') box.appendChild(el('p', { class: 'caption' }, esc(((castById[blk.who] || {}).displayName || blk.who) + ': ' + blk.text)));
      else box.appendChild(el('div', null, mdish(blk.text || '')));
    });
    return box;
  }

  RENDER.extension = function (step, card) {
    var ext = extById[step.interaction.extensionId];
    if (!ext) return RENDER.unsupported(step, card);
    var W = window.__WIDGETS__ || {};
    if (W[ext.widget]) {
      var host = el('div', null, '');
      card.appendChild(host);
      host.__ext = ext;
      W[ext.widget](host, ext, {
        scope: scope, announce: announce,
        done: function (ok) {
          var r = commit(step, { correct: ok, optionId: 'widget', option: { correct: ok, award: (step.award || {}).base } });
          card.appendChild(feedbackNode(ok, ok ? 'Solved' : 'Close enough for now', (ext.pedagogy || {}).feedback || step.why || '', r.earned));
          advanceControl(step, card, true); renderHud();
        }
      });
      card.appendChild(el('p', { class: 'caption' }, esc(ext.textAlternative)));
      return;
    }
    // No widget in the registry: render the declared fallback, and say so.
    card.appendChild(el('p', { class: 'caption' },
      '<span class="tag">fallback</span> This step normally uses the <b>' + esc(ext.widget) +
      '</b> widget, which this build does not ship. The declared fallback is shown instead.'));
    card.appendChild(el('p', null, esc(ext.textAlternative)));
    var fb = ext.fallback;
    var shim = Object.assign({}, step, { prompt: fb.prompt, interaction: fb.interaction });
    if (fb.prompt) card.appendChild(el('p', { class: 'prompt' }, esc(fb.prompt)));
    (RENDER[fb.interaction.type] || RENDER.unsupported)(shim, card);
  };

  RENDER.unsupported = function (step, card) {
    card.appendChild(el('p', { class: 'caption' }, 'This interaction type is not implemented in this build: ' + esc(step.interaction.type)));
    advanceControl(step, card, true);
  };

  function shuffle(arr, key) {
    var a = arr.slice(), s = 0; for (var i = 0; i < key.length; i++) s = (s * 31 + key.charCodeAt(i)) >>> 0;
    function r() { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }
    for (var i2 = a.length - 1; i2 > 0; i2--) { var j = Math.floor(r() * (i2 + 1)); var t = a[i2]; a[i2] = a[j]; a[j] = t; }
    return a;
  }

  /* -------------------------------------------------------------- debrief */
  function renderDebrief() {
    S.finished = true;
    mainEl.innerHTML = '';
    var total = S.meters[GRADE_METER] || 0, max = maxScore();
    var pct = max ? Math.round(total / max * 100) : 0;
    var passing = (SPEC.scoring.params || {}).passingScore;
    var passed = passing == null ? null : pct >= passing;

    var head = el('section', { class: 'card' });
    head.appendChild(el('div', { class: 'eyebrow' }, 'Debrief'));
    head.appendChild(el('h2', null, total + ' / ' + max + ' · ' + pct + '%' +
      (passed == null ? '' : passed ? ' · passed' : ' · below ' + passing + '%')));
    var cont = SPEC.feedback.content || {};
    head.appendChild(el('p', null, esc(passed === false ? (cont.summaryFailed || '') : (cont.summaryPassed || ''))));
    var reach = reachableCeiling();
    if (reach < max)
      head.appendChild(el('p', { class: 'caption' },
        'Note: the highest score reachable in this build is <b>' + reach + '</b>, not ' + max +
        '. Every stage caps below the points it advertises, so a flawless run cannot score 100%.'));
    mainEl.appendChild(head);

    // objective rollup — DERIVED, never authored
    var roll = el('section', { class: 'card' });
    roll.appendChild(el('h3', null, 'By objective'));
    var list = el('div', { class: 'obj-rollup' });
    (SPEC.objectives || []).forEach(function (o) {
      var mine = STEPS.filter(function (s) { return s.graded && (s.objectiveIds || []).indexOf(o.id) >= 0; });
      var got = mine.filter(function (s) { return (S.answered[s.id] || {}).correct; }).length;
      list.appendChild(el('div', { class: 'o' },
        '<span>' + esc(o.statement) + ' <span class="tag">' + esc(o.bloom) + '</span></span><b>' + got + ' / ' + mine.length + '</b>'));
    });
    roll.appendChild(list);
    mainEl.appendChild(roll);

    (SPEC.debrief || []).forEach(function (d) {
      var c = el('section', { class: 'card' });
      c.appendChild(el('h3', null, esc(d.headline)));
      if (d.body) c.appendChild(el('p', null, mdish(d.body)));
      if (d.processMap) {
        var pm = el('div', { class: 'row' });
        d.processMap.forEach(function (n, i) {
          pm.appendChild(el('span', { class: 'tag' }, esc(n.label)));
          if (i < d.processMap.length - 1) pm.appendChild(el('span', { class: 'caption' }, '→'));
        });
        c.appendChild(pm);
      }
      if (d.takeaways) {
        var ul = el('ul'); d.takeaways.forEach(function (t) { ul.appendChild(el('li', null, mdish(t).replace(/^<p>|<\/p>$/g, ''))); });
        c.appendChild(ul);
      }
      if (d.earnedNotes) {
        var notes = STEPS.filter(function (s) { return (S.answered[s.id] || {}).correct; })
          .map(function (s) {
            var o = (s.interaction.options || []).filter(function (x) { return x.id === S.answered[s.id].optionId; })[0];
            return o && o.feedback ? '<li><b>' + esc(s.title || s.id) + '</b> — ' + esc(o.feedback) + '</li>' : '';
          }).join('');
        if (notes) c.appendChild(el('div', null, '<h4>What you earned</h4><ul>' + notes + '</ul>'));
      }
      mainEl.appendChild(c);
    });

    if ((SPEC.telemetry || {}).route === 'completion-code') {
      var cc = el('section', { class: 'card' });
      cc.appendChild(el('h3', null, 'Completion code'));
      cc.appendChild(el('p', { class: 'caption' }, 'Paste this into the LMS. It carries one row per item: which option, whether it was correct, attempts, hint use and seconds.'));
      cc.appendChild(el('div', { class: 'code' }, esc(completionCode())));
      mainEl.appendChild(cc);
    }
    var again = el('button', { class: 'btn ghost', type: 'button' }, 'Play again');
    again.setAttribute('data-role', 'restart');
    again.onclick = function () { location.reload(); };
    mainEl.appendChild(el('div', { class: 'row' })).appendChild(again);
    announce('Debrief. ' + total + ' of ' + max + '.');
  }

  function completionCode() {
    var t = SPEC.telemetry.completionCode || {};
    var payload = [1, (t.prefix || 'GS'), S.persona || '', S.meters[GRADE_METER] || 0, maxScore(),
      S.records.map(function (r) {
        return [STEPS.findIndex(function (s) { return s.id === r.stepId; }), r.correct ? 1 : 0, r.attempts, r.hinted ? 1 : 0, Math.round(r.ms / 1000)];
      })];
    var b64 = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    var sum = 0; for (var i = 0; i < b64.length; i++) sum = (sum * 31 + b64.charCodeAt(i)) >>> 0;
    return (t.prefix || 'GS') + '-' + b64 + '-' + sum.toString(36).slice(0, 4);
  }

  /* --------------------------------------------- headless probe (Agent 6) */
  window.render_game_to_text = function () {
    var step = currentStep();
    return {
      spec: SPEC.meta.id,
      segment: SEG[S.segIndex] && SEG[S.segIndex].id,
      step: step && step.id,
      stepType: step && step.interaction.type,
      graded: step ? !!step.graded : null,
      prompt: step && step.prompt,
      objectiveIds: step && step.objectiveIds,
      options: step && (step.interaction.options || []).map(function (o) { return { id: o.id, label: o.label }; }),
      meters: JSON.parse(JSON.stringify(S.meters)),
      answered: Object.keys(S.answered).filter(function (k) { return k.charAt(0) !== '~'; }).length,
      totalGraded: STEPS.filter(function (s) { return s.graded; }).length,
      finished: !step
    };
  };
  // A headless playtest is Agent 6's instrument, so it ships with the runtime
  // rather than living in a throwaway script. It drives the real DOM: if a
  // renderer is broken, autoplay fails the same way a student would.
  window.probe_autoplay = function (opts) {
    opts = opts || {};
    var perfect = opts.perfect !== false, guard = 0, limit = opts.maxSteps || 400;
    var tries = {}, maxTries = opts.maxTriesPerStep || 3;
    if (PERSONAS.length && !S.persona) {
      applyPersona(opts.persona || PERSONAS[0].id);
      S.segIndex = 0; S.stepIndex = 0; render();
    }
    while (guard++ < limit) {
      var step = currentStep();
      if (!step) break;
      tries[step.id] = (tries[step.id] || 0) + 1;
      if (tries[step.id] > maxTries) {
        // retryPolicy 'until-correct-free' never advances on a wrong answer;
        // a worst-case run is expected to stop here, not to loop.
        return { ok: true, haltedAt: step.id, reason: 'retry-policy-blocks-advance',
          steps: guard, score: S.meters[GRADE_METER], max: maxScore(),
          correct: Object.keys(S.answered).filter(function (k) { return k.charAt(0) !== '~' && S.answered[k].correct; }).length,
          graded: inScope().filter(function (s) { return s.graded; }).length };
      }
      var before = step.id + '#' + S.stepIndex + '#' + S.segIndex;
      answerCurrent(step, perfect);
      if (S.finished) break;
      var after = currentStep();
      var now = after ? after.id + '#' + S.stepIndex + '#' + S.segIndex : 'END';
      if (now === before) {                 // renderer did not advance
        var cont = mainEl.querySelector('.row .btn[data-role="advance"]:not([disabled])');
        if (cont) { cont.click(); continue; }
        // Not stuck yet: an until-correct policy is SUPPOSED to hold a wrong
        // answer in place. Only a step that resists maxTries is a real stall,
        // and that is handled at the top of the loop.
        if (tries[step.id] <= maxTries) continue;
        return { ok: false, stuckAt: step.id, type: step.interaction.type, guard: guard };
      }
    }
    return {
      ok: true, steps: guard,
      score: S.meters[GRADE_METER], max: maxScore(),
      meters: JSON.parse(JSON.stringify(S.meters)),
      persona: S.persona || null,
      correct: Object.keys(S.answered).filter(function (k) { return k.charAt(0) !== '~' && S.answered[k].correct; }).length,
      graded: inScope().filter(function (s) { return s.graded; }).length
    };
  };
  function clickText(needle) {
    var bs = mainEl.querySelectorAll('button');
    for (var i = 0; i < bs.length; i++)
      if (!bs[i].hasAttribute('disabled') && bs[i].textContent.indexOf(needle) >= 0) { bs[i].click(); return true; }
    return false;
  }
  function clickBtn(label) {
    var adv = mainEl.querySelector('.row .btn[data-role="advance"]:not([disabled])');
    if (adv && (!label || adv.textContent.trim() === label)) { adv.click(); return true; }
    var bs = mainEl.querySelectorAll('.row .btn');
    for (var i = 0; i < bs.length; i++) {
      if (bs[i].getAttribute('data-role') === 'restart') continue;
      if (!bs[i].hasAttribute('disabled') && (!label || bs[i].textContent.trim() === label)) { bs[i].click(); return true; }
    }
    return false;
  }
  function answerCurrent(step, perfect) {
    var it = step.interaction, i;
    if (it.type === 'mcq' || it.type === 'drag-to-target') {
      var pool = it.type === 'mcq' ? it.options : it.targets;
      var want = pool.filter(function (o) { return perfect ? o.correct : !o.correct; })[0] || pool[0];
      var btn = mainEl.querySelector('button.opt[data-opt="' + want.id + '"]:not([disabled])');
      if (btn) btn.click(); else clickText(want.label.slice(0, 26));
      clickBtn('Continue');
      return;
    }
    if (it.type === 'numeric') {
      var inp = mainEl.querySelector('input');
      inp.value = perfect ? String(evalExpr(it.expectedExpr, scope)) : '0';
      clickBtn('Check'); clickBtn('Continue'); return;
    }
    if (it.type === 'multi-blank') {
      var ins = mainEl.querySelectorAll('input');
      for (i = 0; i < ins.length; i++) ins[i].value = perfect ? String(evalExpr(it.blanks[i].expectedExpr, scope)) : '0';
      clickBtn('Check'); clickBtn('Continue'); return;
    }
    if (it.type === 'classify') {
      var rows = mainEl.querySelectorAll('.row');
      for (i = 0; i < it.items.length; i++) {
        var bi = it.buckets.map(function (b) { return b.id; }).indexOf(perfect ? it.items[i].correctBucket : it.buckets[0].id);
        var chips = rows[i] && rows[i].querySelectorAll('.chip');
        if (chips && chips[bi]) chips[bi].click();
      }
      clickBtn('Check'); clickBtn('Continue'); return;
    }
    if (it.type === 'select-from-set') {
      var ds = datasetById[it.datasetId], key = ds.columns[0].key;
      var chips2 = mainEl.querySelectorAll('.chip');
      for (i = 0; i < ds.rows.length; i++)
        if (it.correct.indexOf(String(ds.rows[i][key])) >= 0 && chips2[i]) chips2[i].click();
      clickBtn('Check'); clickBtn('Continue'); return;
    }
    if (it.type === 'traverse') {
      for (var hop = 0; hop < 8; hop++) {
        var opt = mainEl.querySelectorAll('button.opt');
        if (!opt.length) break;
        var moved = false;
        for (i = 0; i < opt.length; i++) {
          if (opt[i].hasAttribute('disabled')) continue;
          opt[i].click();
          if (!mainEl.querySelector('.fb.no')) { moved = true; break; }
        }
        if (!moved) break;
      }
      clickBtn('Continue'); return;
    }
    if (it.type === 'extension') {
      var divs = mainEl.querySelectorAll('div'), host = null;
      for (var h = 0; h < divs.length; h++) if (divs[h].__probeSolve) { host = divs[h]; break; }
      if (host) host.__probeSolve();
      if (!clickBtn('Continue')) {
        // the widget is not shipped: the declared fallback is on screen instead
        var ext = extById[it.extensionId] || {};
        var fbOpts = ((ext.fallback || {}).interaction || {}).options || [];
        var want = fbOpts.filter(function (o) { return perfect ? o.correct : !o.correct; })[0] || fbOpts[0];
        if (want) clickText(want.label.slice(0, 26));
        clickBtn('Continue');
      }
      return;
    }
    // narrative, navigate, sandbox, unsupported
    if (it.type === 'sandbox') clickText('Generate');
    if (!clickBtn('Continue')) clickBtn();
  }

  /* ---------------------------------------------------------------- boot */
  document.addEventListener('DOMContentLoaded', function () {
    try { var th = localStorage.getItem('gs_theme'); if (th) document.documentElement.setAttribute('data-theme', th); } catch (e) { /* private mode */ }
    document.body.appendChild(el('header', { class: 'hud' }));
    mainEl = el('main'); document.body.appendChild(mainEl);
    liveEl = el('div', { class: 'sr-only', 'aria-live': 'polite', 'aria-atomic': 'true' });
    document.body.appendChild(liveEl);
    var f = el('footer', { class: 'legend' },
      esc(SPEC.meta.course || '') + (SPEC.meta.chapter ? ' · ' + esc(SPEC.meta.chapter) : '') +
      ' · generated from GameSpec ' + esc(SPEC.gamespec) + ' · ' + esc(SPEC.meta.id));
    document.body.appendChild(f);
    render();
  });
})();

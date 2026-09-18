// N + C families — the arithmetic and narrative-provenance backbone.
//
// Generalises agent56-pilot/agent5/numeric-checks.mjs from eleven closures
// hand-keyed to one game's case ids into checks that run over ANY spec. What
// makes that portable is knowledge.params: every number a student is graded
// against enters the spec exactly once.
import { makeScope, evalExpr, renderings, gradedCorpus, usd } from '../lib.mjs';

/** currency / percentage / bare-quantity tokens in a string */
const NUM_TOKEN = /\$\s?-?[\d,]+(?:\.\d+)?|-?[\d,]+(?:\.\d+)?\s?%|(?<![\w.])-?\d[\d,]*(?:\.\d+)?(?![\w.])/g;
const parseTok = (t) => Number(String(t).replace(/[$,%\s]/g, ''));
/** prose quantifiers that make a claim ABOUT numbers: "within ±2%", "off by $1,900" */
const QUANTIFIER = /(within|under|over|off by|by)\s*(?:±|\+\/-)?\s*(\$?\s?[\d,.]+\s?%?)/gi;
// "within 2%" is a BOUND and must hold strictly. "off by 0.03%" is a STATED
// MEASUREMENT and is compared at the precision it is stated to. Collapsing the
// two lets a rounding allowance swallow a real breach of a bound.
const isBound = (verb) => /^(within|under)$/i.test(verb.trim());

export const checks = [
{
  id: 'N1', name: 'assertions-pass', family: 'numeric', reads: ['assurance.assertions', 'knowledge'],
  run(spec, ctx, r) {
    const scope = makeScope(spec);
    const corpus = gradedCorpus(spec);
    for (const a of spec.assurance?.assertions ?? []) {
      const sev = a.severity === 'WARN' ? 'warn' : 'error';
      try {
        if (a.kind === 'identity') {
          const v = evalExpr(a.expr, scope);
          const ok = a.expected === undefined
            ? Boolean(v)
            : Math.abs(Number(v) - Number(a.expected)) <= (a.tol ?? 0.01);
          if (!ok) r[sev]('N1 assertions-pass', `assurance.assertions/${a.id}`,
            `${a.describe} — evaluated to ${v}, expected ${a.expected ?? 'true'}`);
        } else if (a.kind === 'must-appear') {
          const v = evalExpr(a.expr, scope);
          const want = renderings(v);
          const scanned = a.corpus?.length
            ? corpus.filter((c) => a.corpus.some((p) => c.target.includes(p)))
            : corpus;
          const hit = scanned.some((c) => want.some((w) => c.text.includes(w)));
          if (!hit) r[sev]('N1 assertions-pass', `assurance.assertions/${a.id}`,
            `${a.describe} — recomputed ${want[0]} but no graded text contains it`);
        } else if (a.kind === 'range') {
          const v = Number(evalExpr(a.expr, scope));
          const [lo, hi] = a.expected ?? [];
          if (!(v >= lo && v <= hi)) r[sev]('N1 assertions-pass', `assurance.assertions/${a.id}`,
            `${a.describe} — ${v} outside [${lo}, ${hi}]`);
        }
      } catch (e) {
        r.error('N1 assertions-pass', `assurance.assertions/${a.id}`, `expression failed: ${e.message}`);
      }
    }
  },
},
{
  id: 'N1b', name: 'assertions-written-blind', family: 'numeric', reads: ['assurance.assertions', 'provenance.gates'],
  // Mechanism C, information hiding. If the audit program is written after the
  // sample is drawn, "every assertion passes" is satisfiable by writing the
  // assertions the existing numbers already satisfy — self-grading dressed as
  // independence.
  run(spec, ctx, r) {
    const gate5 = (spec.provenance?.gates ?? []).find((g) => g.agent === 5);
    if (!gate5) return;
    const blind = (gate5.hiddenFrom ?? []).some((p) => p.startsWith('flow'));
    if (!blind)
      r.warn('N1b assertions-written-blind', 'provenance.gates[5].hiddenFrom',
        'gate 5 did not hide flow/interaction from Agent 5, so assertions could be fitted to the answer key');
    for (const a of spec.assurance?.assertions ?? [])
      if (a.writtenAtGate != null && a.writtenAtGate > 5)
        r.error('N1b assertions-written-blind', `assurance.assertions/${a.id}`,
          `written at gate ${a.writtenAtGate}, after Agent 5 had seen the flow`);
  },
},
{
  id: 'N2', name: 'numeric-provenance', family: 'numeric', reads: ['knowledge', 'flow.steps'],
  run(spec, ctx, r) {
    const scope = makeScope(spec);
    const known = new Set();
    const addKnown = (v) => { if (typeof v === 'number') renderings(v).forEach((s) => known.add(s)); };
    for (const v of Object.values(spec.knowledge?.params ?? {}))
      Array.isArray(v) ? v.forEach(addKnown) : addKnown(v);
    for (const t of spec.knowledge?.thresholds ?? []) addKnown(t.value);
    for (const ds of spec.knowledge?.datasets ?? [])
      for (const row of ds.rows ?? []) Object.values(row).forEach(addKnown);
    for (const d of spec.knowledge?.derivations ?? []) {
      try { addKnown(Number(evalExpr(d.expr, scope))); } catch { /* reported by N4 */ }
    }
    // small integers are prose, not data: "the three promises", "step 2"
    const trivial = (n) => Number.isInteger(n) && Math.abs(n) <= 12;
    // clock times (4:47 PM) and calendar dates (November 28, Nov 30) are prose
    const MONTH = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*';
    const prose = (text, tok) => {
      const i = text.indexOf(tok);
      if (i < 0) return false;
      const before = text.slice(Math.max(0, i - 14), i);
      const after = text.slice(i + tok.length, i + tok.length + 6);
      if (/\d\s?:\s?$/.test(before) || /^\s?:\s?\d/.test(after)) return true;   // 4:47
      if (new RegExp(MONTH + '\\s+$').test(before)) return true;                   // November 28
      if (/\b(19|20)\d{2}\b/.test(tok)) return true;                             // a year
      return false;
    };
    for (const { target, text } of gradedCorpus(spec)) {
      for (const tok of text.match(NUM_TOKEN) ?? []) {
        const n = parseTok(tok);
        if (!Number.isFinite(n) || trivial(n) || prose(text, tok)) continue;
        if (known.has(tok.trim()) || known.has(String(n)) || known.has(usd(n))) continue;
        r.warn('N2 numeric-provenance', target,
          `'${tok.trim()}' appears in graded text but is not derivable from knowledge.params, a dataset or a declared derivation`);
      }
    }
  },
},
{
  id: 'N3', name: 'dataset-invariants', family: 'numeric', reads: ['knowledge.datasets'],
  run(spec, ctx, r) {
    for (const ds of spec.knowledge?.datasets ?? []) {
      for (const inv of ds.invariants ?? []) {
        const t = `knowledge.datasets/${ds.id}`;
        const col = (k) => ds.rows.map((row) => Number(row[k]));
        if (inv.kind === 'rowCount' && ds.rows.length !== Number(inv.target))
          r.error('N3 dataset-invariants', t, `rowCount is ${ds.rows.length}, declared ${inv.target}`);
        if (inv.kind === 'sumTo' || inv.kind === 'footTo') {
          const s = col(inv.column).reduce((a, b) => a + b, 0);
          if (Math.abs(s - Number(inv.target)) > (inv.tol ?? 0.01))
            r.error('N3 dataset-invariants', t, `${inv.column} sums to ${s}, declared ${inv.target}`);
        }
        if (inv.kind === 'probabilityVector') {
          const s = col(inv.column).reduce((a, b) => a + b, 0);
          if (Math.abs(s - 1) > (inv.tol ?? 0.005))
            r.error('N3 dataset-invariants', t, `${inv.column} is a probability vector but sums to ${s.toFixed(4)}`);
        }
      }
    }
  },
},
{
  id: 'N4', name: 'derived-from-source', family: 'numeric', reads: ['knowledge.derivations', 'knowledge.datasets'],
  run(spec, ctx, r) {
    const scope = makeScope(spec);
    for (const d of spec.knowledge?.derivations ?? []) {
      try {
        const v = evalExpr(d.expr, scope);
        if (v === undefined || (typeof v === 'number' && !Number.isFinite(v)))
          r.error('N4 derived-from-source', `knowledge.derivations/${d.id}`, `expression evaluates to ${v}`);
      } catch (e) {
        r.error('N4 derived-from-source', `knowledge.derivations/${d.id}`, `expression failed: ${e.message}`);
      }
    }
    for (const ds of spec.knowledge?.datasets ?? []) {
      if (ds.role !== 'illustrative') continue;
      if (!(ds.notDerivedFrom ?? []).length)
        r.error('N4 derived-from-source', `knowledge.datasets/${ds.id}`,
          "role 'illustrative' requires notDerivedFrom: name the dataset a reader must NOT read this as a summary of");
      if (!(ds.provenanceLabel ?? '').trim())
        r.error('N4 derived-from-source', `knowledge.datasets/${ds.id}`,
          "role 'illustrative' requires provenanceLabel, rendered on screen, so it cannot silently sit beside the table it contradicts");
    }
  },
},
{
  id: 'N5', name: 'distractor-derivability', family: 'numeric', reads: ['flow.steps'],
  run(spec, ctx, r) {
    const scope = makeScope(spec);
    for (const st of ctx.steps) {
      const it = st.interaction ?? {};
      if (it.type !== 'mcq') continue;
      const correct = (it.options ?? []).find((o) => o.correct);
      const nums = (s) => new Set((String(s).match(/\$\s?[\d,]+(?:\.\d+)?/g) ?? []).map((x) => x.replace(/[$,\s]/g, '')));
      const correctNums = nums(correct?.label ?? '');
      // Only a NUMERIC-ANSWER item has numeric distractors. When the right
      // answer is prose ("Many real vendor invoice amounts"), a dollar sign in
      // a wrong option is part of a description, not a miscomputation.
      if (!correctNums.size) continue;
      const numericOpts = (it.options ?? []).filter((o) => {
        if (o.correct) return false;
        const mine = nums(o.label);
        if (!mine.size) return false;
        return [...mine].some((x) => !correctNums.has(x)); // a DIFFERENT number
      });
      for (const o of numericOpts) {
        if (!o.misconceptionFormula) {
          r.warn('N5 distractor-derivability', `flow.steps/${st.id}/${o.id}`,
            'numeric distractor with no misconceptionFormula — a wrong number nobody can explain teaches nothing');
          continue;
        }
        try {
          const v = evalExpr(o.misconceptionFormula, scope);
          if (!renderings(v).some((w) => o.label.includes(w)))
            r.error('N5 distractor-derivability', `flow.steps/${st.id}/${o.id}`,
              `misconceptionFormula yields ${v}, which does not appear in the option label '${o.label}'`);
        } catch (e) {
          r.error('N5 distractor-derivability', `flow.steps/${st.id}/${o.id}`, `misconceptionFormula failed: ${e.message}`);
        }
      }
    }
  },
},
{
  id: 'N6', name: 'threshold-provenance', family: 'numeric', reads: ['knowledge.thresholds', 'flow.steps'],
  run(spec, ctx, r) {
    const declared = new Set((spec.knowledge?.thresholds ?? []).map((t) => t.name.replace(/-/g, '_')));
    const exprs = [];
    for (const st of ctx.steps) {
      const it = st.interaction ?? {};
      if (it.expectedExpr) exprs.push([`flow.steps/${st.id}`, it.expectedExpr]);
      for (const b of it.blanks ?? []) exprs.push([`flow.steps/${st.id}.blank`, b.expectedExpr]);
      if (it.successCriterion) exprs.push([`flow.steps/${st.id}`, it.successCriterion]);
      for (const e of st.edges ?? []) if (e.precondition) exprs.push([`flow.steps/${st.id}.edge`, e.precondition]);
    }
    for (const [target, ex] of exprs)
      for (const lit of String(ex).match(/(?<![\w.])\d+(?:\.\d+)?(?![\w.])/g) ?? []) {
        const n = Number(lit);
        if (Number.isInteger(n) && Math.abs(n) <= 12) continue;
        if (declared.has(lit)) continue;
        r.warn('N6 threshold-provenance', target,
          `bare literal ${lit} in a correctness expression; declare it in knowledge.thresholds with a kind and a sourceId`);
      }
    for (const t of spec.knowledge?.thresholds ?? [])
      if (t.kind === 'standard' && !t.sourceId)
        r.error('N6 threshold-provenance', `knowledge.thresholds/${t.name}`, "kind 'standard' requires a sourceId");
  },
},
{
  id: 'N7', name: 'single-source-of-truth', family: 'numeric', reads: ['tree', 'knowledge.derivations'],
  run(spec, ctx, r) {
    const ids = new Set();
    for (const t of spec.tree ?? []) {
      if (ids.has(t.id)) r.error('N7 single-source-of-truth', `tree/${t.id}`, 'duplicate rule-set id');
      ids.add(t.id);
      const nodes = new Set(t.nodes.map((n) => n.id));
      for (const b of t.branches) {
        if (!nodes.has(b.from)) r.error('N7 single-source-of-truth', `tree/${t.id}`, `branch '${b.id}' leaves unknown node '${b.from}'`);
        if (!nodes.has(b.to)) r.error('N7 single-source-of-truth', `tree/${t.id}`, `branch '${b.id}' enters unknown node '${b.to}'`);
      }
      for (const n of t.nodes) {
        const out = t.branches.filter((b) => b.from === n.id);
        if (n.kind === 'leaf' && out.length) r.error('N7 single-source-of-truth', `tree/${t.id}`, `leaf '${n.id}' has outgoing branches`);
        if (n.kind === 'decision' && out.length < 2) r.error('N7 single-source-of-truth', `tree/${t.id}`, `decision node '${n.id}' has ${out.length} branch(es)`);
      }
    }
  },
},
{
  id: 'N8', name: 'boundary-consistency', family: 'numeric', reads: ['knowledge.thresholds', 'flow.steps', 'tree'],
  // The defect class is a boundary that is counted twice (lte AND gte) or not
  // covered at all (lt AND gt), not "every comparison uses the inclusive op" —
  // a correct partition necessarily uses one inclusive and one exclusive side.
  run(spec, ctx, r) {
    for (const t of spec.knowledge?.thresholds ?? []) {
      const uses = [];
      for (const tree of spec.tree ?? [])
        for (const b of tree.branches)
          if (b.predicate && Number(b.predicate.value) === t.value)
            uses.push({ tree: tree.id, branch: b.id, op: b.predicate.op });
      const ops = new Set(uses.map((u) => u.op));
      const t0 = `knowledge.thresholds/${t.name}`;
      if (ops.has('lte') && ops.has('gte'))
        r.error('N8 boundary-consistency', t0,
          `both branches include the boundary value ${t.value}: a record exactly at the threshold matches two paths`);
      if (ops.has('lt') && ops.has('gt') && !ops.has('lte') && !ops.has('gte'))
        r.error('N8 boundary-consistency', t0,
          `neither branch includes the boundary value ${t.value}: a record exactly at the threshold matches no path`);
      if (typeof t.inclusive === 'boolean' && uses.length) {
        const wantLow = t.inclusive ? 'lte' : 'lt';
        const low = uses.find((u) => u.op === 'lte' || u.op === 'lt');
        if (low && low.op !== wantLow)
          r.error('N8 boundary-consistency', `tree/${low.tree}/${low.branch}`,
            `threshold '${t.name}' is declared ${t.inclusive ? 'inclusive' : 'exclusive'} but its low branch uses '${low.op}'`);
      }
    }
  },
},
{
  id: 'N9', name: 'cross-step-coherence', family: 'numeric', reads: ['flow.steps', 'knowledge'],
  run(spec, ctx, r) {
    const scope = makeScope(spec);
    const answers = [];
    for (const st of ctx.steps) {
      const it = st.interaction ?? {};
      if (it.type === 'numeric' && it.expectedExpr) {
        try { answers.push({ step: st.id, value: Number(evalExpr(it.expectedExpr, scope)) }); } catch { /* N4 reports */ }
      }
    }
    // a later step restating an earlier answer must restate it correctly
    const order = ctx.steps.map((s) => s.id);
    for (const st of ctx.steps) {
      const idx = order.indexOf(st.id);
      const text = `${st.prompt ?? ''} ${st.caption ?? ''} ${st.why ?? ''}`;
      for (const a of answers) {
        if (order.indexOf(a.step) >= idx) continue;
        const near = (text.match(NUM_TOKEN) ?? []).map(parseTok)
          .filter((n) => Number.isFinite(n) && Math.abs(n - a.value) > 1e-9 && Math.abs(n - a.value) / Math.max(1, Math.abs(a.value)) < 0.02);
        for (const n of near)
          r.warn('N9 cross-step-coherence', `flow.steps/${st.id}`,
            `restates step '${a.step}' answer ${a.value} as ${n} — bind it to the earlier step instead of retyping it`);
      }
    }
  },
},
{
  id: 'C2c', name: 'narrative-relation-holds', family: 'context', reads: ['scenario.beats', 'knowledge'],
  // A declared relation is a claim too. `approximately` with a tolerance the
  // number does not actually satisfy is a mis-declaration, and without this
  // check the declaration would be a free opt-out from C2a.
  run(spec, ctx, r) {
    const scope = makeScope(spec);
    for (const b of spec.scenario?.beats ?? [])
      for (const n of b.narrativeNumbers ?? []) {
        if (n.relation !== 'approximately' || !n.ofDerivation) continue;
        let base;
        try { base = Number(evalExpr(`d.${n.ofDerivation.replace(/-/g, '_')}`, scope)); } catch { continue; }
        const actual = parseTok(n.token);
        if (!Number.isFinite(actual) || !Number.isFinite(base)) continue;
        const dev = Math.abs(actual - base);
        if (n.tol != null && dev > n.tol)
          r.error('C2c narrative-relation-holds', `scenario.beats/${b.id}`,
            `'${n.token}' is declared approximately ${n.ofDerivation} (${base}) within ${n.tol}, but differs by ${dev.toFixed(2)}`);
      }
  },
},
// ------------------------------------------------------------------ C family
{
  id: 'C1', name: 'scenario-coverage', family: 'context', reads: ['scenario', 'flow.segments'],
  run(spec, ctx, r) {
    if (!spec.scenario || spec.scenario.framing === 'none') return;
    for (const seg of spec.flow?.segments ?? []) {
      for (const pid of seg.personaScope ?? []) {
        const p = (spec.scenario.personas ?? []).find((x) => x.id === pid);
        if (!p) { r.error('C1 scenario-coverage', `flow.segments/${seg.id}`, `unknown persona '${pid}'`); continue; }
      }
      for (const sid of seg.settingScope ?? []) {
        const s = (spec.scenario.settings ?? []).find((x) => x.id === sid);
        if (!s) { r.error('C1 scenario-coverage', `flow.segments/${seg.id}`, `unknown setting '${sid}'`); continue; }
        const missing = (seg.objectiveIds ?? []).filter((o) => !(s.contextualModifiers ?? {})[o]);
        if (missing.length)
          r.warn('C1 scenario-coverage', `scenario.settings/${sid}`,
            `offered for segment '${seg.id}' but carries no contextualModifier for objective(s) ${missing.join(', ')}`);
      }
    }
    // A cast member earns their place by speaking OR by being rendered — the
    // Cash Receipts staff are drawn on the office floor and never have a line.
    const elsewhere = JSON.stringify({ ...spec, scenario: { ...spec.scenario, cast: undefined } });
    for (const c of spec.scenario.cast ?? []) {
      const speaks = (spec.scenario.beats ?? []).some((b) => (b.lines ?? []).some((l) => l.who === c.id));
      const rendered = elsewhere.includes(`"${c.id}"`);
      if (!speaks && !rendered)
        r.warn('C1 scenario-coverage', `scenario.cast/${c.id}`, 'declared but never speaks and never appears anywhere else in the spec');
    }
  },
},
{
  id: 'C2a', name: 'narrative-number-provenance', family: 'context', reads: ['scenario.beats', 'knowledge'],
  run(spec, ctx, r) {
    const scope = makeScope(spec);
    const known = new Set();
    for (const v of Object.values(spec.knowledge?.params ?? {}))
      (Array.isArray(v) ? v : [v]).forEach((x) => { if (typeof x === 'number') renderings(x).forEach((s) => known.add(s)); });
    for (const d of spec.knowledge?.derivations ?? []) {
      try { renderings(Number(evalExpr(d.expr, scope))).forEach((s) => known.add(s)); } catch { /* N4 */ }
    }
    for (const b of spec.scenario?.beats ?? []) {
      const declared = new Set((b.narrativeNumbers ?? []).map((n) => n.token.trim()));
      const text = [...(b.lines ?? []).map((l) => l.text), ...(b.blocks ?? []).map((x) => `${x.text ?? ''} ${x.label ?? ''} ${x.aux ?? ''} ${x.value ?? ''}`)].join(' ');
      for (const tok of text.match(NUM_TOKEN) ?? []) {
        const n = parseTok(tok);
        if (!Number.isFinite(n) || (Number.isInteger(n) && Math.abs(n) <= 12)) continue;
        if (known.has(tok.trim()) || declared.has(tok.trim())) continue;
        r.error('C2a narrative-number-provenance', `scenario.beats/${b.id}`,
          `beat introduces '${tok.trim()}', which is neither derivable from knowledge nor declared in narrativeNumbers`);
      }
    }
  },
},
{
  id: 'C2b', name: 'narrative-quantifier-holds', family: 'context', reads: ['scenario.beats', 'knowledge', 'assurance.assertions'],
  // Closes the declaration loophole. A prose quantifier ranging over narrative
  // numbers is itself a claim, and must be evaluated: the corpus ships a "±2%"
  // that is actually -2.04%.
  run(spec, ctx, r) {
    const scope = makeScope(spec);
    for (const b of spec.scenario?.beats ?? []) {
      const text = [...(b.lines ?? []).map((l) => l.text), ...(b.blocks ?? []).map((x) => `${x.text ?? ''} ${x.value ?? ''}`)].join(' ');
      const quants = [...text.matchAll(QUANTIFIER)];
      if (!quants.length) continue;
      const nn = b.narrativeNumbers ?? [];
      for (const q of quants) {
        const verb = q[1];
        const claimTok = q[2].trim();
        const claim = parseTok(claimTok);
        const isPct = claimTok.includes('%');
        const related = nn.filter((x) => x.relation === 'approximately' && x.ofDerivation);
        if (!related.length) {
          r.error('C2b narrative-quantifier-holds', `scenario.beats/${b.id}`,
            `prose claims '${q[0].trim()}' about numbers in this beat, but no narrativeNumbers entry declares a relation to a derivation — the claim is unverifiable`);
          continue;
        }
        for (const x of related) {
          let base;
          try { base = Number(evalExpr(`d.${x.ofDerivation.replace(/-/g, '_')}`, scope)); } catch { continue; }
          const actual = parseTok(x.token);
          const devRaw = isPct ? Math.abs(actual - base) / Math.abs(base) * 100 : Math.abs(actual - base);
          const dp = (claimTok.split('.')[1] ?? '').replace(/[^0-9]/g, '').length;
          const dev = isBound(verb) ? devRaw : Number(devRaw.toFixed(dp));
          if (dev > claim + 1e-9)
            r.error('C2b narrative-quantifier-holds', `scenario.beats/${b.id}`,
              `prose claims '${q[0].trim()}' but '${x.token}' deviates from ${x.ofDerivation} (${base}) by ${devRaw.toFixed(2)}${isPct ? '%' : ''}` +
              (isBound(verb) ? ' — "within" is a bound, so it must hold exactly' : ''));
        }
      }
    }
  },
},
];

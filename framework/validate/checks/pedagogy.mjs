// P family — constructive alignment, made a compile-time check.
//
// This family exists because Agent 1's output is the documented weak spot of
// every game in the repo: the framework-matching spreadsheet scores Learning
// Design "Strong" in only 4 of 9 games, and the corpus extraction found that
// learning objectives exist in NONE of the five games as data — only as intent.
// Several of these checks are genuinely ARITY-2 (they read agent 1's objectives
// against agent 4's steps) and are therefore among the few that may be cited
// as evidence that the pipeline is load-bearing.
import { deriveAssessedBy, chanceOf } from '../lib.mjs';

const BLOOM = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'];
const rank = (b) => BLOOM.indexOf(b);

export const checks = [
{
  id: 'P1', name: 'every-graded-step-has-an-objective', family: 'pedagogy', reads: ['flow.steps', 'objectives'],
  run(spec, ctx, r) {
    for (const st of ctx.steps)
      if (st.graded && !(st.objectiveIds ?? []).length)
        r.error('P1 graded-step-has-objective', `flow.steps/${st.id}`,
          'graded step cites no objective — it awards points for something nobody declared the student should learn');
  },
},
{
  id: 'P2', name: 'every-objective-is-assessed', family: 'pedagogy', reads: ['objectives', 'flow.steps'],
  run(spec, ctx, r) {
    const map = deriveAssessedBy(spec);
    for (const o of spec.objectives ?? []) {
      const need = o.minGradedItems ?? (rank(o.bloom) >= rank('analyze') ? 2 : 1);
      const got = (map[o.id] ?? []).length;
      if (got < need)
        r.error('P2 objective-assessed', `objectives/${o.id}`,
          `assessed by ${got} graded item(s), needs ${need} (bloom '${o.bloom}')`);
    }
  },
},
{
  id: 'P2b', name: 'extension-assessment-is-checkable', family: 'pedagogy', reads: ['extensions', 'objectives', 'flow.steps'],
  run(spec, ctx, r) {
    const map = deriveAssessedBy(spec);
    for (const o of spec.objectives ?? []) {
      const by = map[o.id] ?? [];
      if (!by.length || !by.every((x) => x.startsWith('ext:'))) continue;
      for (const id of by) {
        const ext = (spec.extensions ?? []).find((e) => `ext:${e.id}` === id);
        if (!ext?.pedagogy?.successCriterion)
          r.error('P2b extension-assessment-checkable', `extensions/${ext?.id ?? id}`,
            `is the ONLY assessor of objective '${o.id}' but declares no machine-checkable successCriterion`);
      }
    }
  },
},
{
  id: 'P3', name: 'bloom-match', family: 'pedagogy', reads: ['objectives', 'flow.steps'],
  run(spec, ctx, r) {
    const map = deriveAssessedBy(spec);
    for (const o of spec.objectives ?? []) {
      const steps = (map[o.id] ?? []).map((id) => ctx.byId[id]).filter(Boolean);
      if (!steps.length) continue;
      const demands = steps.map((s) => s.bloomDemand).filter(Boolean);
      if (!demands.length) {
        r.warn('P3 bloom-match', `objectives/${o.id}`, 'no assessing step declares a bloomDemand');
        continue;
      }
      if (!demands.some((d) => d === o.bloom))
        r.error('P3 bloom-match', `objectives/${o.id}`,
          `declares bloom '${o.bloom}' but no assessing step demands it (found: ${[...new Set(demands)].join(', ')})`);
      for (const s of steps)
        if (s.bloomDemand && rank(s.bloomDemand) > rank(o.bloom))
          r.warn('P3 bloom-match', `flow.steps/${s.id}`,
            `demands '${s.bloomDemand}' above its objective's declared '${o.bloom}'`);
    }
  },
},
{
  id: 'P4', name: 'taught-before-tested', family: 'pedagogy', reads: ['objectives', 'flow.steps', 'knowledge.artifacts'],
  // ARITY-2+ and genuinely cross-author: agent 1 declares the objective, agent
  // 4 orders the steps, agent 2 supplies the teaching artifact.
  run(spec, ctx, r) {
    const order = new Map();
    let n = 0;
    for (const seg of [...(spec.flow?.segments ?? [])].sort((a, b) => a.order - b.order))
      for (const st of ctx.bySegment[seg.id] ?? []) order.set(st.id, n++);
    for (const o of spec.objectives ?? []) {
      const graded = ctx.steps.filter((s) => s.graded && (s.objectiveIds ?? []).includes(o.id));
      if (!graded.length) continue;
      const first = Math.min(...graded.map((s) => order.get(s.id) ?? Infinity));
      const taught = ctx.steps.some((s) => !s.graded && (s.objectiveIds ?? []).includes(o.id) && (order.get(s.id) ?? Infinity) < first)
        || (o.taughtBy ?? []).some((id) => {
          const st = ctx.byId[id];
          return st ? (order.get(id) ?? Infinity) < first : true; // an artifact counts
        });
      if (!taught && !o.assumesPriorInstruction)
        r.error('P4 taught-before-tested', `objectives/${o.id}`,
          'first graded item is preceded by no teaching step or artifact, and assumesPriorInstruction is not declared');
      if (o.assumesPriorInstruction && !(o.priorInstructionJustification ?? '').trim())
        r.error('P4 taught-before-tested', `objectives/${o.id}`,
          'assumesPriorInstruction is true but no justification is given');
    }
  },
},
{
  id: 'P5', name: 'no-orphans-no-ghosts', family: 'pedagogy', reads: ['objectives', 'flow'],
  run(spec, ctx, r) {
    const declared = new Set((spec.objectives ?? []).map((o) => o.id));
    const referenced = new Set();
    for (const st of ctx.steps) (st.objectiveIds ?? []).forEach((o) => referenced.add(o));
    for (const seg of spec.flow?.segments ?? []) (seg.objectiveIds ?? []).forEach((o) => referenced.add(o));
    for (const e of spec.extensions ?? []) (e.pedagogy?.objectiveIds ?? []).forEach((o) => referenced.add(o));
    for (const id of referenced)
      if (!declared.has(id)) r.error('P5 no-ghosts', 'objectives', `ghost objective '${id}' is referenced but never declared`);
    for (const id of declared)
      if (!referenced.has(id)) r.error('P5 no-orphans', `objectives/${id}`, 'declared but referenced by nothing');
  },
},
{
  id: 'P6', name: 'chance-score-budget', family: 'pedagogy', reads: ['objectives', 'flow.steps'],
  run(spec, ctx, r) {
    const map = deriveAssessedBy(spec);
    for (const o of spec.objectives ?? []) {
      const steps = (map[o.id] ?? []).map((id) => ctx.byId[id]).filter(Boolean);
      if (!steps.length) continue;
      const chance = steps.reduce((acc, s) => acc * chanceOf(s), 1);
      const budget = o.maxChanceScore ?? 0.34;
      if (chance > budget)
        r.error('P6 chance-score-budget', `objectives/${o.id}`,
          `uniform guessing earns this objective with probability ${(chance * 100).toFixed(0)}%, over the declared budget of ${(budget * 100).toFixed(0)}% — add an item or widen the option set`);
    }
  },
},
{
  id: 'P7', name: 'segment-objective-coverage', family: 'pedagogy', reads: ['flow.segments', 'flow.steps'],
  run(spec, ctx, r) {
    for (const seg of spec.flow?.segments ?? []) {
      const steps = (ctx.bySegment[seg.id] ?? []).filter((s) => s.graded);
      if (!steps.length) continue;
      if (!(seg.objectiveIds ?? []).length) {
        r.error('P7 segment-objective-coverage', `flow.segments/${seg.id}`, 'awards points but cites no objective');
        continue;
      }
      const union = new Set(steps.flatMap((s) => s.objectiveIds ?? []));
      for (const o of seg.objectiveIds)
        if (!union.has(o))
          r.warn('P7 segment-objective-coverage', `flow.segments/${seg.id}`,
            `cites objective '${o}' that none of its graded steps assesses`);
    }
  },
},
{
  id: 'P8', name: 'distractor-diagnosticity', family: 'pedagogy', reads: ['flow.steps', 'feedback.policy'],
  run(spec, ctx, r) {
    const require = spec.feedback?.policy?.requireMisconceptionTag;
    for (const st of ctx.steps) {
      const opts = (st.interaction?.options ?? []).filter((o) => !o.correct);
      if (opts.length < 2) continue;
      const texts = opts.map((o) => (o.feedback || o.consequence || '').trim());
      const distinct = new Set(texts).size;
      if (distinct < texts.length) {
        const msg = 'two or more wrong options share the same feedback — the student learns which answer is wrong but not why theirs was';
        r[require ? 'error' : 'warn']('P8 distractor-diagnosticity', `flow.steps/${st.id}`, msg);
      }
      if (require) for (const o of opts)
        if (!o.misconceptionTag)
          r.error('P8 distractor-diagnosticity', `flow.steps/${st.id}/${o.id}`,
            'feedback.policy.requireMisconceptionTag is on but this distractor carries no misconceptionTag');
    }
  },
},
{
  id: 'P9', name: 'debrief-rollup-complete', family: 'pedagogy', reads: ['debrief', 'objectives'],
  run(spec, ctx, r) {
    if (!(spec.debrief ?? []).length) {
      r.warn('P9 debrief-rollup', 'debrief', 'no debrief: a student who finishes never sees what each objective was for');
      return;
    }
    const covered = new Set();
    for (const d of spec.debrief) {
      if (d.segmentId === 'final') { (spec.objectives ?? []).forEach((o) => covered.add(o.id)); continue; }
      (ctx.segments[d.segmentId]?.objectiveIds ?? []).forEach((o) => covered.add(o));
    }
    for (const o of spec.objectives ?? [])
      if (!covered.has(o.id))
        r.warn('P9 debrief-rollup', `objectives/${o.id}`, 'appears in no debrief rollup');
  },
},
];

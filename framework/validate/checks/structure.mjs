// S family — structural integrity. Mostly ARITY-1 (lint inside one agent's
// own field set), which is exactly why these may NOT be cited as evidence
// that the six-agent sequence is load-bearing. See ../arity.mjs.
import { indexSpec, stepCap, DERIVED_PATHS } from '../lib.mjs';

export const checks = [
{
  id: 'S1', name: 'score-partition', family: 'structure', reads: ['flow.segments', 'scoring'],
  run(spec, ctx, r) {
    if (spec.scoring?.model !== 'weighted-cap') return;
    const sum = (spec.flow?.segments ?? []).reduce((n, s) => n + (s.scoringWeight ?? 0), 0);
    if (Math.abs(sum - 1) > 0.001)
      r.error('S1 score-partition', 'flow.segments',
        `scoringWeight sums to ${sum.toFixed(3)}, must be 1.000 under model weighted-cap`);
  },
},
{
  id: 'S2', name: 'correctness-well-formed', family: 'structure', reads: ['flow.steps'],
  run(spec, ctx, r) {
    for (const st of ctx.steps) {
      if (!st.graded) continue;
      const it = st.interaction ?? {};
      const t = `flow.steps/${st.id}`;
      if (it.type === 'mcq') {
        const n = it.options.filter((o) => o.correct).length;
        if (n !== 1) r.error('S2 correctness-well-formed', t, `${n} options flagged correct, expected exactly 1`);
      }
      if (it.type === 'multi-select') {
        if (!(it.correctSet ?? []).length) r.error('S2 correctness-well-formed', t, 'correctSet is empty');
        const ids = new Set(it.options.map((o) => o.id));
        for (const c of it.correctSet ?? [])
          if (!ids.has(c)) r.error('S2 correctness-well-formed', t, `correctSet references unknown option '${c}'`);
      }
      if (it.type === 'classify') {
        const b = new Set(it.buckets.map((x) => x.id));
        for (const i of it.items)
          if (!b.has(i.correctBucket)) r.error('S2 correctness-well-formed', t, `item '${i.id}' targets unknown bucket '${i.correctBucket}'`);
      }
      if (it.type === 'numeric' && it.expectedExpr == null)
        r.error('S2 correctness-well-formed', t, 'numeric step has no expectedExpr');
      if (it.type === 'drag-to-target' && !it.targets.some((x) => x.correct))
        r.error('S2 correctness-well-formed', t, 'no target flagged correct');
    }
  },
},
{
  id: 'S3', name: 'feedback-present', family: 'structure', reads: ['flow.steps'],
  // Satisfied by feedback OR consequence. Cash Receipts deliberately ships ""
  // feedback plus a real consequence string (index.html:296); demanding both
  // would fabricate 24 strings and mislabel a design as a defect.
  run(spec, ctx, r) {
    for (const st of ctx.steps) {
      const it = st.interaction ?? {};
      for (const o of it.options ?? []) {
        const has = (o.feedback ?? '').trim() || (o.consequence ?? '').trim();
        if (!has) r.error('S3 feedback-present', `flow.steps/${st.id}/${o.id}`,
          'option carries neither feedback nor consequence');
      }
      if (st.graded && ['numeric', 'multi-blank'].includes(it.type) && !(st.why ?? '').trim())
        r.error('S3 feedback-present', `flow.steps/${st.id}`, 'graded computation step has no `why` explanation');
    }
  },
},
{
  id: 'S4', name: 'award-within-cap', family: 'structure', reads: ['flow.steps', 'scoring'],
  run(spec, ctx, r) {
    for (const st of ctx.steps) {
      if (!st.graded) continue;
      const cap = stepCap(spec, st);
      if (!Number.isFinite(cap)) continue;
      for (const o of st.interaction?.options ?? [])
        if ((o.award ?? 0) > cap)
          r.error('S4 award-within-cap', `flow.steps/${st.id}/${o.id}`,
            `award ${o.award} exceeds the step cap ${cap}; the runtime would silently truncate it`);
      if ((st.award?.base ?? 0) > cap)
        r.error('S4 award-within-cap', `flow.steps/${st.id}`, `award.base ${st.award.base} exceeds cap ${cap}`);
    }
  },
},
{
  id: 'S5', name: 'perfect-run-reaches-max', family: 'structure', reads: ['flow.steps', 'scoring'],
  // The check that caught the Month-End Close 75/100 defect. NOTE its arity:
  // every field it reads belongs to agent 4, so it is that author's own lint,
  // not an independent audit. Reported honestly by arity.mjs.
  run(spec, ctx, r) {
    if (spec.scoring?.model !== 'weighted-cap') return;
    const maxScore = spec.scoring?.params?.maxScore ?? 100;
    let best = 0;
    for (const st of ctx.steps) {
      if (!st.graded) continue;
      const cap = stepCap(spec, st);
      const awards = (st.interaction?.options ?? []).map((o) => o.award ?? 0);
      const top = Math.min(cap, Math.max(0, ...(awards.length ? awards : [st.award?.base ?? 0])));
      best += top;
      if (top < cap)
        r.error('S5 perfect-run-reaches-max', `flow.steps/${st.id}`,
          `best option earns ${top} of the step cap ${cap} — ${cap - top} points are unreachable`);
    }
    if (best !== maxScore)
      r.error('S5 perfect-run-reaches-max', 'scoring',
        `flawless play scores ${best}/${maxScore}, not 100%`);
  },
},
{
  id: 'S6', name: 'pass-headroom', family: 'structure', reads: ['scoring'],
  run(spec, ctx, r) {
    if (spec.scoring?.model !== 'weighted-cap') return;
    const { maxScore = 100, passingScore = 70, minHeadroom = 15 } = spec.scoring.params ?? {};
    let best = 0;
    for (const st of ctx.steps) {
      if (!st.graded) continue;
      const awards = (st.interaction?.options ?? []).map((o) => o.award ?? 0);
      best += Math.min(stepCap(spec, st), Math.max(0, ...(awards.length ? awards : [0])));
    }
    const pct = (best / maxScore) * 100;
    if (pct < passingScore)
      r.error('S6 pass-headroom', 'scoring', `passingScore ${passingScore} is unreachable (max ${pct.toFixed(0)}%)`);
    else if (pct - passingScore < minHeadroom)
      r.warn('S6 pass-headroom', 'scoring',
        `flawless play clears passingScore ${passingScore} by only ${(pct - passingScore).toFixed(0)} points — one soft answer fails a competent student`);
  },
},
{
  id: 'S7', name: 'referential-integrity', family: 'structure', reads: ['flow', 'knowledge', 'scenario', 'objectives', 'scaffolding', 'extensions'],
  run(spec, ctx, r) {
    const ids = {
      step: new Set(ctx.steps.map((s) => s.id)),
      segment: new Set(Object.keys(ctx.segments)),
      objective: new Set(Object.keys(ctx.objectives)),
      artifact: new Set((spec.knowledge?.artifacts ?? []).map((a) => a.id)),
      dataset: new Set((spec.knowledge?.datasets ?? []).map((d) => d.id)),
      derivation: new Set((spec.knowledge?.derivations ?? []).map((d) => d.id)),
      beat: new Set((spec.scenario?.beats ?? []).map((b) => b.id)),
      source: new Set((spec.meta?.sources ?? []).map((s) => s.id)),
      extension: new Set((spec.extensions ?? []).map((e) => e.id)),
      tree: new Set((spec.tree ?? []).map((t) => t.id)),
      taxonomy: new Set((spec.taxonomy ?? []).map((t) => t.id)),
    };
    const ref = (kind, id, target, field) => {
      if (id == null) return;
      if (!ids[kind].has(id)) r.error('S7 referential-integrity', target, `${field} references unknown ${kind} '${id}'`);
    };
    for (const st of ctx.steps) {
      const t = `flow.steps/${st.id}`;
      ref('segment', st.segmentId, t, 'segmentId');
      for (const o of st.objectiveIds ?? []) ref('objective', o, t, 'objectiveIds');
      for (const a of st.artifactIds ?? []) ref('artifact', a, t, 'artifactIds');
      ref('taxonomy', st.taxonomyId, t, 'taxonomyId');
      for (const e of st.edges ?? []) if (e.to !== 'end') ref('step', e.to, t, 'edges.to');
      const it = st.interaction ?? {};
      ref('dataset', it.datasetId, t, 'interaction.datasetId');
      ref('tree', it.treeId, t, 'interaction.treeId');
      ref('beat', it.beatId, t, 'interaction.beatId');
      ref('extension', it.extensionId, t, 'interaction.extensionId');
      for (const o of it.options ?? []) if (o.goTo) ref('step', o.goTo, `${t}/${o.id}`, 'goTo');
    }
    for (const seg of spec.flow?.segments ?? []) {
      for (const o of seg.objectiveIds ?? []) ref('objective', o, `flow.segments/${seg.id}`, 'objectiveIds');
      ref('source', seg.sourceRef, `flow.segments/${seg.id}`, 'sourceRef');
    }
    for (const b of spec.scenario?.beats ?? []) {
      const kind = b.attachTo.target === 'option' ? null : b.attachTo.target;
      if (kind) ref(kind, b.attachTo.id, `scenario.beats/${b.id}`, 'attachTo.id');
      for (const n of b.narrativeNumbers ?? []) ref('derivation', n.ofDerivation, `scenario.beats/${b.id}`, 'narrativeNumbers.ofDerivation');
    }
    for (const d of spec.knowledge?.derivations ?? []) ref('dataset', d.datasetId, `knowledge.derivations/${d.id}`, 'datasetId');
    for (const a of spec.knowledge?.artifacts ?? []) {
      ref('dataset', a.datasetId, `knowledge.artifacts/${a.id}`, 'datasetId');
      for (const s of a.revealedAtSteps ?? []) ref('step', s, `knowledge.artifacts/${a.id}`, 'revealedAtSteps');
    }
    for (const h of spec.scaffolding?.hints ?? []) ref('step', h.stepId, `scaffolding.hints/${h.id}`, 'stepId');
    for (const t of spec.knowledge?.thresholds ?? []) ref('source', t.sourceId, `knowledge.thresholds/${t.name}`, 'sourceId');
  },
},
{
  id: 'S8', name: 'reachability-and-termination', family: 'structure', reads: ['flow'],
  run(spec, ctx, r) {
    for (const [segId, steps] of Object.entries(ctx.bySegment)) {
      const entry = steps[0];
      if (!entry) { r.error('S8 reachability', `flow.segments/${segId}`, 'segment has no steps'); continue; }
      const seen = new Set();
      const walk = (id) => {
        if (!id || seen.has(id) || !ctx.byId[id]) return;
        seen.add(id);
        const st = ctx.byId[id];
        const outs = (st.edges ?? []).map((e) => e.to);
        for (const o of st.interaction?.options ?? []) if (o.goTo) outs.push(o.goTo);
        if (!outs.length) {
          const i = steps.findIndex((s) => s.id === id);
          if (i >= 0 && i + 1 < steps.length) outs.push(steps[i + 1].id);
        }
        outs.forEach(walk);
      };
      walk(entry.id);
      for (const st of steps)
        if (!seen.has(st.id)) r.error('S8 reachability', `flow.steps/${st.id}`, `unreachable from segment entry '${entry.id}'`);
      const terminals = steps.filter((s) => s.terminal);
      if (terminals.length !== 1)
        r.warn('S8 reachability', `flow.segments/${segId}`, `${terminals.length} terminal steps, expected exactly 1`);
    }
  },
},
{
  id: 'S9', name: 'house-conventions', family: 'structure', reads: ['knowledge.artifacts', 'flow', 'scaffolding'],
  run(spec, ctx, r) {
    const want = spec.scaffolding?.cognitiveLoad?.maxOptionsPerStep;
    if (want) for (const st of ctx.steps) {
      const n = (st.interaction?.options ?? []).length;
      if (n > want) r.warn('S9 house-conventions', `flow.steps/${st.id}`, `${n} options exceeds declared maxOptionsPerStep ${want}`);
    }
    if (spec.flow?.runtimeSemantics?.distractorArtifacts === 'active') {
      const used = new Set(ctx.steps.flatMap((s) => s.artifactIds ?? []));
      const n = (spec.knowledge?.artifacts ?? []).filter((a) => a.isDistractor && used.has(a.id)).length;
      if (n === 0)
        r.error('S9 house-conventions', 'flow.runtimeSemantics.distractorArtifacts',
          'declared active but no distractor artifact is offered at any step — evidence discrimination is never trained');
    }
  },
},
{
  id: 'S10', name: 'dead-fields-declared', family: 'structure', reads: ['flow.runtimeSemantics', 'flow.steps', 'scenario', 'knowledge.artifacts'],
  // WARN, not ERROR. The Accounting Case Game ships 5 triggersEventId values,
  // isRedHerring and roleRestriction that no code reads; an ERROR here would
  // make the repo's cleanest game unexpressible and useless as a fixture.
  run(spec, ctx, r) {
    const rs = spec.flow?.runtimeSemantics ?? {};
    const authored = (mech) => {
      switch (mech) {
        case 'interrupts': return (spec.scenario?.beats ?? []).filter((b) => b.kind === 'interrupt').length;
        case 'optionBranching': return ctx.steps.flatMap((s) => s.interaction?.options ?? []).filter((o) => o.goTo).length;
        case 'distractorArtifacts': return (spec.knowledge?.artifacts ?? []).filter((a) => a.isDistractor).length;
        case 'revealRules': return (spec.knowledge?.artifacts ?? []).filter((a) => (a.revealedAtSteps ?? []).length).length;
        case 'personaRestriction': return (spec.scenario?.personas ?? []).filter((p) => p.selectionEffect === 'difficulty-gate').length;
        default: return 0;
      }
    };
    for (const mech of ['interrupts', 'optionBranching', 'distractorArtifacts', 'revealRules', 'personaRestriction']) {
      const n = authored(mech);
      if (rs[mech] === 'inert' && n > 0)
        r.warn('S10 dead-fields-declared', `flow.runtimeSemantics.${mech}`,
          `${n} authored ${mech} field(s) against a declared-inert mechanic — content students will never see`);
      if (rs[mech] === undefined && n > 0)
        r.error('S10 dead-fields-declared', `flow.runtimeSemantics.${mech}`,
          `${n} ${mech} field(s) authored but the mechanic is not declared active or inert`);
    }
  },
},
{
  id: 'S11', name: 'scoring-semantics-explicit', family: 'structure', reads: ['scoring.meters'],
  run(spec, ctx, r) {
    for (const m of spec.scoring?.meters ?? [])
      if (typeof m.affectsFinalGrade !== 'boolean')
        r.error('S11 scoring-semantics-explicit', `scoring.meters/${m.id}`,
          'must declare affectsFinalGrade. No defaults: the Case Game runs an uncapped live HUD formula and a capped grading formula over the same event');
  },
},
{
  id: 'S12', name: 'scoring-params-match-model', family: 'structure', reads: ['scoring'],
  run(spec, ctx, r) {
    const need = {
      'weighted-cap': ['maxScore', 'passingScore'],
      'base-streak-speed': ['multiplierStep', 'multiplierCap', 'nonFirstTryFactor'],
      'flat-per-item': ['perCorrect'],
      'flat-penalty': ['correct', 'incorrect'],
      'checkpoint-binary': [],
    }[spec.scoring?.model] ?? [];
    for (const k of need)
      if (spec.scoring?.params?.[k] === undefined)
        r.error('S12 scoring-params-match-model', 'scoring.params', `model '${spec.scoring.model}' requires params.${k}`);
  },
},
{
  id: 'S13', name: 'no-authored-derived-fields', family: 'structure', reads: ['objectives', 'scoring', 'debrief'],
  run(spec, ctx, r) {
    if ((spec.objectives ?? []).some((o) => o.assessedBy !== undefined))
      r.error('S13 no-authored-derived-fields', 'objectives[].assessedBy',
        'derived field was authored; the validator computes it so the objective-to-item map can never drift');
    if (spec.scoring?.derivedCeilings !== undefined)
      r.error('S13 no-authored-derived-fields', 'scoring.derivedCeilings', 'derived field was authored');
    for (const d of spec.debrief ?? [])
      if (d.objectiveRollup !== undefined)
        r.error('S13 no-authored-derived-fields', `debrief/${d.id}.objectiveRollup`, 'derived field was authored');
    void DERIVED_PATHS;
  },
},
];

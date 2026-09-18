// Q family — Agent 6. Cognitive load, scaffolding, retry coherence, telemetry,
// accessibility.
export const checks = [
{
  id: 'Q1', name: 'scaffolding-differentiated', family: 'qa', reads: ['scenario.personas', 'scaffolding.hints'],
  run(spec, ctx, r) {
    const personas = spec.scenario?.personas ?? [];
    if (!personas.length) return;
    const hints = spec.scaffolding?.hints ?? [];
    for (const p of personas) {
      if (p.selectionEffect !== 'difficulty-gate') continue;
      const mine = hints.filter((h) => h.personaId === p.id || h.personaId === '*');
      if (!mine.length)
        r.error('Q1 scaffolding-differentiated', `scenario.personas/${p.id}`,
          "declares selectionEffect 'difficulty-gate' but receives no scaffolding anywhere — the gate does nothing");
    }
  },
},
{
  id: 'Q2', name: 'cognitive-load', family: 'qa', reads: ['scaffolding.cognitiveLoad', 'flow.steps', 'knowledge.artifacts'],
  run(spec, ctx, r) {
    const maxItems = spec.scaffolding?.cognitiveLoad?.maxConcurrentItems;
    for (const st of ctx.steps) {
      const onScreen = (st.artifactIds ?? []).length + (st.interaction?.options ?? []).length + (st.interaction?.items ?? []).length;
      if (maxItems && onScreen > maxItems)
        r.warn('Q2 cognitive-load', `flow.steps/${st.id}`,
          `${onScreen} concurrent items exceeds declared maxConcurrentItems ${maxItems}`);
    }
    if (!maxItems)
      r.warn('Q2 cognitive-load', 'scaffolding.cognitiveLoad', 'no cognitive-load budget declared');
  },
},
{
  id: 'Q3', name: 'retry-coherence', family: 'qa', reads: ['scoring.retryPolicy', 'scoring'],
  run(spec, ctx, r) {
    const p = spec.scoring?.retryPolicy;
    if (p !== 'until-correct-free') return;
    const penal = spec.scoring?.params?.nonFirstTryFactor != null;
    if (!spec.scoring?.recordsAttempts && !penal)
      r.error('Q3 retry-coherence', 'scoring.retryPolicy',
        "retryPolicy 'until-correct-free' with neither recordsAttempts nor an award penalty: every student eventually scores 100% and the item statistics mean nothing");
  },
},
{
  id: 'Q4', name: 'award-monotonicity', family: 'qa', reads: ['scoring.meters', 'flow.steps'],
  run(spec, ctx, r) {
    for (const m of spec.scoring?.meters ?? []) {
      if (m.ceiling == null || m.floor == null) {
        r.warn('Q4 award-monotonicity', `scoring.meters/${m.id}`, 'no floor/ceiling declared; the meter can run away');
        continue;
      }
      if (m.initial > m.ceiling || m.initial < m.floor)
        r.error('Q4 award-monotonicity', `scoring.meters/${m.id}`, `initial ${m.initial} is outside [${m.floor}, ${m.ceiling}]`);
    }
    if (spec.scoring?.model === 'checkpoint-binary' && spec.scoring?.replay?.idempotentAwards === false)
      r.error('Q4 award-monotonicity', 'scoring.replay',
        'checkpoint-binary with non-idempotent awards: replaying a segment accumulates the same checkpoint twice');
  },
},
{
  id: 'Q5', name: 'telemetry-completeness', family: 'qa', reads: ['telemetry', 'flow.steps'],
  run(spec, ctx, r) {
    const route = spec.telemetry?.route;
    if (!route || route === 'none') {
      r.warn('Q5 telemetry-completeness', 'telemetry.route',
        'no telemetry route: Agent 6 can check the design but can never see whether learning occurred');
      return;
    }
    const fields = spec.telemetry?.completionCode?.fields ?? [];
    for (const need of ['stepId', 'correct', 'attempts', 'hintUsed', 'ms'])
      if (route === 'completion-code' && !fields.includes(need))
        r.warn('Q5 telemetry-completeness', 'telemetry.completionCode.fields', `item record omits '${need}'`);
  },
},
{
  id: 'Q6', name: 'item-analysis-config', family: 'qa', reads: ['telemetry.itemAnalysis'],
  run(spec, ctx, r) {
    const ia = spec.telemetry?.itemAnalysis;
    if (spec.telemetry?.route === 'none' || !spec.telemetry?.route) return;
    if (!ia?.pBand) r.warn('Q6 item-analysis-config', 'telemetry.itemAnalysis', 'no p-value band declared');
    if (ia && ia.reportBy === 'step')
      r.warn('Q6 item-analysis-config', 'telemetry.itemAnalysis',
        "reportBy 'step' only: a cohort report keyed by step cannot tell an instructor which OBJECTIVE the class missed");
  },
},
{
  id: 'Q7', name: 'accessibility', family: 'qa', reads: ['presentation.a11y', 'knowledge.artifacts', 'extensions'],
  run(spec, ctx, r) {
    const a = spec.presentation?.a11y ?? {};
    if (!a.liveRegion) r.error('Q7 accessibility', 'presentation.a11y.liveRegion', 'no live region: state changes are silent to a screen reader');
    if (!a.colorRedundant) r.error('Q7 accessibility', 'presentation.a11y.colorRedundant', 'correctness must be signalled by more than colour');
    for (const art of spec.knowledge?.artifacts ?? [])
      if (art.kind === 'exhibit-image' && !(art.textAlternative ?? '').trim())
        r.error('Q7 accessibility', `knowledge.artifacts/${art.id}`, 'exhibit-image without a textAlternative');
    for (const e of spec.extensions ?? [])
      if (!(e.textAlternative ?? '').trim())
        r.error('Q7 accessibility', `extensions/${e.id}`, 'extension without a textAlternative');
  },
},
{
  id: 'Q8', name: 'feedback-policy-justified', family: 'qa', reads: ['feedback.policy'],
  run(spec, ctx, r) {
    const p = spec.feedback?.policy;
    if (p?.targeting === 'per-step' && !(p.perStepJustification ?? '').trim())
      r.error('Q8 feedback-policy-justified', 'feedback.policy.targeting',
        "targeting 'per-step' requires perStepJustification: a student who picks distractor B learns only that B is wrong");
  },
},
];

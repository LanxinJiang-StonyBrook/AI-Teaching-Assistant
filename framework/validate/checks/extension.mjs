// X + G families — the escape hatch, and the gates.
import { specHash, ownerOf } from '../lib.mjs';

const REGISTRY = ['dual-series-bar', 'gauge', 'scatter-residuals', 'node-link-tree',
  'process-map', 'fit-sandbox', 'monte-carlo-sampler', 'select-points', 'isometric-room'];

export const checks = [
{
  id: 'X1', name: 'widget-resolves', family: 'extension', reads: ['extensions'],
  run(spec, ctx, r) {
    for (const e of spec.extensions ?? [])
      if (!REGISTRY.includes(e.widget))
        r.error('X1 widget-resolves', `extensions/${e.id}`, `widget '${e.widget}' is not in the pinned registry`);
  },
},
{
  id: 'X2', name: 'fallback-present-and-valid', family: 'extension', reads: ['extensions'],
  run(spec, ctx, r) {
    for (const e of spec.extensions ?? []) {
      if (!e.fallback?.interaction) {
        r.error('X2 fallback-present', `extensions/${e.id}`, 'no fallback: if the registry lacks this widget the emitter would silently drop a graded step');
        continue;
      }
      if (e.fallback.interaction.type === 'extension')
        r.error('X2 fallback-present', `extensions/${e.id}`, 'fallback is itself an extension');
    }
  },
},
{
  id: 'X3', name: 'widget-params-valid', family: 'extension', reads: ['extensions'],
  run(spec, ctx, r) {
    for (const e of spec.extensions ?? [])
      if (e.params === undefined)
        r.warn('X3 widget-params-valid', `extensions/${e.id}`, 'no params supplied to the widget');
  },
},
{
  id: 'X4', name: 'assets-budgeted-and-described', family: 'extension', reads: ['assets', 'extensions'],
  run(spec, ctx, r) {
    const ids = new Set((spec.assets ?? []).map((a) => a.id));
    for (const e of spec.extensions ?? [])
      for (const a of e.assets ?? [])
        if (!ids.has(a)) r.error('X4 assets', `extensions/${e.id}`, `references unknown asset '${a}'`);
    for (const a of spec.assets ?? []) {
      if (!(a.textAlternative ?? '').trim()) r.error('X4 assets', `assets/${a.id}`, 'no textAlternative');
      if (a.bytes && a.bytes > 400_000) r.warn('X4 assets', `assets/${a.id}`, `${a.bytes} bytes inflates a single-file build`);
    }
  },
},
{
  id: 'X5', name: 'no-prose-in-layout', family: 'extension', reads: ['extensions'],
  run(spec, ctx, r) {
    const prose = (v) => typeof v === 'string' && /\s/.test(v) && v.trim().split(/\s+/).length >= 3;
    const walk = (node, e, path) => {
      if (Array.isArray(node)) return node.forEach((x, i) => walk(x, e, `${path}[${i}]`));
      if (node && typeof node === 'object') return Object.entries(node).forEach(([k, v]) => walk(v, e, `${path}.${k}`));
      if (prose(node))
        r.error('X5 no-prose-in-layout', `extensions/${e.id}`,
          `layout${path} holds authored prose ('${String(node).slice(0, 40)}...'); every authored string must live in an addressable content field`);
    };
    for (const e of spec.extensions ?? []) if (e.layout) walk(e.layout, e, '');
  },
},
{
  id: 'X6', name: 'registry-reuse-honest', family: 'extension', reads: ['extensions'],
  run(spec, ctx, r) {
    for (const e of spec.extensions ?? []) {
      const n = (e.usedBy ?? []).length;
      if (e.fidelity === 'registry-exact' && n <= 1)
        r.error('X6 registry-reuse-honest', `extensions/${e.id}`,
          `claims fidelity 'registry-exact' but usedBy lists ${n} game(s). A widget used by one game is bespoke-pending-generalisation; the measured reuse factor across the corpus is 1.0`);
    }
  },
},
// ------------------------------------------------------------------ G family
{
  id: 'G1', name: 'coverage-ledger', family: 'gate', reads: ['flow.steps', 'extensions', 'objectives'],
  run(spec, ctx, r) {
    const total = ctx.steps.length;
    const ext = ctx.steps.filter((s) => s.interaction?.type === 'extension').length;
    const unscored = ctx.steps.filter((s) => !s.graded).length;
    r.info('G1 coverage-ledger', 'flow',
      `steps ${total} | generatable-core ${total - ext} | extension ${ext} | unscored mechanics ${unscored}`);
    if (unscored > 0)
      r.info('G1 coverage-ledger', 'flow',
        `${unscored} unscored step(s): award-value coverage is structurally blind to these, so they are counted separately and require author acknowledgement`);
  },
},
{
  id: 'G2', name: 'gate-chain', family: 'gate', reads: ['provenance'],
  run(spec, ctx, r) {
    const gates = spec.provenance?.gates ?? [];
    const seen = new Set(gates.map((g) => g.agent));
    for (let a = 1; a <= 6; a++)
      if (!seen.has(a)) r.warn('G2 gate-chain', 'provenance.gates', `no gate recorded for agent ${a}`);
    const order = gates.map((g) => g.agent);
    for (let i = 1; i < order.length; i++)
      if (order[i] < order[i - 1])
        r.warn('G2 gate-chain', 'provenance.gates', `gates recorded out of order: ${order.join(' -> ')}`);
  },
},
{
  id: 'G3', name: 'deltas-attributed', family: 'gate', reads: ['provenance.deltas'],
  // The measurement, not a claim: how many fields moved after their owner's
  // gate closed. Near zero means the sequence is decorative and the framework
  // should say so.
  run(spec, ctx, r) {
    const deltas = spec.provenance?.deltas ?? [];
    let after = 0;
    for (const d of deltas) {
      const owner = d.ownerAgent ?? ownerOf(d.fieldPath);
      if (owner && d.atGate > owner) after++;
      if (owner && d.byAgent !== owner && !d.causedByCheckId)
        r.error('G3 deltas-attributed', d.fieldPath,
          `changed by agent ${d.byAgent} but owned by agent ${owner}, with no causedByCheckId — a field with two authors has no owner`);
    }
    r.info('G3 deltas-attributed', 'provenance.deltas',
      `${after} of ${deltas.length} field change(s) happened after the owning agent's gate closed`);
    if (deltas.length && after === 0)
      r.info('G3 deltas-attributed', 'provenance.deltas',
        'no field moved after its owner signed off: on this build the six-agent sequence was not load-bearing. Report it, do not hide it.');
  },
},
{
  id: 'G4', name: 'cross-agent-yield', family: 'gate', reads: ['provenance.findings'],
  run(spec, ctx, r) {
    const f = spec.provenance?.findings ?? [];
    const cross = f.filter((x) => x.raisedByAgent !== x.againstAgent);
    const changed = cross.filter((x) => x.resolution === 'fixed');
    r.info('G4 cross-agent-yield', 'provenance.findings',
      `findings ${f.length} | cross-agent ${cross.length} | cross-agent findings that changed the artifact ${changed.length}`);
    for (const x of f)
      if (x.resolution === 'open')
        r.warn('G4 cross-agent-yield', `provenance.findings/${x.id}`, `unresolved: ${x.describe ?? x.checkId}`);
  },
},
{
  id: 'G5', name: 'spec-hash-current', family: 'gate', reads: ['provenance', 'assurance.attestation'],
  run(spec, ctx, r) {
    const h = specHash(spec);
    const at = spec.assurance?.attestation;
    if (at?.signed && at.specHash && at.specHash !== h)
      r.error('G5 spec-hash-current', 'assurance.attestation.specHash',
        `attestation signs ${at.specHash} but the spec now hashes to ${h} — the signature covers a version that no longer exists`);
  },
},
];

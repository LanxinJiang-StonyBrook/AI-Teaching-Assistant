// ===========================================================================
// GameSpec validator — shared primitives.
//
// Ownership is READ FROM THE SCHEMA (x-agent), never duplicated here, so a
// field can never silently acquire a second owner.
// ===========================================================================
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
export const SCHEMA_PATH = path.join(here, '..', 'spec', 'gamespec.schema.json');
export const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));

/** top-level field -> owning agent (1..6), straight out of the schema */
export const OWNER = Object.fromEntries(
  Object.entries(schema.properties)
    .filter(([, v]) => v['x-agent'])
    .map(([k, v]) => [k, v['x-agent']])
);

/** field paths the schema marks x-derived: authoring them is an ERROR */
export const DERIVED_PATHS = (() => {
  const out = [];
  const walk = (node, p) => {
    if (!node || typeof node !== 'object') return;
    if (node['x-derived']) out.push(p);
    for (const [k, v] of Object.entries(node.properties ?? {})) walk(v, p ? `${p}.${k}` : k);
    if (node.items) walk(node.items, `${p}[]`);
  };
  walk(schema, '');
  return out;
})();

/** nested owners, e.g. feedback.content -> 4, feedback.policy -> 6 */
const NESTED_OWNER = (() => {
  const out = {};
  const walk = (node, p) => {
    if (!node || typeof node !== 'object') return;
    if (node['x-agent'] && p) out[p] = node['x-agent'];
    for (const [k, v] of Object.entries(node.properties ?? {})) walk(v, p ? `${p}.${k}` : k);
  };
  walk(schema, '');
  return out;
})();
export { NESTED_OWNER };

/** the single agent that owns a field path. Longest declared prefix wins. */
export function ownerOf(fieldPath) {
  const clean = String(fieldPath).replace(/\[[^\]]*\]/g, '').replace(/\/.*$/, '');
  const parts = clean.split('.');
  for (let n = parts.length; n > 0; n--) {
    const key = parts.slice(0, n).join('.');
    if (NESTED_OWNER[key]) return NESTED_OWNER[key];
  }
  return null;
}

export const specHash = (spec) => {
  const clone = JSON.parse(JSON.stringify(spec));
  delete clone.provenance;
  return createHash('sha256').update(JSON.stringify(clone)).digest('hex').slice(0, 12);
};

// --------------------------------------------------------------- findings
export class Report {
  constructor() { this.findings = []; }
  add(severity, check, target, message) { this.findings.push({ severity, check, target, message }); }
  error(c, t, m) { this.add('ERROR', c, t, m); }
  warn(c, t, m) { this.add('WARN', c, t, m); }
  info(c, t, m) { this.add('INFO', c, t, m); }
  counts() {
    return this.findings.reduce((a, f) => (a[f.severity.toLowerCase()]++, a),
      { error: 0, warn: 0, info: 0 });
  }
}

// --------------------------------------------------------------- formatting
export const usd = (n) =>
  `$${Number(n).toLocaleString('en-US', {
    minimumFractionDigits: Math.abs(n % 1) > 1e-9 ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
export const pct = (n) => `${Math.round(n * 100)}%`;
export const num = (n) => String(Math.round(n * 1e6) / 1e6);

/** every rendering a recomputed value might legitimately take in prose */
export const renderings = (v) => {
  if (typeof v !== 'number') return [String(v)];
  const out = new Set([usd(v), num(v), String(v)]);
  if (Math.abs(v) <= 1) {
    // prose writes a probability as 30%, 30.1% or 30.10% — all three are the
    // same number and all three must count as grounded
    for (const d of [0, 1, 2]) out.add(`${(v * 100).toFixed(d)}%`);
    out.add(pct(v));
  }
  if (Number.isInteger(v)) out.add(v.toLocaleString('en-US'));
  else { out.add(v.toFixed(2)); out.add(usd(Math.round(v))); }
  return [...out];
};

// --------------------------------------------------------------- expressions
// A deliberately small language. No member access beyond the declared
// namespaces, no function calls outside this table, no property lookup on
// anything a spec author controls.
const FN = {
  abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil,
  min: Math.min, max: Math.max, sqrt: Math.sqrt, pow: Math.pow,
  sum: (a) => a.reduce((x, y) => x + Number(y), 0),
  count: (a) => a.length,
  mean: (a) => a.reduce((x, y) => x + Number(y), 0) / a.length,
};

export function makeScope(spec) {
  const p = { ...(spec.knowledge?.params ?? {}) };
  for (const t of spec.knowledge?.thresholds ?? []) p[t.name.replace(/-/g, '_')] = t.value;

  const cols = {};
  for (const ds of spec.knowledge?.datasets ?? []) {
    const key = ds.id.replace(/-/g, '_');
    cols[key] = {};
    for (const c of ds.columns ?? []) cols[key][c.key.replace(/-/g, '_')] = ds.rows.map((r) => r[c.key]);
    cols[key].__rows = ds.rows;
  }

  const d = {};
  const scope = { p, ds: cols, d };
  for (const der of spec.knowledge?.derivations ?? []) {
    Object.defineProperty(d, der.id.replace(/-/g, '_'), {
      enumerable: true,
      get: () => evalExpr(der.expr, scope),
    });
  }
  return scope;
}

export function evalExpr(expr, scope) {
  if (expr == null) return undefined;
  if (typeof expr === 'number') return expr;
  const src = String(expr);
  if (!/^[\w\s.,()+\-*/%<>=!?:&|[\]'"]+$/.test(src))
    throw new Error(`illegal characters in expression: ${src}`);
  const names = Object.keys(FN);
  // eslint-disable-next-line no-new-func
  const fn = new Function('p', 'ds', 'd', ...names, `"use strict"; return (${src});`);
  return fn(scope.p, scope.ds, scope.d, ...names.map((n) => FN[n]));
}

/** the text a student can actually be graded against */
export function gradedCorpus(spec) {
  const out = [];
  const push = (target, text) => { if (typeof text === 'string' && text.trim()) out.push({ target, text }); };
  for (const st of spec.flow?.steps ?? []) {
    push(`flow.steps/${st.id}.prompt`, st.prompt);
    push(`flow.steps/${st.id}.caption`, st.caption);
    push(`flow.steps/${st.id}.why`, st.why);
    const it = st.interaction ?? {};
    for (const o of it.options ?? []) {
      // A distractor's number is WRONG on purpose. Grounding it in
      // knowledge.params would be nonsense; check N5 covers it instead, by
      // demanding the misconception formula that produces it.
      if (o.correct) push(`flow.steps/${st.id}/${o.id}.label`, o.label);
      push(`flow.steps/${st.id}/${o.id}.feedback`, o.feedback);
      push(`flow.steps/${st.id}/${o.id}.consequence`, o.consequence);
    }
    for (const b of it.blanks ?? []) push(`flow.steps/${st.id}.blank`, b.label);
    for (const i of it.items ?? []) push(`flow.steps/${st.id}.item`, `${i.text} ${i.why ?? ''}`);
  }
  for (const a of spec.knowledge?.artifacts ?? [])
    if (!a.illustrativeNumbers) push(`artifacts/${a.id}`, a.content);
  for (const h of spec.scaffolding?.hints ?? []) push(`hints/${h.id}`, h.text);
  return out;
}

/** every step reachable from its segment entry, plus the step index */
export function indexSpec(spec) {
  const steps = spec.flow?.steps ?? [];
  const byId = Object.fromEntries(steps.map((s) => [s.id, s]));
  const bySegment = {};
  for (const s of steps) (bySegment[s.segmentId] ||= []).push(s);
  for (const k of Object.keys(bySegment)) bySegment[k].sort((a, b) => a.order - b.order);
  const objectives = Object.fromEntries((spec.objectives ?? []).map((o) => [o.id, o]));
  const segments = Object.fromEntries((spec.flow?.segments ?? []).map((s) => [s.id, s]));
  return { steps, byId, bySegment, objectives, segments };
}

/** which steps actually assess each objective — DERIVED, never authored */
export function deriveAssessedBy(spec) {
  const map = {};
  for (const o of spec.objectives ?? []) map[o.id] = [];
  for (const st of spec.flow?.steps ?? []) {
    if (!st.graded) continue;
    for (const oid of st.objectiveIds ?? []) (map[oid] ||= []).push(st.id);
  }
  for (const ext of spec.extensions ?? []) {
    for (const oid of ext.pedagogy?.objectiveIds ?? []) (map[oid] ||= []).push(`ext:${ext.id}`);
  }
  return map;
}

/** the per-step cap the runtime will actually apply, mirroring the emitter */
export function stepCap(spec, step) {
  const m = spec.scoring?.model;
  if (m === 'weighted-cap') {
    const seg = (spec.flow?.segments ?? []).find((s) => s.id === step.segmentId);
    const maxScore = spec.scoring?.params?.maxScore ?? 100;
    const stepsInSeg = (spec.flow?.steps ?? []).filter((s) => s.segmentId === step.segmentId && s.graded);
    const segCap = Math.round(maxScore * (seg?.scoringWeight ?? 0));
    return step.award?.cap ?? Math.round(segCap / Math.max(1, stepsInSeg.length));
  }
  return step.award?.cap ?? step.award?.base ?? Infinity;
}

/** chance score: expected fraction earned by uniform guessing */
export function chanceOf(step) {
  const it = step.interaction ?? {};
  switch (it.type) {
    case 'mcq': return 1 / Math.max(1, it.options.length);
    case 'multi-select': return 1 / Math.max(1, 2 ** it.options.length);
    case 'classify': return (1 / Math.max(1, it.buckets.length)) ** Math.max(1, it.items.length);
    case 'drag-to-target': return 1 / Math.max(1, it.targets.length);
    case 'numeric': case 'multi-blank': return 0;
    default: return 0;
  }
}

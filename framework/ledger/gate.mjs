#!/usr/bin/env node
// ===========================================================================
// Gates — the mechanism that makes the six-agent SEQUENCE measurable.
//
// The problem this solves is stated plainly so nobody forgets it: every check
// in the validator is a predicate over the finished spec, and a predicate over
// a finished document is order-invariant and author-invariant. One agent that
// wrote the whole spec and then ran all six profiles would pass exactly what a
// six-agent run passes, and emit a byte-identical game. Signatures cannot tell
// the two apart. STATE can.
//
//   node framework/ledger/gate.mjs open   <spec.json> --agent N
//       Snapshot the spec as agent N receives it, with the field paths that
//       agent must not see removed. Writes ledger/gates/<id>-gate<N>.json.
//
//   node framework/ledger/gate.mjs close  <spec.json> --agent N
//       Run agent N's validator profile, diff against the open snapshot,
//       record deltas and findings into spec.provenance, and write the spec
//       back. Refuses to close on an unaccepted ERROR.
//
//   node framework/ledger/gate.mjs report <spec.json>
//       The YIELD LEDGER: findings per agent, how many were cross-agent, and
//       how many fields moved after their owner had signed off.
// ===========================================================================
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runChecks, ALL_CHECKS } from '../validate/validate.mjs';
import { specHash, ownerOf } from '../validate/lib.mjs';
import { arityOf } from '../validate/arity.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const GATES = path.join(here, 'gates');

// What each agent is DENIED at its gate. This is mechanism C, information
// hiding, and it is the only structural feature that can make "agent N caught
// what agent N-1 could not" true rather than asserted.
export const HIDDEN = {
  1: ['flow', 'scoring', 'scaffolding', 'assurance', 'telemetry', 'extensions'],
  2: ['flow.steps', 'scoring', 'scaffolding', 'assurance', 'telemetry'],
  3: ['flow.steps', 'scoring', 'assurance', 'telemetry'],
  4: ['assurance.assertions'],
  5: ['flow', 'interaction', 'scaffolding', 'telemetry'],
  6: [],
};
// Agent 1 commits objectives BEFORE items exist, so P2/P3/P6 are real
// constraints rather than post-hoc fitting. Agent 3 writes beats against a
// params MANIFEST — names, units, ranges, no values — so C2a fires on real
// drift instead of being satisfied by copy-paste. Agent 5 writes assertions
// from meta.sources BEFORE reading flow, which is an audit program written
// before the sample is drawn.
export const MANIFEST_ONLY = { 3: ['knowledge.params'] };

const clone = (o) => JSON.parse(JSON.stringify(o));
function dropPath(obj, p) {
  const parts = p.split('.');
  let node = obj;
  for (let i = 0; i < parts.length - 1; i++) { node = node?.[parts[i]]; if (!node) return; }
  delete node[parts[parts.length - 1]];
}
function manifestOf(params) {
  const out = {};
  for (const [k, v] of Object.entries(params ?? {}))
    out[k] = typeof v === 'number'
      ? { type: 'number', magnitude: v === 0 ? 0 : Math.round(Math.log10(Math.abs(v))) }
      : { type: Array.isArray(v) ? 'array' : typeof v };
  return out;
}

export function openGate(spec, agent) {
  const view = clone(spec);
  for (const p of HIDDEN[agent] ?? []) dropPath(view, p);
  for (const p of MANIFEST_ONLY[agent] ?? [])
    if (p === 'knowledge.params' && view.knowledge)
      view.knowledge.params = manifestOf(spec.knowledge?.params);
  return {
    agent, openedHash: specHash(spec),
    view,                         // what the agent is allowed to work from
    full: clone(spec),            // what the spec actually was, for diffing
    hiddenFrom: HIDDEN[agent] ?? [],
    manifestOnly: MANIFEST_ONLY[agent] ?? [],
    fieldPathsPresent: Object.keys(view).filter((k) => k !== 'provenance'),
  };
}

/** every leaf path that differs between two specs */
export function diffPaths(a, b, prefix = '', out = []) {
  const keys = new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})]);
  for (const k of keys) {
    if (prefix === '' && k === 'provenance') continue;
    const pa = a?.[k], pb = b?.[k], p = prefix ? `${prefix}.${k}` : k;
    if (pa === undefined) { out.push({ fieldPath: p, op: 'add' }); continue; }
    if (pb === undefined) { out.push({ fieldPath: p, op: 'remove' }); continue; }
    const objish = pa && pb && typeof pa === 'object' && typeof pb === 'object' && !Array.isArray(pa) && !Array.isArray(pb);
    if (objish) diffPaths(pa, pb, p, out);
    else if (JSON.stringify(pa) !== JSON.stringify(pb)) out.push({ fieldPath: p, op: 'change' });
  }
  return out;
}

export function closeGate(spec, agent, snapshot, { baseline = null } = {}) {
  const { report } = runChecks(spec, { gate: agent });
  const accepted = (f) => (baseline?.accepted ?? []).some((b) => f.check.startsWith(b.check) && f.target === b.target);
  const errors = report.findings.filter((f) => f.severity === 'ERROR' && !accepted(f));

  const base = snapshot?.full ?? snapshot?.view ?? {};
  const hidden = [...(snapshot?.hiddenFrom ?? []), ...(snapshot?.manifestOnly ?? [])];
  const wasHidden = (p) => hidden.some((h) => p === h || p.startsWith(h + '.'));
  const deltas = diffPaths(base, spec).map((d) => ({
    ...d, byAgent: agent, atGate: agent, ownerAgent: ownerOf(d.fieldPath) ?? undefined,
  }));
  // A change to a path this agent could not see is a real violation, not a delta:
  // it means the agent read around the hiding, and the measurement is void.
  const blind = deltas.filter((d) => wasHidden(d.fieldPath));
  // "One owner per field" has to bite AT THE GATE, not only in the final report.
  // A field edited by a non-owner without a check to point at is an unattributed
  // change, and the yield ledger cannot interpret it.
  const foreign = deltas.filter((d) => d.ownerAgent && d.ownerAgent !== agent && !d.causedByCheckId);

  const findings = report.findings
    .filter((f) => f.severity !== 'INFO')
    .map((f, i) => {
      const chk = ALL_CHECKS.find((c) => f.check.startsWith(c.id + ' '));
      const against = ownerOf(f.target) ?? ownerOf(f.check) ?? agent;
      return {
        id: `g${agent}-${chk?.id ?? 'X'}-${i}`,
        raisedByAgent: agent, againstAgent: against,
        fieldPath: f.target, checkId: chk?.id ?? f.check,
        arity: chk ? arityOf(chk).arity : 0,
        severity: f.severity, describe: f.message,
        specHashBefore: snapshot?.openedHash, specHashAfter: specHash(spec),
        resolution: accepted(f) ? 'justified' : f.severity === 'ERROR' ? 'open' : 'justified',
      };
    });

  spec.provenance ??= { gates: [] };
  spec.provenance.gates = (spec.provenance.gates ?? []).filter((g) => g.agent !== agent).concat([{
    agent, specHash: specHash(spec),
    snapshotRef: `framework/ledger/gates/${spec.meta.id}-gate${agent}.json`,
    fieldPathsPresent: snapshot?.fieldPathsPresent ?? [],
    hiddenFrom: snapshot?.hiddenFrom ?? [],
    errors: errors.length, warnings: report.counts().warn,
    note: snapshot?.manifestOnly?.length ? `params supplied as a manifest only: ${snapshot.manifestOnly.join(', ')}` : undefined,
  }]).sort((a, b) => a.agent - b.agent);
  spec.provenance.deltas = (spec.provenance.deltas ?? []).concat(deltas);
  spec.provenance.findings = (spec.provenance.findings ?? []).concat(findings);
  return { ok: errors.length === 0 && blind.length === 0 && foreign.length === 0,
    errors, deltas, blind, foreign, findings, report };
}

export function yieldLedger(spec) {
  const F = spec.provenance?.findings ?? [];
  const D = spec.provenance?.deltas ?? [];
  const perAgent = {};
  for (let a = 1; a <= 6; a++) {
    const mine = F.filter((f) => f.raisedByAgent === a);
    perAgent[a] = {
      raised: mine.length,
      crossAgent: mine.filter((f) => f.againstAgent !== a).length,
      crossAgentFixed: mine.filter((f) => f.againstAgent !== a && f.resolution === 'fixed').length,
      arity1: mine.filter((f) => f.arity <= 1).length,
      arity2plus: mine.filter((f) => f.arity >= 2).length,
    };
  }
  const late = D.filter((d) => d.ownerAgent && d.atGate > d.ownerAgent);
  return {
    perAgent,
    deltas: D.length,
    deltasAfterOwnerSignedOff: late.length,
    lateFields: [...new Set(late.map((d) => d.fieldPath))].slice(0, 20),
    crossAgentTotal: F.filter((f) => f.againstAgent !== f.raisedByAgent).length,
    sequenceLoadBearing: late.length > 0,
  };
}

// --------------------------------------------------------------------- CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, file] = process.argv.slice(2);
  const argv = process.argv.slice(2);
  const agent = argv.includes('--agent') ? Number(argv[argv.indexOf('--agent') + 1]) : null;
  if (!cmd || !file) {
    console.error('usage: gate.mjs open|close|report <spec.json> [--agent N]');
    process.exit(2);
  }
  const spec = JSON.parse(readFileSync(file, 'utf8'));
  const baselinePath = file.replace(/\.spec\.json$/, '.baseline.json');
  const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')) : null;
  mkdirSync(GATES, { recursive: true });
  const snapPath = path.join(GATES, `${spec.meta.id}-gate${agent}.json`);

  if (cmd === 'open') {
    const snap = openGate(spec, agent);
    writeFileSync(snapPath, JSON.stringify(snap, null, 2) + '\n');
    console.log(`gate ${agent} OPEN — ${snapPath}`);
    console.log(`  hidden from agent ${agent}: ${snap.hiddenFrom.join(', ') || '(nothing)'}`);
    if (snap.manifestOnly.length) console.log(`  supplied as a manifest only: ${snap.manifestOnly.join(', ')}`);
    console.log(`  spec hash at open: ${snap.openedHash}`);
  } else if (cmd === 'close') {
    const snap = existsSync(snapPath) ? JSON.parse(readFileSync(snapPath, 'utf8')) : null;
    if (!snap) console.warn(`  (no open snapshot for gate ${agent}; deltas will be measured against an empty view)`);
    const res = closeGate(spec, agent, snap, { baseline });
    writeFileSync(file, JSON.stringify(spec, null, 2) + '\n');
    console.log(`gate ${agent} ${res.ok ? 'CLOSED' : 'REFUSED'} — ${res.errors.length} unaccepted error(s)`);
    console.log(`  fields changed under this gate: ${res.deltas.length}`);
    if (res.blind.length) {
      console.log(`  ${res.blind.length} change(s) to fields this agent was DENIED at its gate:`);
      for (const d of res.blind.slice(0, 8)) console.log(`    ${d.fieldPath}`);
      console.log('  The agent read around the information hiding. The yield measurement');
      console.log('  for this build is void until the change is reverted or re-attributed.');
    }
    if (res.foreign.length) {
      console.log(`  ${res.foreign.length} change(s) to fields owned by ANOTHER agent:`);
      for (const d of res.foreign.slice(0, 8)) console.log(`    ${d.fieldPath} (owned by agent ${d.ownerAgent})`);
      console.log('  Revert them and raise a provenance.revisionRequests entry instead, or');
      console.log('  attach a causedByCheckId naming the check that forced the change.');
    }
    const cross = res.findings.filter((f) => f.againstAgent !== agent);
    console.log(`  findings raised: ${res.findings.length}, of which cross-agent: ${cross.length}`);
    for (const f of res.errors) console.log(`    ERROR [${f.check}] ${f.target}: ${f.message}`);
    process.exit(res.ok ? 0 : 1);
  } else if (cmd === 'report') {
    const L = yieldLedger(spec);
    const bar = '='.repeat(74);
    console.log(`${bar}\nYIELD LEDGER — ${spec.meta.title}\n${bar}`);
    console.log('\n  agent | raised | cross-agent | fixed | arity<=1 (lint) | arity>=2');
    console.log('  ------+--------+-------------+-------+-----------------+---------');
    for (let a = 1; a <= 6; a++) {
      const r = L.perAgent[a];
      console.log(`    ${a}   |   ${String(r.raised).padStart(3)}  |     ${String(r.crossAgent).padStart(3)}     |  ${String(r.crossAgentFixed).padStart(3)}  |       ${String(r.arity1).padStart(3)}       |   ${String(r.arity2plus).padStart(3)}`);
    }
    console.log(`\n  field changes recorded: ${L.deltas}`);
    console.log(`  changes AFTER the owning agent's gate closed: ${L.deltasAfterOwnerSignedOff}`);
    if (L.lateFields.length) console.log(`    ${L.lateFields.join('\n    ')}`);
    console.log('');
    if (!L.sequenceLoadBearing) {
      console.log('  READ THIS NUMBER HONESTLY. No field moved after its owner signed off, so');
      console.log('  on this build the six-agent SEQUENCE was not load-bearing: one agent with');
      console.log('  the whole schema and all six validator profiles would have produced the');
      console.log('  same artifact. Report it. Do not hide it.');
    } else {
      console.log(`  ${L.deltasAfterOwnerSignedOff} field(s) moved after their owner signed off. That is the loop`);
      console.log('  doing work, and it is the only evidence the pipeline claim rests on.');
    }
    console.log(`\n  cross-agent findings in total: ${L.crossAgentTotal}`);
    console.log('  Only arity>=2 findings are cross-author. Arity-1 findings are lint that a');
    console.log('  single author would also have passed, and must not be cited as evidence.');
    console.log(bar);
  }
}

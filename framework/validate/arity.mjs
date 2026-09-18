// ===========================================================================
// Check arity — the number of DISTINCT owning agents whose fields a check
// reads.
//
// Why this exists. Every check in this validator is a predicate over the
// spec, and a predicate over the final document is by construction
// order-invariant and author-invariant. So most checks cannot possibly be
// evidence that six agents in sequence produced the artifact — they would
// pass identically for one agent that wrote everything.
//
//   arity 1  = LINT. Must run inside the owning agent's own gate. MUST NOT be
//              cited as evidence that the pipeline is load-bearing.
//   arity >=2 = CROSS-AUTHOR. Only these can catch what one author could not
//              see, and only these belong in the yield ledger.
//
// This reclassifies the pilot's flagship finding honestly: the Month-End Close
// 75/100 defect is caught by S5, whose every input field belongs to agent 4.
// That is the mechanics author's own lint, not an independent audit.
// ===========================================================================
import { ownerOf } from './lib.mjs';

export function arityOf(check) {
  const owners = new Set();
  for (const path of check.reads ?? []) {
    const o = ownerOf(path);
    if (o) owners.add(o);
  }
  return { arity: owners.size, owners: [...owners].sort() };
}

export function arityTable(checks) {
  return checks.map((c) => {
    const { arity, owners } = arityOf(c);
    return {
      id: c.id, name: c.name, family: c.family, arity, owners,
      role: arity >= 2 ? 'cross-author' : 'lint',
    };
  });
}

export function printArityHistogram(checks, log = console.log) {
  const rows = arityTable(checks);
  const byArity = {};
  for (const r of rows) (byArity[r.arity] ||= []).push(r.id);
  log('');
  log('='.repeat(74));
  log('CHECK ARITY — how many distinct field-owning agents each check reads');
  log('='.repeat(74));
  for (const a of Object.keys(byArity).sort()) {
    const role = Number(a) === 0 ? 'process (reads the ledger, not spec fields)'
      : Number(a) >= 2 ? 'cross-author (may be cited as pipeline evidence)'
      : 'lint (runs inside one agent\'s own gate; NOT pipeline evidence)';
    log(`\n  arity ${a} — ${byArity[a].length} check(s) — ${role}`);
    log(`    ${byArity[a].join(' ')}`);
  }
  const cross = rows.filter((r) => r.arity >= 2);
  const lint = rows.filter((r) => r.arity === 1);
  log('');
  log('-'.repeat(74));
  log(`  ${cross.length} of ${rows.length} checks are cross-author. Those are the framework's`);
  log(`  real claim. ${lint.length} are lint a single author would also pass.`);
  log('-'.repeat(74));
  return rows;
}

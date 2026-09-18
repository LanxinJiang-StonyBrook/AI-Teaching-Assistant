#!/usr/bin/env node
// ===========================================================================
// GameSpec validator — the gate every agent hand-off passes through.
//
//   node framework/validate/validate.mjs <spec.json>            full report
//   node framework/validate/validate.mjs <spec.json> --gate 3   agent 3's gate
//   node framework/validate/validate.mjs <spec.json> --json     machine output
//   node framework/validate/validate.mjs --arity-histogram      which checks
//                                                               are lint and
//                                                               which are
//                                                               cross-author
//
// Exit 1 on any ERROR, so it can gate a commit or a CI run.
// ===========================================================================
import { readFileSync, existsSync } from 'node:fs';
import { Report, indexSpec, specHash, schema, ownerOf } from './lib.mjs';
import { validate as schemaValidate } from './jsonschema.mjs';
import { arityOf, printArityHistogram } from './arity.mjs';
import { checks as structure } from './checks/structure.mjs';
import { checks as pedagogy } from './checks/pedagogy.mjs';
import { checks as numeric } from './checks/numeric.mjs';
import { checks as assurance } from './checks/assurance.mjs';
import { checks as qa } from './checks/qa.mjs';
import { checks as extension } from './checks/extension.mjs';

export const ALL_CHECKS = [...structure, ...pedagogy, ...numeric, ...assurance, ...qa, ...extension];

// Which checks each agent's gate runs. A gate runs its owner's lint plus every
// cross-author check whose inputs are all available by then.
const GATE_FAMILIES = {
  1: ['pedagogy'],
  2: ['numeric'],
  3: ['context'],
  4: ['structure', 'pedagogy'],
  5: ['numeric', 'assurance'],
  6: ['qa', 'pedagogy', 'gate'],
};

export function runChecks(spec, { gate = null } = {}) {
  const ctx = indexSpec(spec);
  const report = new Report();
  const selected = gate
    ? ALL_CHECKS.filter((c) => GATE_FAMILIES[gate].includes(c.family))
    : ALL_CHECKS;
  for (const c of selected) {
    try { c.run(spec, ctx, report); }
    catch (e) { report.error(`${c.id} ${c.name}`, 'validator', `check threw: ${e.message}`); }
  }
  return { report, ctx, ran: selected };
}

// --------------------------------------------------------------------- CLI
const argv = process.argv.slice(2);
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  if (argv.includes('--arity-histogram')) {
    printArityHistogram(ALL_CHECKS);
    process.exit(0);
  }
  const file = argv.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('usage: validate.mjs <spec.json> [--gate N] [--json] [--arity-histogram]');
    process.exit(2);
  }
  const spec = JSON.parse(readFileSync(file, 'utf8'));
  const gate = argv.includes('--gate') ? Number(argv[argv.indexOf('--gate') + 1]) : null;

  // A corpus fixture is a reverse-engineered EXISTING game, so it legitimately
  // carries that game's real defects. Its .baseline.json enumerates them with a
  // reason. Findings inside the baseline do not fail the run; anything new does.
  const baselinePath = file.replace(/\.spec\.json$/, '.baseline.json');
  let baseline = null;
  if (existsSync(baselinePath)) baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
  const inBaseline = (f) =>
    baseline?.accepted?.some((b) => f.check.startsWith(b.check) && f.target === b.target) ?? false;

  const schemaErrors = schemaValidate(schema, spec, schema);
  const { report, ran } = runChecks(spec, { gate });
  for (const e of schemaErrors) report.error('SCHEMA', e.split(':')[0], e.split(':').slice(1).join(':').trim());

  const accepted = baseline ? report.findings.filter(inBaseline) : [];
  if (baseline) report.findings = report.findings.filter((f) => !inBaseline(f));
  const counts = report.counts();
  const hash = specHash(spec);

  if (argv.includes('--json')) {
    console.log(JSON.stringify({
      spec: file, specHash: hash, gate, counts,
      findings: report.findings,
      checksRun: ran.map((c) => ({ id: c.id, ...arityOf(c) })),
    }, null, 2));
  } else {
    const bar = '='.repeat(74);
    console.log(`${bar}\nGAMESPEC VALIDATION — ${spec.meta?.title ?? file}`);
    console.log(`spec ${file}\nhash ${hash}${gate ? `\ngate AGENT ${gate} (families: ${GATE_FAMILIES[gate].join(', ')})` : ''}`);
    console.log(`${bar}\n`);
    console.log(`Steps ${spec.flow?.steps?.length ?? 0}   Objectives ${spec.objectives?.length ?? 0}   Checks run ${ran.length}`);
    console.log(`Findings: ${counts.error} ERROR · ${counts.warn} WARN · ${counts.info} INFO`);
    if (baseline)
      console.log(`Baseline: ${accepted.length} known defect(s) of the original game, accepted — see ${baseline.about ?? 'the .baseline.json'}\n`);
    else console.log('');

    for (const sev of ['ERROR', 'WARN', 'INFO']) {
      const g = report.findings.filter((f) => f.severity === sev);
      if (!g.length) continue;
      console.log(`${'-'.repeat(74)}\n${sev} (${g.length})\n${'-'.repeat(74)}`);
      for (const f of g) {
        const a = ALL_CHECKS.find((c) => f.check.startsWith(c.id + ' '));
        const tag = a ? `arity ${arityOf(a).arity}` : '';
        console.log(`  [${f.check}]${tag ? ` (${tag})` : ''} ${f.target}\n      ${f.message}`);
      }
      console.log('');
    }
    if (baseline && accepted.length) {
      console.log(`${'-'.repeat(74)}\nACCEPTED BASELINE (${accepted.length}) — real defects of the game this fixture reverse-engineers\n${'-'.repeat(74)}`);
      for (const f of accepted) {
        const b = baseline.accepted.find((x) => f.check.startsWith(x.check) && x.target === f.target);
        console.log(`  [${f.check}] ${f.target}\n      ${f.message}\n      WHY ACCEPTED: ${b?.reason ?? '(none given)'}`);
      }
      console.log('');
    }
    console.log(bar);
    console.log(counts.error
      ? `RESULT: NOT CLEARED — ${counts.error} error(s) require author action.`
      : 'RESULT: CLEARED — no errors.');
    console.log(bar);
  }
  process.exit(counts.error ? 1 : 0);
}
void ownerOf;

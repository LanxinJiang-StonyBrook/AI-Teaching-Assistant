#!/usr/bin/env node
// ===========================================================================
// GameSpec emitter — spec -> one self-contained HTML file.
//
//   node framework/emit/build.mjs <spec.json> [--out DIR] [--no-validate]
//
// The emitter is a LIBRARY PLUS A TEMPLATER, not a code-writing model: it
// inlines a hand-written runtime and a JSON blob. That is why coverage is high
// and why the generated game behaves identically across specs.
//
// Every build prints a COVERAGE LEDGER. It reports steps and objective
// coverage, and counts unscored mechanics SEPARATELY — because every
// game-feel element in the corpus is deliberately worth zero points, so an
// award-value metric is structurally blind to exactly the thing it would need
// to see.
// ===========================================================================
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runChecks } from '../validate/validate.mjs';
import { specHash } from '../validate/lib.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY = ['dual-series-bar', 'gauge', 'scatter-residuals', 'node-link-tree',
  'process-map', 'fit-sandbox', 'monte-carlo-sampler', 'select-points', 'isometric-room'];
// Widgets this build actually SHIPS. Everything else renders its declared
// fallback and says so on screen. There is no silent drop.
const SHIPPED = new Set(['fit-sandbox']);

export function emit(spec) {
  const css = readFileSync(path.join(here, 'runtime', 'style.css'), 'utf8');
  const js = readFileSync(path.join(here, 'runtime', 'runtime.js'), 'utf8');
  const widgetsPath = path.join(here, 'widgets', 'index.js');
  const widgets = existsSync(widgetsPath) ? readFileSync(widgetsPath, 'utf8') : '';
  const title = `${spec.meta.title}`;

  return `<!DOCTYPE html>
<html lang="${spec.meta.language || 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(spec.meta.description || '')}">
<meta name="generator" content="GameSpec ${spec.gamespec} emitter; spec hash ${specHash(spec)}">
<style>
${css}
</style>
</head>
<body>
<noscript><p style="padding:24px">This game needs JavaScript. Every question and every piece of feedback is in the page source if you need to read it without running it.</p></noscript>
<script>window.__SPEC__ = ${JSON.stringify(spec).replace(/</g, '\\u003c')};</script>
${widgets ? `<script>\n${widgets}\n</script>` : ''}
<script>
${js}
</script>
</body>
</html>
`;
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function coverageLedger(spec) {
  const steps = spec.flow.steps ?? [];
  const graded = steps.filter((s) => s.graded);
  const unscored = steps.filter((s) => !s.graded);
  const extSteps = steps.filter((s) => s.interaction?.type === 'extension');
  const byFidelity = { shipped: [], fallback: [] };
  for (const e of spec.extensions ?? [])
    (SHIPPED.has(e.widget) ? byFidelity.shipped : byFidelity.fallback).push(e);

  const objectives = spec.objectives ?? [];
  const assessed = new Set();
  for (const s of graded) (s.objectiveIds ?? []).forEach((o) => assessed.add(o));
  for (const e of spec.extensions ?? []) (e.pedagogy?.objectiveIds ?? []).forEach((o) => assessed.add(o));

  const reuse = (spec.extensions ?? []).map((e) => ({ id: e.id, widget: e.widget, n: (e.usedBy ?? []).length, fidelity: e.fidelity }));

  return {
    steps: steps.length,
    graded: graded.length,
    generatableCore: steps.length - extSteps.length,
    extensionSteps: extSteps.length,
    unscoredMechanics: unscored.length,
    objectives: objectives.length,
    objectivesAssessed: assessed.size,
    interactionTypes: [...new Set(steps.map((s) => s.interaction?.type))].sort(),
    widgetsShipped: byFidelity.shipped.map((e) => e.widget),
    widgetsFallenBack: byFidelity.fallback.map((e) => e.widget),
    reuse,
    unknownWidgets: (spec.extensions ?? []).filter((e) => !REGISTRY.includes(e.widget)).map((e) => e.widget),
  };
}

function printLedger(L, spec) {
  const bar = '='.repeat(74);
  console.log(`\n${bar}\nCOVERAGE LEDGER — ${spec.meta.title}\n${bar}`);
  console.log(`  steps ${L.steps}  ·  generatable-core ${L.generatableCore}  ·  extension ${L.extensionSteps}`);
  console.log(`  graded ${L.graded}  ·  objectives assessed ${L.objectivesAssessed}/${L.objectives}`);
  console.log(`  interaction types: ${L.interactionTypes.join(', ')}`);
  if (L.unscoredMechanics) {
    console.log(`\n  UNSCORED MECHANICS: ${L.unscoredMechanics} step(s) carry no points.`);
    console.log('  Reported separately on purpose: an award-value coverage metric cannot see');
    console.log('  game feel, because game feel is deliberately unscored. Degrading these to');
    console.log('  plain text would still report full award-value coverage.');
  }
  if (L.widgetsFallenBack.length) {
    console.log(`\n  FALLBACK RENDERED for widget(s): ${L.widgetsFallenBack.join(', ')}`);
    console.log('  This build does not ship them, so the declared fallback is used and the');
    console.log('  page says so on screen. No silent drop.');
  }
  if (L.unknownWidgets.length)
    console.log(`\n  WARNING: widget(s) not in the pinned registry: ${L.unknownWidgets.join(', ')}`);
  const overclaimed = L.reuse.filter((r) => r.fidelity === 'registry-exact' && r.n <= 1);
  if (L.reuse.length) {
    console.log(`\n  WIDGET REUSE FACTOR`);
    for (const r of L.reuse) console.log(`    ${r.widget.padEnd(22)} usedBy ${r.n}  (${r.fidelity})`);
    if (overclaimed.length) console.log(`    ^ ${overclaimed.length} claim registry-exact on a reuse factor of 1. That is bespoke, not a library.`);
  }
  console.log(bar);
}

// --------------------------------------------------------------------- CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const file = argv.find((a) => !a.startsWith('--'));
  if (!file) { console.error('usage: build.mjs <spec.json> [--out DIR] [--no-validate]'); process.exit(2); }
  const spec = JSON.parse(readFileSync(file, 'utf8'));

  if (!argv.includes('--no-validate')) {
    const baselinePath = file.replace(/\.spec\.json$/, '.baseline.json');
    const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, 'utf8')) : null;
    const { report } = runChecks(spec);
    const blocking = report.findings.filter((f) =>
      f.severity === 'ERROR' &&
      !(baseline?.accepted ?? []).some((b) => f.check.startsWith(b.check) && f.target === b.target));
    if (blocking.length) {
      console.error(`REFUSING TO BUILD — ${blocking.length} unaccepted ERROR(s). Run the validator.`);
      for (const f of blocking) console.error(`  [${f.check}] ${f.target}: ${f.message}`);
      process.exit(1);
    }
  }

  const outDir = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : path.join('public', spec.meta.id);
  mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'index.html');
  writeFileSync(outFile, emit(spec));
  const L = coverageLedger(spec);
  printLedger(L, spec);
  const bytes = readFileSync(outFile).length;
  console.log(`\nwrote ${outFile} — ${(bytes / 1024).toFixed(1)} KB, self-contained, no network calls.`);
}

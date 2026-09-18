// A family — Agent 5's own requirements, generalised from the pilot's A7/A14.
export const checks = [
{
  id: 'A1', name: 'authority-on-correct', family: 'assurance', reads: ['flow.steps', 'assurance'],
  run(spec, ctx, r) {
    if (spec.assurance?.notApplicable?.declared) return;
    if (spec.assurance?.authorityPolicy?.requireOnCorrect === false) return;
    for (const st of ctx.steps) {
      if (!st.graded) continue;
      for (const o of st.interaction?.options ?? [])
        if (o.correct && !o.authority)
          r.warn('A1 authority-on-correct', `flow.steps/${st.id}/${o.id}`,
            'correct answer carries no authority — Agent 5 requires a citable basis per graded answer');
    }
  },
},
{
  id: 'A2', name: 'authority-ref-format', family: 'assurance', reads: ['flow.steps', 'assurance.authorityPolicy', 'meta.sources'],
  run(spec, ctx, r) {
    const pats = spec.assurance?.authorityPolicy?.refPatterns ?? {
      'fasb-asc': '^ASC\\s\\d{3}-\\d{2}(-\\d{2})?(-\\d+)?',
      'aicpa-aus': '^AU-C\\s\\d{3}',
    };
    const sources = new Set((spec.meta?.sources ?? []).map((s) => s.id));
    for (const st of ctx.steps)
      for (const o of st.interaction?.options ?? []) {
        const a = o.authority;
        if (!a) continue;
        const t = `flow.steps/${st.id}/${o.id}`;
        const pat = pats[a.kind];
        if (pat && a.ref && !new RegExp(pat).test(a.ref))
          r.error('A2 authority-ref-format', t, `authority.ref '${a.ref}' does not match the pattern registered for kind '${a.kind}'`);
        if (pat && !a.ref)
          r.error('A2 authority-ref-format', t, `kind '${a.kind}' requires a ref`);
        if (a.sourceId && !sources.has(a.sourceId))
          r.error('A2 authority-ref-format', t, `authority.sourceId '${a.sourceId}' does not resolve in meta.sources`);
        if (['gaap-principle', 'professional-judgement'].includes(a.kind) && !(a.note ?? '').trim())
          r.error('A2 authority-ref-format', t,
            `kind '${a.kind}' requires a note. These have no citable Codification topic; forcing an ASC number onto them is the fabricated-precision failure Agent 5 exists to prevent`);
      }
  },
},
{
  id: 'A3', name: 'authority-kind-legal-for-domain', family: 'assurance', reads: ['assurance', 'flow.steps'],
  run(spec, ctx, r) {
    const allowed = spec.assurance?.authorityPolicy?.allowedKinds;
    if (!allowed?.length) return;
    for (const st of ctx.steps)
      for (const o of st.interaction?.options ?? [])
        if (o.authority && !allowed.includes(o.authority.kind))
          r.error('A3 authority-kind-legal', `flow.steps/${st.id}/${o.id}`,
            `authority kind '${o.authority.kind}' is not in allowedKinds for domain '${spec.assurance.domain}'`);
  },
},
{
  id: 'A4', name: 'not-applicable-declared', family: 'assurance', reads: ['assurance'],
  run(spec, ctx, r) {
    const a = spec.assurance ?? {};
    if (a.domain === 'none') {
      if (!a.notApplicable?.declared)
        r.error('A4 not-applicable-declared', 'assurance',
          "domain 'none' requires notApplicable.declared with a justification — an honest 'no accounting content here' beats a fabricated citation");
      return;
    }
    if (!a.notApplicable?.declared && !(a.assertions ?? []).length)
      r.error('A4 not-applicable-declared', 'assurance.assertions',
        `domain '${a.domain}' with zero assertions: Agent 5 signed off on nothing checkable`);
  },
},
{
  id: 'A5', name: 'human-attestation', family: 'assurance', reads: ['assurance.attestation'],
  run(spec, ctx, r) {
    if (spec.assurance?.notApplicable?.declared) return;
    const at = spec.assurance?.attestation;
    if (!at || !at.humanReviewer || !at.credential || !at.standardsEdition) {
      r.warn('A5 human-attestation', 'assurance.attestation',
        'no credentialed human attestation. The validator proves internal consistency; only a person can confirm a cited standard says what the answer claims');
      return;
    }
    if (!at.signed) r.warn('A5 human-attestation', 'assurance.attestation', 'attestation is present but unsigned');
  },
},
];

// A deliberately small JSON Schema subset validator: type, required, enum,
// const, properties, additionalProperties, items, oneOf, $ref (local),
// pattern, minItems, minLength, minimum, maximum. Enough for GameSpec, and no
// dependency to install on three collaborators' machines.
export function validate(schema, data, root = schema, path = '$') {
  const errs = [];
  const E = (m) => errs.push(`${path}: ${m}`);
  if (!schema || typeof schema !== 'object') return errs;

  if (schema.$ref) {
    const target = schema.$ref.replace(/^#\//, '').split('/')
      .reduce((o, k) => o?.[k.replace(/~1/g, '/').replace(/~0/g, '~')], root);
    return validate(target, data, root, path);
  }
  if (schema.oneOf) {
    const tries = schema.oneOf.map((s) => validate(s, data, root, path));
    const ok = tries.filter((t) => t.length === 0);
    if (ok.length !== 1) {
      const best = tries.reduce((a, b) => (a.length <= b.length ? a : b));
      E(`matched ${ok.length} of ${schema.oneOf.length} oneOf branches`);
      errs.push(...best);
    }
    return errs;
  }
  if (data === undefined) return errs;

  const types = schema.type ? [].concat(schema.type) : null;
  const actual = Array.isArray(data) ? 'array' : data === null ? 'null' : typeof data;
  if (types && !types.includes(actual) && !(types.includes('integer') && Number.isInteger(data)))
    { E(`expected ${types.join('|')}, got ${actual}`); return errs; }

  if (schema.const !== undefined && data !== schema.const) E(`must be ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(data)) E(`'${data}' not in ${schema.enum.join('|')}`);
  if (typeof data === 'string') {
    if (schema.pattern && !new RegExp(schema.pattern).test(data)) E(`'${data}' fails pattern ${schema.pattern}`);
    if (schema.minLength && data.length < schema.minLength) E(`shorter than minLength ${schema.minLength}`);
  }
  if (typeof data === 'number') {
    if (schema.minimum !== undefined && data < schema.minimum) E(`below minimum ${schema.minimum}`);
    if (schema.maximum !== undefined && data > schema.maximum) E(`above maximum ${schema.maximum}`);
  }
  if (Array.isArray(data)) {
    if (schema.minItems && data.length < schema.minItems) E(`fewer than minItems ${schema.minItems}`);
    if (schema.items) data.forEach((v, i) => errs.push(...validate(schema.items, v, root, `${path}[${i}]`)));
  }
  if (actual === 'object') {
    for (const k of schema.required ?? []) if (data[k] === undefined) E(`missing required '${k}'`);
    for (const [k, v] of Object.entries(data)) {
      const sub = schema.properties?.[k];
      if (sub) errs.push(...validate(sub, v, root, `${path}.${k}`));
      else if (schema.additionalProperties === false) E(`unknown property '${k}'`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object')
        errs.push(...validate(schema.additionalProperties, v, root, `${path}.${k}`));
    }
  }
  return errs;
}

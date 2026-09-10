let rules = [];

export function initialize(data) {
  rules = Array.isArray(data?.rules) ? data.rules : [];
}

export function resolve(specifier, context, nextResolve) {
  const rule = rules.find(candidate =>
    (!candidate.parentURL || candidate.parentURL === context.parentURL)
    && candidate.specifier === specifier,
  );
  if (rule?.url) return { url: rule.url, shortCircuit: true };
  if (rule?.appendExtension) return nextResolve(`${specifier}${rule.appendExtension}`, context);
  return nextResolve(specifier, context);
}

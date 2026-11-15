/* Display aliases only: raw match IDs and map keys remain unchanged. */
(function (root) {
  const text = value => String(value ?? '').replace(/\bgenesis[ _]+core\b/gi, 'Shaper');
  const objective = value => text(String(value ?? '').replace(/_/g, ' ').toLowerCase());
  const coaching = value => typeof value === 'string' ? text(value) : Array.isArray(value) ? value.map(coaching) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, child]) => [key, coaching(child)])) : value;
  root.ScoutObjectiveNames = { text, objective, coaching };
})(typeof window !== 'undefined' ? window : globalThis);

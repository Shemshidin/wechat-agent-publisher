const yaml = require('js-yaml');

function stripBom(text) {
  return String(text || '').replace(/^\uFEFF/, '');
}

function parseScalar(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    return raw.slice(1, -1);
  }
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return raw;
}

function parseFrontmatter(markdown) {
  const source = stripBom(markdown);
  if (!source.startsWith('---\n') && !source.startsWith('---\r\n')) {
    return { frontmatter: {}, body: source };
  }

  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { frontmatter: {}, body: source };

  let frontmatter = {};
  try {
    const parsed = yaml.load(match[1]) || {};
    frontmatter = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch (error) {
    frontmatter = {};
    for (const line of match[1].split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf(':');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      if (key) frontmatter[key] = parseScalar(value);
    }
  }

  return {
    frontmatter,
    body: source.slice(match[0].length),
  };
}

module.exports = {
  parseFrontmatter,
};

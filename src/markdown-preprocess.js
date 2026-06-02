function normalizeTaskListMarkers(markdown) {
  const lines = String(markdown || '').split('\n');
  let fence = null;
  let inMathFence = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = String(line || '').trim();
    const fenceMatch = trimmed.match(/^(`{3,}|~{3,})/);

    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      const length = fenceMatch[1].length;
      if (!fence) {
        fence = { marker, length };
      } else if (marker === fence.marker && length >= fence.length) {
        fence = null;
      }
      continue;
    }

    if (!fence && /^\$\$\s*$/.test(trimmed)) {
      inMathFence = !inMathFence;
      continue;
    }

    if (fence || inMathFence) continue;

    lines[i] = line.replace(
      /^(\s*)([-*+])\s+\[([ xX])\]\s+/,
      (_match, indent, marker, state) =>
        `${indent}${marker} ${String(state || '').trim().toLowerCase() === 'x' ? '☑' : '□'} `,
    );
  }

  return lines.join('\n');
}

function collectMermaidDiagnostics(markdown) {
  const diagnostics = [];
  const lines = String(markdown || '').split('\n');
  let fence = null;

  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(/^\s*(`{3,}|~{3,})\s*([A-Za-z0-9_-]+)?/);
    if (!match) continue;
    const marker = match[1][0];
    const length = match[1].length;
    const info = String(match[2] || '').toLowerCase();
    if (!fence) {
      fence = { marker, length, info, line: i + 1 };
      if (info === 'mermaid') {
        diagnostics.push({
          code: 'mermaid-not-rendered',
          message: `Line ${i + 1}: Mermaid fences are preserved as code in the CLI renderer. Render them to images before final WeChat sync if exact diagram output is required.`,
        });
      }
    } else if (marker === fence.marker && length >= fence.length) {
      fence = null;
    }
  }

  return diagnostics;
}

function preprocessMarkdown(markdown) {
  return normalizeTaskListMarkers(markdown);
}

module.exports = {
  collectMermaidDiagnostics,
  normalizeTaskListMarkers,
  preprocessMarkdown,
};

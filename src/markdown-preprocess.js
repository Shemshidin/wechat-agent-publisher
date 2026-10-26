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

function preserveBlockquoteStrong(markdown) {
  const lines = String(markdown || '').split('\n');
  let fence = null;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = String(line || '').trim();
    const fenceMatch = trimmed.match(/^(`{3,}|~{3,})/);

    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      const length = fenceMatch[1].length;
      if (!fence) fence = { marker, length };
      else if (marker === fence.marker && length >= fence.length) fence = null;
      continue;
    }
    if (fence || !/^\s*>/.test(line)) continue;

    // markdown-it treats emphasis in separately spaced quote paragraphs as
    // literal text. Turn bold spans into inline HTML before conversion so the
    // WeChat renderer keeps review-box labels such as **适应证：**.
    lines[i] = line.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  }

  return lines.join('\n');
}

function preprocessMarkdown(markdown) {
  return preserveBlockquoteStrong(normalizeTaskListMarkers(markdown));
}

module.exports = {
  normalizeTaskListMarkers,
  preserveBlockquoteStrong,
  preprocessMarkdown,
};

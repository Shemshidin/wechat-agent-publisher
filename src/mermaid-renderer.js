let mermaidCounter = 0;
let polyfillsInstalled = false;

function parseNumberAttribute(element, name, fallback = 0) {
  const raw = String(element?.getAttribute?.(name) || '').replace(/[a-z%]+$/i, '');
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function measureSvgElement(element) {
  const tag = String(element?.tagName || '').toLowerCase();
  if (tag === 'text' || tag === 'tspan') {
    const text = element.textContent || '';
    return {
      x: 0,
      y: 0,
      width: Math.max(16, Array.from(text).length * 8),
      height: 16,
    };
  }

  if (tag === 'rect' || tag === 'image' || tag === 'foreignobject') {
    return {
      x: parseNumberAttribute(element, 'x'),
      y: parseNumberAttribute(element, 'y'),
      width: parseNumberAttribute(element, 'width', 16),
      height: parseNumberAttribute(element, 'height', 16),
    };
  }

  const children = Array.from(element?.children || []).map(measureSvgElement);
  if (children.length > 0) {
    const minX = Math.min(...children.map((box) => box.x));
    const minY = Math.min(...children.map((box) => box.y));
    const maxX = Math.max(...children.map((box) => box.x + box.width));
    const maxY = Math.max(...children.map((box) => box.y + box.height));
    return {
      x: minX,
      y: minY,
      width: Math.max(16, maxX - minX),
      height: Math.max(16, maxY - minY),
    };
  }

  return { x: 0, y: 0, width: 16, height: 16 };
}

function installSvgMeasurementPolyfills() {
  if (polyfillsInstalled || !global.SVGElement?.prototype) return;
  if (!global.SVGElement.prototype.getBBox) {
    global.SVGElement.prototype.getBBox = function getBBox() {
      return measureSvgElement(this);
    };
  }
  if (!global.SVGElement.prototype.getComputedTextLength) {
    global.SVGElement.prototype.getComputedTextLength = function getComputedTextLength() {
      return Math.max(16, Array.from(this.textContent || '').length * 8);
    };
  }
  polyfillsInstalled = true;
}

async function loadMermaid(themeColor = '#0366d6') {
  installSvgMeasurementPolyfills();
  const mermaid = (await import('mermaid')).default;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'base',
    fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Arial, sans-serif',
    flowchart: {
      htmlLabels: false,
      useMaxWidth: true,
    },
    themeVariables: {
      primaryColor: '#f6faff',
      primaryBorderColor: themeColor,
      primaryTextColor: '#243b53',
      lineColor: themeColor,
      fontSize: '14px',
    },
  });
  return mermaid;
}

function normalizeSvg(svg) {
  if (!global.DOMParser || !global.XMLSerializer) return svg;
  const document = new global.DOMParser().parseFromString(svg, 'image/svg+xml');
  const svgElement = document.querySelector('svg');
  if (!svgElement) return svg;
  svgElement.setAttribute('style', 'display:block;max-width:100%;height:auto;margin:0 auto;');
  svgElement.setAttribute('width', '100%');
  svgElement.removeAttribute('height');
  return new global.XMLSerializer().serializeToString(svgElement);
}

async function renderMermaidDiagram(definition, index, options = {}) {
  const mermaid = await loadMermaid(options.themeColor || '#0366d6');
  const id = `wechat-agent-mermaid-${Date.now()}-${index}-${mermaidCounter += 1}`;
  const { svg } = await mermaid.render(id, String(definition || '').trim());
  const normalizedSvg = normalizeSvg(svg);
  return [
    '<section data-wechat-agent-mermaid="true" style="display:block;margin:18px 0;text-align:center;overflow-x:auto;">',
    normalizedSvg,
    '</section>',
  ].join('');
}

function parseFenceOpen(line) {
  const match = String(line || '').match(/^(\s*)(`{3,}|~{3,})\s*([^\s`~]*)?.*$/);
  if (!match) return null;
  return {
    indent: match[1] || '',
    marker: match[2][0],
    length: match[2].length,
    info: String(match[3] || '').trim().toLowerCase(),
  };
}

function isFenceClose(line, fence) {
  const match = String(line || '').match(/^\s*(`{3,}|~{3,})\s*$/);
  if (!match) return false;
  return match[1][0] === fence.marker && match[1].length >= fence.length;
}

async function renderMermaidFences(markdown, options = {}) {
  const lines = String(markdown || '').split('\n');
  const output = [];
  const diagnostics = [];
  let index = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const fence = parseFenceOpen(lines[i]);
    if (!fence || fence.info !== 'mermaid') {
      output.push(lines[i]);
      continue;
    }

    const startLine = i + 1;
    const body = [];
    i += 1;
    while (i < lines.length && !isFenceClose(lines[i], fence)) {
      body.push(lines[i]);
      i += 1;
    }

    if (i >= lines.length) {
      output.push(lines[startLine - 1], ...body);
      diagnostics.push({
        code: 'mermaid-unclosed-fence',
        message: `Line ${startLine}: Mermaid fence is not closed.`,
      });
      break;
    }

    index += 1;
    try {
      output.push(await renderMermaidDiagram(body.join('\n'), index, options));
      diagnostics.push({
        code: 'mermaid-rendered',
        message: `Line ${startLine}: Mermaid diagram rendered to SVG.`,
      });
    } catch (error) {
      output.push(
        '```mermaid',
        ...body,
        '```'
      );
      diagnostics.push({
        code: 'mermaid-render-failed',
        message: `Line ${startLine}: Mermaid render failed: ${error?.message || String(error || '')}`,
      });
    }
  }

  return { markdown: output.join('\n'), diagnostics };
}

module.exports = {
  renderMermaidFences,
  renderMermaidDiagram,
  normalizeSvg,
};

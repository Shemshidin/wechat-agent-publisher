const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const markdownit = require('markdown-it');
const hljs = require('highlight.js');
const mathjax3 = require('markdown-it-mathjax3');
const { parseFrontmatter } = require('./frontmatter');
const { buildRenderOptions, normalizeHeadingStyle, WECHAT_CONVERTER_DEFAULT_HEADING_COLORS } = require('./config');
const { createObsidianLikeImageApp } = require('./image-resolver');
const { preprocessImageSwipeCallouts } = require('./image-swipe');
const { normalizeRenderedDomPunctuation } = require('./chinese-punctuation');
const { preprocessMarkdown } = require('./markdown-preprocess');
const { renderMermaidFences } = require('./mermaid-renderer');
const { decorateArticleHeadings } = require('../vendor/heading-style-renderer');

let runtimeReady = false;

function ensureDom() {
  if (global.window && global.document) return;
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://local.agent/',
    pretendToBeVisual: true,
  });
  global.window = dom.window;
  global.document = dom.window.document;
  global.Node = dom.window.Node;
  global.Element = dom.window.Element;
  global.HTMLElement = dom.window.HTMLElement;
  global.SVGElement = dom.window.SVGElement;
  global.CSSStyleSheet = dom.window.CSSStyleSheet;
  global.XMLSerializer = dom.window.XMLSerializer;
  global.DOMParser = dom.window.DOMParser;
  global.navigator = dom.window.navigator;
}

function ensureRuntime() {
  ensureDom();
  if (runtimeReady && window.AppleTheme && window.AppleStyleConverter) return;

  global.markdownit = markdownit;
  global.hljs = hljs;
  window.markdownit = markdownit;
  window.hljs = hljs;
  window.ObsidianWechatMath = (md) => md.use(mathjax3);

  require('../vendor/apple-theme.js');
  require('../vendor/converter.js');

  if (!window.AppleTheme || !window.AppleStyleConverter) {
    throw new Error('WeChat render runtime failed to load.');
  }
  runtimeReady = true;
}

function extractFirstHeading(markdown) {
  const match = String(markdown || '').match(/^\s*#\s+(.+)$/m);
  return match ? match[1].trim() : '';
}

function wrapFullHtml(fragment, { title = 'WeChat Article' } = {}) {
  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${escapeHtml(title)}</title>`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '</head>',
    '<body>',
    fragment,
    '</body>',
    '</html>',
  ].join('\n');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function createConverter(options = {}) {
  ensureRuntime();
  const renderOptions = buildRenderOptions(options);
  const theme = new window.AppleTheme(renderOptions);
  const imageApp = createObsidianLikeImageApp({
    sourcePath: renderOptions.sourcePath || '',
    vaultRoot: renderOptions.vaultRoot || '',
  });
  const converter = new window.AppleStyleConverter(
    theme,
    renderOptions.avatarUrl || '',
    renderOptions.showImageCaption,
    imageApp,
    renderOptions.sourcePath || ''
  );
  return { converter, theme, options: renderOptions };
}

function appendInlineStyle(element, additions) {
  if (!element || !additions) return;
  const existing = element.getAttribute('style') || '';
  const withoutConflicts = existing
    .replace(/(?:^|;)\s*font-size\s*:\s*[^;]+;?/gi, ';')
    .replace(/(?:^|;)\s*color\s*:\s*[^;]+;?/gi, ';')
    .replace(/;{2,}/g, ';')
    .replace(/^\s*;\s*/, '')
    .trim();
  const base = withoutConflicts && !withoutConflicts.endsWith(';') ? `${withoutConflicts};` : withoutConflicts;
  element.setAttribute('style', `${base}${base ? ' ' : ''}${additions}`);
}

function isReferencesHeading(element) {
  if (!element || !/^H[1-6]$/i.test(element.tagName || '')) return false;
  return String(element.textContent || '').trim().toLowerCase() === 'references';
}

function preserveStrongEmphasis(container) {
  for (const strong of container.querySelectorAll('strong, b')) {
    // WeChat's editor can discard semantic-only emphasis in paragraphs, lists,
    // and styled quotes. Preserve Markdown labels such as **适应证：** directly
    // on the inline element.
    strong.style.setProperty('font-weight', '700', 'important');
  }
}

function extractRootSectionColor(container) {
  const root = container.querySelector('section');
  const match = String(root?.getAttribute('style') || '').match(/(?:^|;)\s*color\s*:\s*([^;]+?)\s*(?:;|$)/i);
  return match ? match[1] : '#3e3e3e';
}

function hardenTableCells(container, options = {}) {
  // Upstream (wechat-converter 2.12.x) leaves table cell font-size/color to
  // section inheritance, but WeChat's editor drops inherited styles inside
  // tables. Re-apply explicit body-level sizing and text color on cells.
  const sizes = (global.window && global.window.AppleTheme && global.window.AppleTheme.FONT_SIZES) || {};
  const config = sizes[options.fontSize] || sizes[3] || {};
  const basePx = `${config.base || 16}px`;
  const bodyColor = extractRootSectionColor(container);
  for (const cell of container.querySelectorAll('th, td')) {
    appendInlineStyle(cell, `font-size:${basePx};color:${bodyColor};`);
  }
}

const TRAILING_NOTE_PATTERN = new RegExp(
  '^\s*[（(]?\s*(?:'
    + '改编自|数据来自|数据引自|译自|摘自|整理自|引自|来源[：于]?|出处[：:]?|注[：：）)]?'
    + '|Data from|Modified from|Adapted from|Reprinted from|Source[：:]|From[：:]'
    + ')',
  'i',
);

function looksLikeTrailingNote(el) {
  if (!el) return false;
  const text = (el.textContent || '').trim();
  return text.length > 0 && text.length < 500 && TRAILING_NOTE_PATTERN.test(text);
}

// Footnote blocks like "<sup>a</sup>所列情况常可..." or "<sup>a</sup>...资料引自 Fischer PE..."
function startsWithFootnoteMarker(el) {
  if (!el) return false;
  const first = el.firstElementChild;
  if (!first || first.tagName !== 'SUP') return false;
  const marker = (first.textContent || '').trim();
  return marker.length > 0 && marker.length <= 3 && /^[a-zA-Z0-9*†‡§#]+$/.test(marker);
}

function isTrailingNoteBlock(el) {
  return looksLikeTrailingNote(el) || startsWithFootnoteMarker(el);
}

function applyNoteStyle(el) {
  appendInlineStyle(el, 'font-size:12px;color:#8a8a8a;');
  for (const child of el.querySelectorAll('p,li,ol,ul,span,a,strong,em,sup')) {
    appendInlineStyle(child, 'font-size:12px;color:#8a8a8a;');
  }
}

function styleTrailingNotes(container) {
  // 1) Citation/attribution paragraphs directly after a table (the table sits
  //    inside a wrapping section; notes follow as sibling sections).
  for (const table of Array.from(container.querySelectorAll('table'))) {
    const wrapper = table.closest('section');
    let node = wrapper ? wrapper.nextElementSibling : null;
    while (node) {
      const target = node.tagName === 'P' ? node : node.querySelector(':scope > p');
      if (!isTrailingNoteBlock(target)) break;
      applyNoteStyle(target);
      node = node.nextElementSibling;
    }
  }
  // 2) A citation/attribution paragraph at the very end of a blockquote
  //    (e.g. BOX content ending with "改编自 ..." / "Modified from ...").
  for (const quote of Array.from(container.querySelectorAll('blockquote'))) {
    let last = quote.lastElementChild;
    while (last) {
      if (!/^(P|SECTION)$/i.test(last.tagName || '')) {
        last = last.previousElementSibling;
        continue;
      }
      const target = last.tagName === 'SECTION' ? last.querySelector(':scope > p') : last;
      if (!isTrailingNoteBlock(target)) break;
      applyNoteStyle(target);
      last = last.previousElementSibling;
    }
  }
}

function styleReferenceEntries(container) {
  const referenceStyle = 'font-size:12px;color:#8a8a8a;';
  const headings = Array.from(container.querySelectorAll('h1,h2,h3,h4,h5,h6'));

  for (const heading of headings) {
    if (!isReferencesHeading(heading)) continue;
    const headingLevel = Number.parseInt(heading.tagName.slice(1), 10);
    let node = heading.nextElementSibling;

    while (node) {
      if (/^H[1-6]$/i.test(node.tagName || '')) {
        const nextLevel = Number.parseInt(node.tagName.slice(1), 10);
        if (nextLevel <= headingLevel) break;
      }

      appendInlineStyle(node, referenceStyle);
      for (const child of Array.from(node.querySelectorAll('p,li,ol,ul,span,a,strong,em'))) {
        appendInlineStyle(child, referenceStyle);
      }
      node = node.nextElementSibling;
    }
  }
}

function normalizeRenderedHtml(html, options = {}) {
  ensureDom();
  const container = document.createElement('div');
  container.innerHTML = html || '';
  if (options.coloredHeader === true) {
    for (const heading of container.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
      const level = Number.parseInt(heading.tagName.slice(1), 10);
      // Every heading level uses the shared publishing blue: WeChat draft
      // validation rejects per-level color tints on heading text.
      const headingColor = options.headingColors?.[level - 1]
        || options.customColor
        || '#0366d6';
      heading.style.setProperty('color', headingColor, 'important');
    }
  }
  preserveStrongEmphasis(container);
  hardenTableCells(container, options);
  styleReferenceEntries(container);
  styleTrailingNotes(container);
  if (options.normalizeChinesePunctuation !== false) {
    normalizeRenderedDomPunctuation(container, { enabled: true });
  }
  return container.innerHTML.replace(/<h([1-6])\b[^>]*>/gi, (headingHtml, levelText) => {
    const level = Number.parseInt(levelText, 10);
    const color = options.headingColors?.[level - 1] || options.customColor || '#0366d6';
    const normalizedHex = String(color).toLowerCase();
    const hex = normalizedHex.match(/^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i);
    if (!hex) return headingHtml;
    const rgbPattern = new RegExp(
      `color:\\s*rgb\\(\\s*${Number.parseInt(hex[1], 16)}\\s*,\\s*${Number.parseInt(hex[2], 16)}\\s*,\\s*${Number.parseInt(hex[3], 16)}\\s*\\)(\\s*!important)?`,
      'i',
    );
    return headingHtml.replace(rgbPattern, (_match, important = '') => `color:${normalizedHex}${important}`);
  });
}

function resolveSectionTitleColor(renderOptions = {}) {
  const color = renderOptions.headingColors?.[1];
  if (!color) return undefined;
  if (String(color).toLowerCase() === WECHAT_CONVERTER_DEFAULT_HEADING_COLORS[1].toLowerCase()) return undefined;
  return color;
}

function resolveHeadingStyle(renderOptions, frontmatter = {}) {
  // Precedence: explicit CLI flag > per-article frontmatter `headingStyle` >
  // project config > default. The flag marker is set by src/cli.js.
  if (renderOptions.headingStyleFromCli && renderOptions.headingStyle) {
    return renderOptions.headingStyle;
  }
  if (frontmatter.headingStyle) {
    return normalizeHeadingStyle(frontmatter.headingStyle);
  }
  return renderOptions.headingStyle || 'default';
}

async function renderMarkdown(markdown, options = {}) {
  const parsed = parseFrontmatter(markdown);
  const sourcePath = options.sourcePath ? path.resolve(options.sourcePath) : '';
  const { converter, options: renderOptions } = createConverter({
    ...options,
    sourcePath,
  });
  await converter.initMarkdownIt();
  if (sourcePath && typeof converter.updateSourcePath === 'function') {
    converter.updateSourcePath(sourcePath);
  }
  const normalizedMarkdown = preprocessMarkdown(parsed.body);
  const mermaidResult = await renderMermaidFences(normalizedMarkdown, {
    themeColor: renderOptions.customColor || '#0366d6',
  });
  const preprocessedBody = preprocessImageSwipeCallouts(mermaidResult.markdown, {
    sourcePath,
    vaultRoot: renderOptions.vaultRoot || '',
  });
  const rawHtml = await converter.convert(preprocessedBody);
  const normalizedHtml = normalizeRenderedHtml(rawHtml, renderOptions);
  // Section (##) heading decoration runs last, mirroring the upstream
  // render pipeline: the decorator rewrites h2 markup wholesale, so it must
  // come after heading-color normalization.
  const headingStyle = resolveHeadingStyle(renderOptions, parsed.frontmatter);
  const html = headingStyle === 'default'
    ? normalizedHtml
    : decorateArticleHeadings(normalizedHtml, {
      headingStyle,
      themeColor: renderOptions.themeColor,
      customColor: renderOptions.customColor,
      // When the h2 heading color is explicitly customized (e.g. the theme's
      // deep tone), section title text follows it; otherwise keep the
      // decorator's upstream default title color.
      titleColor: resolveSectionTitleColor(renderOptions),
    });
  const { headingStyleFromCli, ...cleanRenderOptions } = renderOptions;
  const title = options.title || parsed.frontmatter.title || extractFirstHeading(parsed.body) || '无标题文章';
  return {
    html: options.full ? wrapFullHtml(html, { title }) : html,
    fragmentHtml: html,
    title,
    frontmatter: parsed.frontmatter,
    options: { ...cleanRenderOptions, headingStyle },
    diagnostics: mermaidResult.diagnostics,
  };
}

async function renderMarkdownFile(inputPath, options = {}) {
  const resolved = path.resolve(inputPath);
  const markdown = fs.readFileSync(resolved, 'utf8');
  return renderMarkdown(markdown, {
    ...options,
    sourcePath: resolved,
  });
}

module.exports = {
  ensureDom,
  ensureRuntime,
  renderMarkdown,
  renderMarkdownFile,
  wrapFullHtml,
  normalizeRenderedHtml,
  preserveStrongEmphasis,
};

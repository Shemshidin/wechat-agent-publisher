const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const markdownit = require('markdown-it');
const hljs = require('highlight.js');
const mathjax3 = require('markdown-it-mathjax3');
const { parseFrontmatter } = require('./frontmatter');
const { buildRenderOptions } = require('./config');
const { createObsidianLikeImageApp } = require('./image-resolver');
const { preprocessImageSwipeCallouts } = require('./image-swipe');
const { normalizeRenderedDomPunctuation } = require('./chinese-punctuation');
const { collectMermaidDiagnostics, preprocessMarkdown } = require('./markdown-preprocess');

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

function normalizeRenderedHtml(html, options = {}) {
  if (options.normalizeChinesePunctuation === false) return html;
  ensureDom();
  const container = document.createElement('div');
  container.innerHTML = html || '';
  normalizeRenderedDomPunctuation(container, { enabled: true });
  return container.innerHTML;
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
  const diagnostics = collectMermaidDiagnostics(parsed.body);
  const normalizedMarkdown = preprocessMarkdown(parsed.body);
  const preprocessedBody = preprocessImageSwipeCallouts(normalizedMarkdown, {
    sourcePath,
    vaultRoot: renderOptions.vaultRoot || '',
  });
  const rawHtml = await converter.convert(preprocessedBody);
  const html = normalizeRenderedHtml(rawHtml, renderOptions);
  const title = options.title || parsed.frontmatter.title || extractFirstHeading(parsed.body) || '无标题文章';
  return {
    html: options.full ? wrapFullHtml(html, { title }) : html,
    fragmentHtml: html,
    title,
    frontmatter: parsed.frontmatter,
    options: renderOptions,
    diagnostics,
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
};

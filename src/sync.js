const fs = require('fs');
const path = require('path');
const { fileURLToPath } = require('url');
const sharp = require('sharp');
const { ensureDom, renderMarkdownFile } = require('./render');
const { WechatAPI } = require('./wechat-api');
const { buildWechatAccount } = require('./config');

const { cleanHtmlForDraft } = require('../vendor/wechat-html-cleaner');

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
};

function inferMimeType(filename) {
  return MIME_BY_EXT[path.extname(String(filename || '')).toLowerCase()] || 'application/octet-stream';
}

function isRemote(value) {
  return /^https?:\/\//i.test(String(value || ''));
}

function isDataUrl(value) {
  return /^data:/i.test(String(value || ''));
}

function parseDataUrl(value) {
  const match = String(value || '').match(/^data:([^;,]+)?(;base64)?,([\s\S]*)$/i);
  if (!match) throw new Error('Invalid data URL.');
  const mime = match[1] || 'application/octet-stream';
  const data = match[2] ? Buffer.from(match[3], 'base64') : Buffer.from(decodeURIComponent(match[3]));
  return { blob: new Blob([data], { type: mime }), filename: `image.${mime.split('/')[1] || 'bin'}` };
}

function resolveLocalPath(src, baseDir) {
  if (/^file:/i.test(String(src || ''))) {
    return fileURLToPath(src);
  }
  const raw = decodeURIComponent(String(src || ''));
  if (/^[a-zA-Z]:[\\/]/.test(raw) || path.isAbsolute(raw)) return path.resolve(raw);
  return path.resolve(baseDir, raw);
}

async function srcToBlob(src, baseDir) {
  if (isDataUrl(src)) return parseDataUrl(src);
  if (isRemote(src)) {
    const response = await fetch(src);
    if (!response.ok) throw new Error(`Failed to fetch image ${src}: HTTP ${response.status}`);
    const arrayBuffer = await response.arrayBuffer();
    const type = response.headers.get('content-type') || inferMimeType(src);
    return { blob: new Blob([arrayBuffer], { type }), filename: path.basename(new URL(src).pathname) || 'image.jpg' };
  }

  const localPath = resolveLocalPath(src, baseDir);
  const buffer = fs.readFileSync(localPath);
  return {
    blob: new Blob([buffer], { type: inferMimeType(localPath) }),
    filename: path.basename(localPath),
  };
}

async function replaceArticleImages(html, api, baseDir, onProgress = null) {
  ensureDom();
  const container = document.createElement('div');
  container.innerHTML = html || '';
  const images = Array.from(container.querySelectorAll('img'));
  const uniqueSources = Array.from(new Set(images.map((img) => img.getAttribute('src')).filter(Boolean)));
  const uploaded = new Map();
  const failures = [];
  let completed = 0;

  for (const src of uniqueSources) {
    const isWechatImage = /^https?:\/\/mmbiz\.qpic\.cn\//i.test(src)
      || /^https?:\/\/mmbiz\.qlogo\.cn\//i.test(src);
    if (isWechatImage) {
      uploaded.set(src, src);
      completed += 1;
      if (onProgress) onProgress(completed, uniqueSources.length, src);
      continue;
    }

    try {
      const { blob, filename } = await srcToBlob(src, baseDir);
      const result = await api.uploadImage(blob, filename);
      uploaded.set(src, result.url);
    } catch (error) {
      failures.push({ src, message: error?.message || String(error || '') });
    }
    completed += 1;
    if (onProgress) onProgress(completed, uniqueSources.length, src);
  }

  for (const image of images) {
    const src = image.getAttribute('src');
    if (uploaded.has(src)) image.setAttribute('src', uploaded.get(src));
    if (!uploaded.has(src)) {
      const placeholder = document.createElement('p');
      placeholder.setAttribute('style', 'margin:12px 0;padding:10px 12px;border:1px dashed #d0d7de;border-radius:6px;color:#8c6d1f;background:#fff8e5;font-size:13px;line-height:1.7;');
      placeholder.textContent = `图片上传失败，请在微信后台手动补传：${src}`;
      image.replaceWith(placeholder);
    }
  }
  return { html: container.innerHTML, failures };
}

function ensureSvgNamespace(svgText) {
  const source = String(svgText || '');
  if (/^<svg\b[^>]*\sxmlns=/i.test(source)) return source;
  return source.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
}

function removeDuplicateXmlnsAttributes(svgText) {
  return String(svgText || '').replace(/<[^!?/][^>]*>/g, (tag) => {
    const seen = new Set();
    return tag.replace(/\s(xmlns(?::[A-Za-z_][\w.-]*)?)="[^"]*"/g, (attribute, name) => {
      const key = String(name || '').toLowerCase();
      if (seen.has(key)) return '';
      seen.add(key);
      return attribute;
    });
  });
}

async function svgToPngBlob(svgElement) {
  const svgText = removeDuplicateXmlnsAttributes(
    ensureSvgNamespace(new XMLSerializer().serializeToString(svgElement))
  );
  const pngBuffer = await sharp(Buffer.from(svgText)).png().toBuffer();
  return new Blob([pngBuffer], { type: 'image/png' });
}

async function replaceSvgElements(html, api, onProgress = null) {
  ensureDom();
  const container = document.createElement('div');
  container.innerHTML = html || '';
  const svgs = Array.from(container.querySelectorAll('svg'));
  const failures = [];
  let completed = 0;

  for (const svg of svgs) {
    try {
      const isMermaid = !!svg.closest('[data-wechat-agent-mermaid]');
      const blob = await svgToPngBlob(svg);
      const result = await api.uploadImage(blob, isMermaid ? 'mermaid.png' : 'formula.png');
      const img = document.createElement('img');
      img.setAttribute('src', result.url);
      img.setAttribute('alt', isMermaid ? 'Mermaid 图表' : '公式');
      img.setAttribute('class', isMermaid ? 'mermaid-diagram-image' : 'math-formula-image');
      img.setAttribute('style', 'display:inline-block;vertical-align:middle;max-width:100%;height:auto;');
      svg.replaceWith(img);
    } catch (error) {
      failures.push({ message: error?.message || String(error || '') });
    }
    completed += 1;
    if (onProgress) onProgress(completed, svgs.length);
  }

  return { html: container.innerHTML, failures };
}

function findFirstImageSrc(html) {
  ensureDom();
  const container = document.createElement('div');
  container.innerHTML = html || '';
  return container.querySelector('img[src]')?.getAttribute('src') || '';
}

function pickFirstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function parseFrontmatterBoolean(value, fallback = undefined) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const raw = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on', '是', '打开', '开启'].includes(raw)) return true;
  if (['0', 'false', 'no', 'n', 'off', '否', '关闭'].includes(raw)) return false;
  return fallback;
}

function assertSupportedArticleType(frontmatter = {}) {
  const type = String(frontmatter.type || '').trim().toLowerCase();
  if (!type || type === 'article' || type === 'news') return;
  if (type === 'image') {
    throw new Error('frontmatter type: image / image_list 属于图片消息（小绿书）发布，当前 wechat-agent-publisher 仅支持公众号图文草稿。请先改为普通图文，或等待图片消息接口实现。');
  }
  throw new Error(`不支持的 frontmatter type: ${type}`);
}

async function buildDraftArticle(inputPath, api, account, options = {}, context = {}) {
  ensureDom();
  const resolvedInput = path.resolve(inputPath);
  const baseDir = path.dirname(resolvedInput);
  const rendered = await renderMarkdownFile(resolvedInput, options);
  const frontmatter = rendered.frontmatter || {};
  assertSupportedArticleType(frontmatter);
  const allowArticleOptionOverrides = context.allowArticleOptionOverrides !== false;

  const coverSrc = pickFirstString(
    allowArticleOptionOverrides ? options.cover : '',
    frontmatter.cover,
    findFirstImageSrc(rendered.fragmentHtml)
  );
  if (!coverSrc) throw new Error('Missing cover image. Provide --cover or frontmatter cover.');

  const cover = await srcToBlob(coverSrc, baseDir);
  const coverResult = await api.uploadCover(cover.blob, cover.filename);

  const imageResult = await replaceArticleImages(
    rendered.fragmentHtml,
    api,
    baseDir,
    options.onImageProgress
  );
  const svgResult = await replaceSvgElements(
    imageResult.html,
    api,
    options.onSvgProgress || options.onMathProgress || null
  );
  const content = cleanHtmlForDraft(svgResult.html);
  const digest = pickFirstString(
    allowArticleOptionOverrides ? options.digest : '',
    frontmatter.digest,
    frontmatter.summary,
    frontmatter.abstract,
    frontmatter.description,
    frontmatter.excerpt
  ).slice(0, 120);
  const author = pickFirstString(options.author, account.author, frontmatter.author);
  const sourceUrl = pickFirstString(
    allowArticleOptionOverrides ? options.sourceUrl : '',
    allowArticleOptionOverrides ? options.contentSourceUrl : '',
    account.contentSourceUrl,
    frontmatter.source_url,
    frontmatter.sourceUrl,
    frontmatter.content_source_url,
    frontmatter.contentSourceUrl,
  );
  const openComment = parseFrontmatterBoolean(frontmatter.need_open_comment, account.openComment);
  const onlyFansCanComment = parseFrontmatterBoolean(frontmatter.only_fans_can_comment, account.onlyFansCanComment);
  const article = {
    title: pickFirstString(
      allowArticleOptionOverrides ? options.title : '',
      frontmatter.title,
      rendered.title,
      path.basename(resolvedInput, path.extname(resolvedInput))
    ).slice(0, 64),
    content,
    thumb_media_id: coverResult.media_id,
    author,
    digest: digest || '由 agent 生成并同步',
  };

  if (sourceUrl) article.content_source_url = sourceUrl;
  if (typeof openComment === 'boolean') article.need_open_comment = openComment ? 1 : 0;
  if (typeof onlyFansCanComment === 'boolean') article.only_fans_can_comment = onlyFansCanComment ? 1 : 0;

  return {
    inputPath: resolvedInput,
    article,
    diagnostics: rendered.diagnostics || [],
    imageUploadFailures: imageResult.failures,
    svgUploadFailures: svgResult.failures,
  };
}

async function syncMarkdownFile(inputPath, options = {}) {
  const account = buildWechatAccount(options.account || options);
  const api = new WechatAPI(account.appId, account.appSecret, { proxyUrl: options.proxyUrl || '' });
  const built = await buildDraftArticle(inputPath, api, account, options, {
    allowArticleOptionOverrides: true,
  });

  const draftMediaId = String(options.draftMediaId || '').trim();
  const draftIndex = Number.isFinite(Number(options.draftIndex)) ? Number(options.draftIndex) : 0;
  const result = draftMediaId
    ? await api.updateDraft(draftMediaId, draftIndex, built.article)
    : await api.createDraft(built.article);

  return {
    mediaId: result.media_id,
    isUpdate: !!draftMediaId,
    article: built.article,
    diagnostics: built.diagnostics,
    imageUploadFailures: built.imageUploadFailures,
    svgUploadFailures: built.svgUploadFailures,
  };
}

async function syncMarkdownFiles(inputPaths, options = {}) {
  const paths = Array.isArray(inputPaths) ? inputPaths.filter(Boolean) : [inputPaths].filter(Boolean);
  if (paths.length === 0) throw new Error('Missing markdown input files.');
  if (paths.length === 1) {
    const single = await syncMarkdownFile(paths[0], options);
    return {
      ...single,
      articles: [single.article],
      articleResults: [{
        inputPath: path.resolve(paths[0]),
        article: single.article,
        diagnostics: single.diagnostics,
        imageUploadFailures: single.imageUploadFailures,
        svgUploadFailures: single.svgUploadFailures,
      }],
    };
  }

  const articleSpecificOptions = ['cover', 'title', 'digest', 'sourceUrl', 'contentSourceUrl'];
  for (const key of articleSpecificOptions) {
    if (options[key]) {
      throw new Error(`多文章同步时不支持全局 --${key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}；请在每篇 Markdown frontmatter 中分别设置对应字段。`);
    }
  }

  const account = buildWechatAccount(options.account || options);
  const api = new WechatAPI(account.appId, account.appSecret, { proxyUrl: options.proxyUrl || '' });
  const articleResults = [];
  for (const inputPath of paths) {
    articleResults.push(await buildDraftArticle(inputPath, api, account, options, {
      allowArticleOptionOverrides: false,
    }));
  }
  const articles = articleResults.map((result) => result.article);
  const draftMediaId = String(options.draftMediaId || '').trim();
  const draftIndex = Number.isFinite(Number(options.draftIndex)) ? Number(options.draftIndex) : 0;
  let result;
  if (draftMediaId) {
    for (let i = 0; i < articles.length; i += 1) {
      result = await api.updateDraft(draftMediaId, draftIndex + i, articles[i]);
    }
    result = result || { media_id: draftMediaId };
  } else {
    result = await api.createDraft(articles);
  }

  return {
    mediaId: result.media_id,
    isUpdate: !!draftMediaId,
    articles,
    article: articles[0],
    articleResults,
    diagnostics: articleResults.flatMap((item) => item.diagnostics),
    imageUploadFailures: articleResults.flatMap((item) => item.imageUploadFailures),
    svgUploadFailures: articleResults.flatMap((item) => item.svgUploadFailures),
  };
}

module.exports = {
  inferMimeType,
  srcToBlob,
  replaceArticleImages,
  replaceSvgElements,
  svgToPngBlob,
  removeDuplicateXmlnsAttributes,
  findFirstImageSrc,
  parseFrontmatterBoolean,
  buildDraftArticle,
  syncMarkdownFile,
  syncMarkdownFiles,
};

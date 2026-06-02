const { resolveImageSrc } = require('./image-resolver');

const IMAGE_SWIPE_TYPES = new Set(['image-swipe', 'image-sensitive']);
const IMAGE_SWIPE_DEFAULT_WARNING = '此类图片可能引发不适，向左滑动查看';
const IMAGE_SWIPE_DEFAULT_HINT = '左右滑动查看图片';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseCalloutOpen(line) {
  const match = String(line || '').match(/^\s{0,3}>\s?\[!\s*([a-z-]+)\s*](?:[+-])?\s*(.*)$/i);
  if (!match) return null;
  const type = String(match[1] || '').toLowerCase();
  if (!IMAGE_SWIPE_TYPES.has(type)) return null;
  return {
    type,
    optionText: String(match[2] || '').trim(),
  };
}

function stripQuotePrefix(line) {
  return String(line || '').replace(/^\s{0,3}>\s?/, '');
}

function parseMarkdownImage(line) {
  const text = String(line || '').trim();
  let match = text.match(/^!\[\[([^\]|]+)(?:\|([^\]]+))?]]/);
  if (match) {
    const src = String(match[1] || '').trim();
    const alt = String(match[2] || '').trim() || src.split(/[\\/]/).pop().replace(/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i, '');
    return { src, alt };
  }

  match = text.match(/^!\[([^\]]*)]\(([^)\r\n]+)\)/);
  if (match) {
    let src = String(match[2] || '').trim();
    if (src.startsWith('<') && src.endsWith('>')) src = src.slice(1, -1);
    return {
      src: src.split(/\s+/)[0],
      alt: String(match[1] || '').trim(),
    };
  }

  return null;
}

function collectImages(lines) {
  const images = [];
  for (const line of lines) {
    const image = parseMarkdownImage(line);
    if (image && image.src) images.push(image);
  }
  return images;
}

function renderImagePanel(image, context) {
  const src = resolveImageSrc(image.src, context);
  const alt = image.alt || image.src;
  const caption = alt.replace(/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i, '');
  const captionHtml = caption
    ? `<figcaption style="font-size: 12px; color: #999; text-align: center; margin-top: 8px;">${escapeHtml(caption)}</figcaption>`
    : '';

  return [
    '<section style="display:table-cell;vertical-align:top;width:1%;box-sizing:border-box;white-space:normal;padding:0 8px;margin:0;text-align:center;">',
    `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" style="display: block; margin: 0 auto; max-width: 100%; border-radius: 4px;">`,
    captionHtml,
    '</section>',
  ].join('');
}

function renderWarningPanel(warning) {
  return [
    '<section style="display:table-cell;vertical-align:middle;width:1%;box-sizing:border-box;white-space:normal;padding:8px 10px;margin:0;border:1px solid #e6e8ef;border-radius:12px;background:#f8f9fc;color:#4a4f5a;text-align:center;">',
    '<section style="display:block;box-sizing:border-box;padding:0;margin:0 auto;">',
    '<section style="display:inline-block;margin:0 auto 8px;padding:2px 8px;border-radius:999px;background:#ffffff;color:#8a6d3b;border:1px solid #efe2c7;font-size:12px;line-height:1.4;">敏感图片</section>',
    `<section style="display:block;margin:0;color:#4a4f5a;font-size:14px;line-height:1.55;font-weight:500;">${escapeHtml(warning || IMAGE_SWIPE_DEFAULT_WARNING)}</section>`,
    '<section style="display:block;margin-top:6px;padding:0;color:#6b7280;font-size:12px;line-height:1.4;">向左滑动查看</section>',
    '</section>',
    '</section>',
  ].join('');
}

function renderSwipeBlock({ type, optionText, lines }, context) {
  const images = collectImages(lines);
  if (!images.length) return null;
  const panelCount = images.length + (type === 'image-sensitive' ? 1 : 0);
  const rowChildren = [
    ...(type === 'image-sensitive' ? [renderWarningPanel(optionText || IMAGE_SWIPE_DEFAULT_WARNING)] : []),
    ...images.map((image) => renderImagePanel(image, context)),
  ].join('');
  const hint = type === 'image-swipe'
    ? `<section style="font-size: 12px; color: #999; text-align: center; margin-top: 8px;">${escapeHtml(optionText || IMAGE_SWIPE_DEFAULT_HINT)}</section>`
    : '';

  return [
    '<section style="display:block;margin:18px 0;text-align:left;">',
    '<section style="display:block;width:100%;max-width:100%;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;box-sizing:border-box;margin:0;padding:0;white-space:nowrap;">',
    `<section style="display:table;table-layout:fixed;width:${panelCount * 100}%;min-width:${panelCount * 100}%;border-spacing:0;font-size:0;line-height:0;margin:0;padding:0;">`,
    rowChildren,
    '</section>',
    '</section>',
    hint,
    '</section>',
  ].join('');
}

function isFenceDelimiter(line) {
  return /^\s*(`{3,}|~{3,})/.test(String(line || ''));
}

function preprocessImageSwipeCallouts(markdown, context = {}) {
  const lines = String(markdown || '').split('\n');
  const output = [];
  let inFence = false;

  for (let i = 0; i < lines.length;) {
    if (isFenceDelimiter(lines[i])) {
      inFence = !inFence;
      output.push(lines[i]);
      i += 1;
      continue;
    }

    const callout = inFence ? null : parseCalloutOpen(lines[i]);
    if (!callout) {
      output.push(lines[i]);
      i += 1;
      continue;
    }

    const blockLines = [];
    i += 1;
    while (i < lines.length && /^\s{0,3}>/.test(lines[i])) {
      blockLines.push(stripQuotePrefix(lines[i]));
      i += 1;
    }

    const html = renderSwipeBlock({ ...callout, lines: blockLines }, context);
    if (html) {
      output.push(html);
    } else {
      output.push(lines[i]);
      output.push(...blockLines.map((line) => `> ${line}`));
    }
  }

  return output.join('\n');
}

module.exports = {
  IMAGE_SWIPE_DEFAULT_HINT,
  IMAGE_SWIPE_DEFAULT_WARNING,
  preprocessImageSwipeCallouts,
  parseMarkdownImage,
};

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { buildRenderOptions } = require('../src/config');
const { renderMarkdown } = require('../src/render');
const { srcToBlob, syncMarkdownFile, syncMarkdownFiles } = require('../src/sync');
const { resolveImageSrc } = require('../src/image-resolver');

test('defaults to classic theme, xs/small-in-Chinese font, and advanced options', () => {
  const options = buildRenderOptions({});
  assert.equal(options.theme, 'wechat');
  assert.equal(options.themeColor, 'blue');
  assert.equal(options.customColor, '#0366d6');
  assert.equal(options.fontSize, 1);
  assert.equal(options.macCodeBlock, true);
  assert.equal(options.codeLineNumber, true);
});

test('default xs/small-in-Chinese font renders body and table text as 14px with blue accents', async () => {
  const result = await renderMarkdown([
    '# 标题',
    '',
    '正文 **重点**',
    '',
    '| 项目 | 说明 |',
    '| --- | --- |',
    '| A | B |',
  ].join('\n'));

  assert.match(result.html, /font-size:\s*14px/);
  assert.match(result.html, /<th[^>]+font-size:\s*14px/);
  assert.match(result.html, /<td[^>]+font-size:\s*14px/);
  assert.match(result.html, /#0366d6/i);
});

test('resolves local markdown images to file urls for preview', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-agent-publisher-images-'));
  const imagePath = path.join(dir, 'image.png');
  const notePath = path.join(dir, 'post.md');
  fs.writeFileSync(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  fs.writeFileSync(notePath, '# 图片\n\n![图片](image.png)');

  const directSrc = resolveImageSrc('image.png', { sourcePath: notePath });
  assert.match(directSrc, /^file:\/\//);

  const result = await renderMarkdown(fs.readFileSync(notePath, 'utf8'), { sourcePath: notePath });
  assert.match(result.html, /src="file:\/\/\//);
  assert.match(result.html, /image\.png/);
});

test('resolves obsidian wiki image embeds to file urls for preview', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-agent-publisher-wiki-'));
  const imagePath = path.join(dir, 'wiki image.png');
  const notePath = path.join(dir, 'post.md');
  fs.writeFileSync(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const result = await renderMarkdown('# 图片\n\n![[wiki image.png|说明]]', { sourcePath: notePath });
  assert.match(result.html, /src="file:\/\/\//);
  assert.match(result.html, /wiki%20image\.png/);
});

test('renders image-sensitive callouts as warning-first swipe blocks', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-agent-publisher-sensitive-'));
  const imagePath = path.join(dir, '图片1.png');
  const notePath = path.join(dir, 'post.md');
  fs.writeFileSync(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const markdown = [
    '# 敏感图片',
    '',
    '> [!image-sensitive] 此类图片可能引发不适，向左滑动查看',
    '> ![[图片1.png]]',
  ].join('\n');
  const result = await renderMarkdown(markdown, { sourcePath: notePath });

  assert.match(result.html, /overflow-x:auto/);
  assert.match(result.html, /width:200%/);
  assert.match(result.html, /敏感图片/);
  assert.match(result.html, /此类图片可能引发不适/);
  assert.match(result.html, /file:\/\/\//);
  assert.doesNotMatch(result.html, /\[!image-sensitive]/);
});

test('normalizes requested themes and font sizes', () => {
  assert.equal(buildRenderOptions({ theme: '纸张长文', fontSize: '小' }).theme, 'paper');
  assert.equal(buildRenderOptions({ fontSize: '小' }).fontSize, 1);
  assert.equal(buildRenderOptions({ fontSize: 'xs' }).fontSize, 1);
  assert.equal(buildRenderOptions({ fontSize: '较小' }).fontSize, 2);
  assert.equal(buildRenderOptions({ fontSize: 'small' }).fontSize, 2);
  assert.equal(buildRenderOptions({ theme: 'grid', fontSize: 'xl' }).fontSize, 5);
  assert.equal(buildRenderOptions({ theme: '彩色强调', fontSize: '1' }).theme, 'colorful');
});

test('renders markdown to wechat html fragment', async () => {
  const result = await renderMarkdown('# 标题\n\n正文 **加粗**', {});
  assert.equal(result.title, '标题');
  assert.match(result.html, /<h1/);
  assert.match(result.html, /<strong/);
  assert.doesNotMatch(result.html, /<!doctype html>/i);
});

test('parses yaml frontmatter and uses title metadata', async () => {
  const result = await renderMarkdown([
    '---',
    'title: YAML 标题',
    'tags:',
    '  - 医学',
    'excerpt: |',
    '  多行摘要',
    '---',
    '',
    '# 正文标题',
  ].join('\n'));
  assert.equal(result.title, 'YAML 标题');
  assert.deepEqual(result.frontmatter.tags, ['医学']);
  assert.match(result.frontmatter.excerpt, /多行摘要/);
});

test('normalizes Chinese punctuation outside code', async () => {
  const result = await renderMarkdown('中文, English, 版本 v1.2.3, `代码,保留`');
  assert.match(result.html, /中文， English/);
  assert.match(result.html, /v1\.2\.3，/);
  assert.match(result.html, /代码,保留/);
});

test('renders task list markers as wechat-safe symbols', async () => {
  const result = await renderMarkdown('- [ ] 未完成\n- [x] 已完成');
  assert.match(result.html, /□ 未完成/);
  assert.match(result.html, /☑ 已完成/);
});

test('renders math formulas to MathJax SVG-compatible markup', async () => {
  const result = await renderMarkdown('公式 $x+1$。\n\n$$\na=b\n$$');
  assert.match(result.html, /data-owc-math/);
  assert.match(result.html, /<svg/);
  assert.doesNotMatch(result.html, /<style>/);
});

test('reports mermaid fences as diagnostics', async () => {
  const result = await renderMarkdown('```mermaid\ngraph TD; A-->B;\n```');
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0].code, 'mermaid-not-rendered');
});

test('reads local image blobs for sync upload preparation', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-agent-publisher-'));
  const imagePath = path.join(dir, 'cover.png');
  fs.writeFileSync(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const { blob, filename } = await srcToBlob('cover.png', dir);
  assert.equal(filename, 'cover.png');
  assert.equal(blob.type, 'image/png');
  assert.equal(blob.size, 4);
});

test('syncs markdown through mocked WeChat draft API', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-agent-publisher-sync-'));
  fs.writeFileSync(path.join(dir, 'cover.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  fs.writeFileSync(path.join(dir, 'body.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const markdownPath = path.join(dir, 'post.md');
  fs.writeFileSync(markdownPath, [
    '---',
    'title: 同步测试',
    'cover: cover.png',
    'excerpt: 摘要',
    '---',
    '',
    '# 同步测试',
    '',
    '![Body](body.png)',
  ].join('\n'));

  const calls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/cgi-bin/token')) {
      return { json: async () => ({ access_token: 'token', expires_in: 7200 }) };
    }
    if (String(url).includes('/material/add_material')) {
      return { json: async () => ({ media_id: 'cover-media-id' }) };
    }
    if (String(url).includes('/media/uploadimg')) {
      return { json: async () => ({ url: 'https://mmbiz.qpic.cn/body.png' }) };
    }
    if (String(url).includes('/draft/add')) {
      return { json: async () => ({ media_id: 'draft-media-id' }) };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  try {
    const result = await syncMarkdownFile(markdownPath, {
      account: { appId: 'app-id', appSecret: 'app-secret' },
    });
    assert.equal(result.mediaId, 'draft-media-id');
    assert.equal(result.article.thumb_media_id, 'cover-media-id');
    assert.equal(result.article.title, '同步测试');
    assert.match(result.article.content, /https:\/\/mmbiz\.qpic\.cn\/body\.png/);
    assert.equal(calls.some((call) => call.url.includes('/draft/add')), true);
  } finally {
    global.fetch = originalFetch;
  }
});

test('syncs multiple markdown files into one multi-article WeChat draft', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-agent-publisher-multi-sync-'));
  fs.writeFileSync(path.join(dir, 'cover1.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  fs.writeFileSync(path.join(dir, 'cover2.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const firstPath = path.join(dir, 'first.md');
  const secondPath = path.join(dir, 'second.md');
  fs.writeFileSync(firstPath, [
    '---',
    'title: 头条',
    'cover: cover1.png',
    'summary: 头条摘要',
    '---',
    '',
    '# 头条',
  ].join('\n'));
  fs.writeFileSync(secondPath, [
    '---',
    'title: 第二条',
    'cover: cover2.png',
    'summary: 第二条摘要',
    '---',
    '',
    '# 第二条',
  ].join('\n'));

  let draftBody = null;
  let coverUploadCount = 0;
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    if (String(url).includes('/cgi-bin/token')) {
      return { json: async () => ({ access_token: 'token', expires_in: 7200 }) };
    }
    if (String(url).includes('/material/add_material')) {
      coverUploadCount += 1;
      return { json: async () => ({ media_id: `cover-media-id-${coverUploadCount}` }) };
    }
    if (String(url).includes('/draft/add')) {
      draftBody = JSON.parse(options.body);
      return { json: async () => ({ media_id: 'draft-media-id' }) };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  try {
    const result = await syncMarkdownFiles([firstPath, secondPath], {
      account: { appId: 'app-id', appSecret: 'app-secret' },
    });
    assert.equal(result.mediaId, 'draft-media-id');
    assert.equal(result.articles.length, 2);
    assert.deepEqual(result.articles.map((article) => article.title), ['头条', '第二条']);
    assert.equal(draftBody.articles.length, 2);
    assert.equal(draftBody.articles[0].thumb_media_id, 'cover-media-id-1');
    assert.equal(draftBody.articles[1].thumb_media_id, 'cover-media-id-2');
  } finally {
    global.fetch = originalFetch;
  }
});

test('sync maps Wenyan-style frontmatter fields to WeChat article payload', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-agent-publisher-frontmatter-sync-'));
  fs.writeFileSync(path.join(dir, 'cover.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const markdownPath = path.join(dir, 'post.md');
  fs.writeFileSync(markdownPath, [
    '---',
    'title: Frontmatter 标题',
    'cover: cover.png',
    'author: 张三',
    'summary: 公众号摘要',
    'source_url: https://example.com/original',
    'need_open_comment: true',
    'only_fans_can_comment: false',
    '---',
    '',
    '# 正文标题',
  ].join('\n'));

  let draftBody = null;
  const originalFetch = global.fetch;
  global.fetch = async (url, options = {}) => {
    if (String(url).includes('/cgi-bin/token')) {
      return { json: async () => ({ access_token: 'token', expires_in: 7200 }) };
    }
    if (String(url).includes('/material/add_material')) {
      return { json: async () => ({ media_id: 'cover-media-id' }) };
    }
    if (String(url).includes('/draft/add')) {
      draftBody = JSON.parse(options.body);
      return { json: async () => ({ media_id: 'draft-media-id' }) };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  try {
    const result = await syncMarkdownFile(markdownPath, {
      account: { appId: 'app-id', appSecret: 'app-secret' },
    });
    assert.equal(result.article.title, 'Frontmatter 标题');
    assert.equal(result.article.author, '张三');
    assert.equal(result.article.digest, '公众号摘要');
    assert.equal(result.article.content_source_url, 'https://example.com/original');
    assert.equal(result.article.need_open_comment, 1);
    assert.equal(result.article.only_fans_can_comment, 0);
    assert.equal(draftBody.articles[0].digest, '公众号摘要');
    assert.equal(draftBody.articles[0].content_source_url, 'https://example.com/original');
  } finally {
    global.fetch = originalFetch;
  }
});

test('sync rejects unsupported image-message frontmatter explicitly', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-agent-publisher-image-message-'));
  fs.writeFileSync(path.join(dir, 'cover.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const markdownPath = path.join(dir, 'post.md');
  fs.writeFileSync(markdownPath, [
    '---',
    'title: 小绿书',
    'cover: cover.png',
    'type: image',
    'image_list:',
    '  - cover.png',
    '---',
    '',
    '# 小绿书',
  ].join('\n'));

  await assert.rejects(
    () => syncMarkdownFile(markdownPath, {
      account: { appId: 'app-id', appSecret: 'app-secret' },
    }),
    /图片消息/
  );
});

test('sync converts SVG formulas to uploaded image URLs', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-agent-publisher-math-sync-'));
  fs.writeFileSync(path.join(dir, 'cover.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const markdownPath = path.join(dir, 'post.md');
  fs.writeFileSync(markdownPath, [
    '---',
    'title: 公式同步',
    'cover: cover.png',
    '---',
    '',
    '# 公式同步',
    '',
    '公式 $x+1$。',
  ].join('\n'));

  let imageUploadCount = 0;
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes('/cgi-bin/token')) {
      return { json: async () => ({ access_token: 'token', expires_in: 7200 }) };
    }
    if (String(url).includes('/material/add_material')) {
      return { json: async () => ({ media_id: 'cover-media-id' }) };
    }
    if (String(url).includes('/media/uploadimg')) {
      imageUploadCount += 1;
      return { json: async () => ({ url: `https://mmbiz.qpic.cn/math-${imageUploadCount}.png` }) };
    }
    if (String(url).includes('/draft/add')) {
      return { json: async () => ({ media_id: 'draft-media-id' }) };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  try {
    const result = await syncMarkdownFile(markdownPath, {
      account: { appId: 'app-id', appSecret: 'app-secret' },
    });
    assert.equal(result.mediaId, 'draft-media-id');
    assert.match(result.article.content, /https:\/\/mmbiz\.qpic\.cn\/math-1\.png/);
    assert.doesNotMatch(result.article.content, /<svg/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('sync keeps draft creation going when an article image upload fails', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-agent-publisher-failed-image-'));
  fs.writeFileSync(path.join(dir, 'cover.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  fs.writeFileSync(path.join(dir, 'body.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const markdownPath = path.join(dir, 'post.md');
  fs.writeFileSync(markdownPath, [
    '---',
    'title: 图片失败',
    'cover: cover.png',
    '---',
    '',
    '# 图片失败',
    '',
    '![Body](body.png)',
  ].join('\n'));

  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes('/cgi-bin/token')) {
      return { json: async () => ({ access_token: 'token', expires_in: 7200 }) };
    }
    if (String(url).includes('/material/add_material')) {
      return { json: async () => ({ media_id: 'cover-media-id' }) };
    }
    if (String(url).includes('/media/uploadimg')) {
      return { json: async () => ({ errmsg: 'upload failed', errcode: 400 }) };
    }
    if (String(url).includes('/draft/add')) {
      return { json: async () => ({ media_id: 'draft-media-id' }) };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  try {
    const result = await syncMarkdownFile(markdownPath, {
      account: { appId: 'app-id', appSecret: 'app-secret' },
    });
    assert.equal(result.mediaId, 'draft-media-id');
    assert.equal(result.imageUploadFailures.length, 1);
    assert.match(result.article.content, /图片上传失败/);
  } finally {
    global.fetch = originalFetch;
  }
});

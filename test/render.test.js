const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  buildRenderOptions,
  WECHAT_CONVERTER_DEFAULT_CUSTOM_COLOR,
  WECHAT_CONVERTER_DEFAULT_HEADING_COLORS,
} = require('../src/config');
const { renderMarkdown } = require('../src/render');
const { srcToBlob, syncMarkdownFile, syncMarkdownFiles } = require('../src/sync');
const { resolveImageSrc } = require('../src/image-resolver');

function hexToRgb(hex) {
  const normalized = hex.replace('#', '');
  return `rgb(${Number.parseInt(normalized.slice(0, 2), 16)}, ${Number.parseInt(normalized.slice(2, 4), 16)}, ${Number.parseInt(normalized.slice(4, 6), 16)})`;
}

test('defaults to classic theme, xs/small-in-Chinese font, and advanced options', () => {
  const options = buildRenderOptions({});
  assert.equal(options.theme, 'wechat');
  assert.equal(options.themeColor, 'blue');
  assert.equal(options.customColor, '#0366d6');
  assert.equal(options.coloredHeader, true);
  assert.deepEqual(options.headingColors, WECHAT_CONVERTER_DEFAULT_HEADING_COLORS);
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

test('normalizes section heading styles with Chinese and English aliases', () => {
  assert.equal(buildRenderOptions({ headingStyle: '禅意' }).headingStyle, 'zen');
  assert.equal(buildRenderOptions({ headingStyle: '序号' }).headingStyle, 'serial-number');
  assert.equal(buildRenderOptions({ headingStyle: '徽标' }).headingStyle, 'badge');
  assert.equal(buildRenderOptions({ headingStyle: '跟随主题' }).headingStyle, 'default');
  assert.equal(buildRenderOptions({ headingStyle: 'zen' }).headingStyle, 'zen');
  assert.equal(buildRenderOptions({ headingStyle: 'double-line' }).headingStyle, 'double-line');
  assert.equal(buildRenderOptions({ headingStyle: '不存在' }).headingStyle, 'default');
  assert.equal(buildRenderOptions({}).headingStyle, 'default');
});

test('decorates section headings with the serial-number style', async () => {
  const result = await renderMarkdown('# 总标题\n\n## 第一节\n\n正文\n\n## 第二节\n\n正文', {
    headingStyle: 'serial-number',
  });
  assert.match(result.html, /font-size:\s*34px[^>]*>01<\/span>/);
  assert.match(result.html, /font-size:\s*34px[^>]*>02<\/span>/);
  assert.match(result.html, /color:\s*#1f2937[^>]*>第一节/);
  // h1 stays untouched by section decoration
  assert.doesNotMatch(result.html, /<h1[^>]*font-size:\s*34px/);
});

test('decorates section headings with the badge style', async () => {
  const result = await renderMarkdown('## 徽标分节', { headingStyle: 'badge' });
  assert.match(result.html, /border-radius:\s*10px[^>]*>01<\/span>/);
  assert.match(result.html, /background-image:\s*linear-gradient\(to right, #0366d6, transparent\)/);
});

test('decorates section headings with the zen style', async () => {
  const result = await renderMarkdown('## 禅意分节\n\n正文\n\n## 第二节\n\n正文', { headingStyle: '禅意' });
  assert.match(result.html, /letter-spacing:\s*3px[^>]*>PART 01<\/span>/);
  assert.match(result.html, /letter-spacing:\s*3px[^>]*>PART 02<\/span>/);
  assert.match(result.html, /Songti SC[^>]*>禅意分节/);
});

test('badge section title text follows the configured h2 heading color', async () => {
  const result = await renderMarkdown('## 徽标分节', {
    headingStyle: 'badge',
    headingColors: Array(6).fill('#004795'),
  });
  // Badge pill and divider keep the primary theme color...
  assert.match(result.html, /background-image:\s*linear-gradient\(to right, #0366d6, transparent\)/);
  assert.match(result.html, /background-color:\s*#0366d6[^>]*>01<\/span>/);
  // ...while the title text uses the deep heading color, not #1f2937.
  assert.match(result.html, /color:\s*#004795[^>]*>徽标分节/);
  assert.doesNotMatch(result.html, /#1f2937/);
});

test('keeps theme h2 styling for the default section heading style', async () => {
  const result = await renderMarkdown('## 主题分节', { headingStyle: 'default' });
  assert.match(result.html, /<h2[^>]*background-image:\s*linear-gradient/);
  assert.doesNotMatch(result.html, /PART 01/);
});

test('honors headingStyle frontmatter with CLI-flag precedence', async () => {
  const frontmatter = '---\ntitle: 文档\nheadingStyle: zen\n---\n\n## 分节一\n';
  const fromFrontmatter = await renderMarkdown(frontmatter);
  assert.equal(fromFrontmatter.options.headingStyle, 'zen');
  assert.match(fromFrontmatter.html, /PART 01/);

  // An explicit CLI flag still wins over the article frontmatter.
  const fromFlag = await renderMarkdown(frontmatter, {
    headingStyle: 'badge',
    headingStyleFromCli: true,
  });
  assert.equal(fromFlag.options.headingStyle, 'badge');
  assert.match(fromFlag.html, /border-radius:\s*10px/);
});

test('styles table trailing notes and quote-end attributions as references', async () => {
  const md = [
    '| A | B |',
    '|---|---|',
    '| 1 | 2 |',
    '',
    '数据来自 Courson R, et al. J Athl Train. 2020.',
    '',
    '普通正文段落不受影响。',
    '',
    '> BOX 内容第一段。',
    '>',
    '> 改编自 Mills BM, Conrick KM. Clin J Sport Med. 2020.',
  ].join('\n');
  const result = await renderMarkdown(md);
  const note = /数据来自[^<]*/.exec(result.html);
  const attribution = /改编自[^<]*/.exec(result.html);
  assert.ok(note, 'table note present');
  assert.ok(attribution, 'quote attribution present');
  // both carry the small gray reference style
  const noteNode = /<p[^>]*font-size:12px;color:#8a8a8a;?[^>]*>[^<]*数据来自/.test(result.html);
  const attrNode = /<p[^>]*font-size:12px;color:#8a8a8a;?[^>]*>[^<]*改编自/.test(result.html);
  assert.ok(noteNode, 'table note styled 12px #8a8a8a');
  assert.ok(attrNode, 'quote attribution styled 12px #8a8a8a');
  assert.doesNotMatch(result.html, /12px;color:#8a8a8a[^>]*>[^<]*普通正文/);
  assert.doesNotMatch(result.html, /12px;color:#8a8a8a[^>]*>[^<]*BOX 内容第一段/);
});

test('styles sup-marker footnotes at quote end as references', async () => {
  const md = [
    '> - 禁忌证一',
    '> - 禁忌证二',
    '>',
    '> <sup>a</sup>所列情况常可采用调整后的脊柱防护措施处理。',
    '>',
    '> <sup>a</sup>美国外科医师学会创伤委员会联合立场声明。资料引自 Fischer PE, et al. Prehosp Emerg Care. 2018;22(6):659-661.',
  ].join('|NL|');
  const result = await renderMarkdown(md.split('|NL|').join("\n"));
  for (const text of ['所列情况常可采用', '美国外科医师学会']) {
    const re = new RegExp('font-size:12px;color:#8a8a8a;?[^>]*>(?:<sup[^>]*>[^<]*</sup>)?[^<]*' + text.slice(0, 4));
    assert.match(result.html, re, text + ' should be styled');
  }
  assert.doesNotMatch(result.html, /12px;color:#8a8a8a[^>]*>[^<]*禁忌证一/);
});

test('swipe gallery captions keep a readable line-height', async () => {
  const md = '> [!image-swipe]'+String.fromCharCode(10)+'> ![图注文字说明](images/a.jpg)';
  const result = await renderMarkdown(md);
  const cap = /<figcaption[^>]*>图注文字说明<\/figcaption>/.exec(result.html);
  assert.ok(cap, 'figcaption present');
  assert.match(cap[0], /line-height:\s*1\.5/, 'caption must set line-height (parent table row sets line-height:0)');
});

test('does not style ordinary paragraphs that merely end with a citation sup', async () => {
  const md = [
    '| A | B |',
    '|---|---|',
    '| 1 | 2 |',
    '',
    '病史应包括确切机制和持续时间等总体健康状况。<sup>27</sup>',
    '',
    '> - 条目一',
    '>',
    '> 普通段落结尾带引用。<sup>95</sup>',
  ].join("\n");
  const result = await renderMarkdown(md);
  assert.doesNotMatch(result.html, /12px;color:#8a8a8a[^>]*>[^<]*病史应包括/);
  assert.doesNotMatch(result.html, /12px;color:#8a8a8a[^>]*>[^<]*普通段落/);
});

test('renders markdown to wechat html fragment', async () => {
  const result = await renderMarkdown('# 标题\n\n正文 **加粗**', {});
  assert.equal(result.title, '标题');
  assert.match(result.html, /<h1/);
  assert.match(result.html, /<strong/);
  assert.doesNotMatch(result.html, /<!doctype html>/i);
});

test('renders headings with a descending six-level blue hierarchy', async () => {
  const result = await renderMarkdown([
    '# 一级标题',
    '## 二级标题',
    '### 三级标题',
    '#### 四级标题',
    '##### 五级标题',
    '###### 六级标题',
  ].join('\n'));

  for (let level = 1; level <= 6; level += 1) {
    const color = WECHAT_CONVERTER_DEFAULT_HEADING_COLORS[level - 1];
    assert.match(result.html, new RegExp(`<h${level}[^>]*color:\\s*(?:${color}|${hexToRgb(color).replace(/[()]/g, '\\$&').replace(/, /g, ',\\s*')})[^>]*>`));
  }
  // Every heading level intentionally shares one publishing blue: per-level
  // tints are not accepted by WeChat draft validation.
  assert.equal(new Set(WECHAT_CONVERTER_DEFAULT_HEADING_COLORS).size, 1);
  assert.equal(WECHAT_CONVERTER_DEFAULT_HEADING_COLORS[0], WECHAT_CONVERTER_DEFAULT_CUSTOM_COLOR);
});

test('uses supplied headingColors for matching heading levels', async () => {
  const result = await renderMarkdown('# 一级标题\n\n## 二级标题', {
    headingColors: ['#001f3f', '#0074d9'],
  });

  assert.match(result.html, /<h1[^>]*color:\s*(?:#001f3f|rgb\(0,\s*31,\s*63\))[^>]*>/);
  assert.match(result.html, /<h2[^>]*color:\s*(?:#0074d9|rgb\(0,\s*116,\s*217\))[^>]*>/);
});

test('styles References entries without shrinking the References heading', async () => {
  const result = await renderMarkdown([
    '# 溺水',
    '',
    '正文',
    '',
    '## References',
    '',
    '1. First reference.  ',
    '2. Second reference.',
  ].join('\n'));

  assert.match(result.html, /<h2[^>]*>References<\/h2>/);
  assert.doesNotMatch(result.html, /<h2[^>]*font-size:\s*12px[^>]*>References<\/h2>/);
  assert.match(result.html, /<ol[^>]*font-size:\s*12px[^>]*color:\s*#8a8a8a/);
  assert.match(result.html, /<li[^>]*font-size:\s*12px[^>]*color:\s*#8a8a8a[^>]*>First reference/);
  assert.match(result.html, /<li[^>]*font-size:\s*12px[^>]*color:\s*#8a8a8a[^>]*>Second reference/);
});

test('preserves bold emphasis inside blockquotes with an explicit inline font weight', async () => {
  const result = await renderMarkdown('> **导读**：引用中的 **重点** 必须加粗。');

  assert.match(result.html, /<blockquote[\s\S]*?<strong[^>]*font-weight:\s*700\s*!important[^>]*>导读<\/strong>/);
  assert.match(result.html, /<blockquote[\s\S]*?<strong[^>]*font-weight:\s*700\s*!important[^>]*>重点<\/strong>/);
});

test('preserves bold labels with a trailing colon outside blockquotes', async () => {
  const result = await renderMarkdown('- **优化美容效果：** 选择区域麻醉以避免组织变形。');

  assert.match(result.html, /<strong[^>]*font-weight:\s*700\s*!important[^>]*>优化美容效果：<\/strong>/);
  assert.doesNotMatch(result.html, /\*\*优化美容效果：\*\*/);
});

test('preserves bold labels in multi-paragraph review-box blockquotes', async () => {
  const result = await renderMarkdown([
    '> **适应证：**镇痛；抗焦虑/镇静。',
    '>',
    '> **禁忌证：**鼻腔解剖异常；鼻部创伤。',
    '>',
    '> **并发症：**具体药物的不良反应；局部鼻刺激。',
  ].join('\n'));

  for (const label of ['适应证：', '禁忌证：', '并发症：']) {
    assert.match(result.html, new RegExp(`<strong[^>]*font-weight:\\s*700\\s*!important[^>]*>${label}<\\/strong>`));
  }
  assert.doesNotMatch(result.html, /\*\*(?:适应证：|禁忌证：|并发症：)\*\*/);
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
  // wechat-converter 2.12.x renders checkbox markers as colored ballot-box
  // spans (☐ unchecked, ☑ struck-through when done).
  assert.match(result.html, /<span[^>]*>☐<\/span>未完成/);
  assert.match(result.html, /<span[^>]*>☑<\/span><span[^>]*text-decoration:\s*line-through[^>]*>已完成<\/span>/);
});

test('renders math formulas to MathJax SVG-compatible markup', async () => {
  const result = await renderMarkdown('公式 $x+1$。\n\n$$\na=b\n$$');
  assert.match(result.html, /data-owc-math/);
  assert.match(result.html, /<svg/);
  assert.doesNotMatch(result.html, /<style>/);
});

test('renders mermaid fences to SVG diagrams', async () => {
  const result = await renderMarkdown('```mermaid\ngraph TD; A[急诊筛查]-->B[HIV检测];\n```');
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0].code, 'mermaid-rendered');
  assert.match(result.html, /data-wechat-agent-mermaid="true"/);
  assert.match(result.html, /<svg/);
  assert.doesNotMatch(result.html, /<pre/);
  assert.doesNotMatch(result.html, /```mermaid/);
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

test('sync converts Mermaid SVG diagrams to uploaded image URLs', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wechat-agent-publisher-mermaid-sync-'));
  fs.writeFileSync(path.join(dir, 'cover.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const markdownPath = path.join(dir, 'post.md');
  fs.writeFileSync(markdownPath, [
    '---',
    'title: Mermaid 同步',
    'cover: cover.png',
    '---',
    '',
    '# Mermaid 同步',
    '',
    '```mermaid',
    'graph TD; A[急诊筛查]-->B[HIV检测];',
    '```',
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
      return { json: async () => ({ url: `https://mmbiz.qpic.cn/mermaid-${imageUploadCount}.png` }) };
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
    assert.equal(result.diagnostics[0].code, 'mermaid-rendered');
    assert.match(result.article.content, /https:\/\/mmbiz\.qpic\.cn\/mermaid-1\.png/);
    assert.match(result.article.content, /Mermaid 图表/);
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

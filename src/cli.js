#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { renderMarkdownFile } = require('./render');
const { loadProjectConfig, readJsonFile, buildRenderOptions } = require('./config');
const { syncMarkdownFile } = require('./sync');

function printHelp() {
  console.log(`Usage:
  wechat-agent-publisher render <file.md> [options]
  wechat-agent-publisher sync <file.md> [options]

Render options:
  --theme <name>       Theme: minimal|classic|elegant|paper|grid|typo|media|colorful
  --font-size <size>   Font size: xs|small|normal|large|xl or 1..5. Default: small
  --output <file>      Output HTML file
  --full               Write a complete HTML document instead of a fragment
  --vault-root <dir>   Optional Obsidian vault root for resolving wiki/local images
  --config <file>      JSON config file
  --no-advanced        Disable advanced defaults such as Mac code block and line numbers
  --no-normalize-chinese-punctuation
                       Disable rendered Chinese punctuation normalization

Sync options:
  --app-id <id>        WeChat Official Account AppID, or WECHAT_APP_ID
  --app-secret <sec>   WeChat AppSecret, or WECHAT_APP_SECRET
  --cover <path/url>   Cover image. Defaults to frontmatter cover or first article image
  --digest <text>      Draft digest. Defaults to frontmatter digest/excerpt
  --author <name>      Article author
  --source-url <url>   Original article URL. Maps to WeChat content_source_url
  --proxy-url <url>    Optional HTTPS proxy URL
  --draft-media-id <id> Update an existing draft media_id instead of creating a new draft
  --draft-index <n>    Article index for draft update. Default: 0

Notes:
  Math renders as MathJax SVG for preview and is rasterized/uploaded during sync.
  Mermaid fences are reported as diagnostics; render diagrams to images before final sync.
`);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      args._.push(arg);
      continue;
    }
    const key = arg.slice(2);
    if (key.startsWith('no-')) {
      args[toCamel(key.slice(3))] = false;
      continue;
    }
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[toCamel(key)] = true;
    } else {
      args[toCamel(key)] = next;
      i += 1;
    }
  }
  return args;
}

function toCamel(value) {
  return String(value || '').replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function loadOptions(args, inputPath) {
  const config = args.config
    ? readJsonFile(args.config)
    : loadProjectConfig(inputPath ? path.dirname(path.resolve(inputPath)) : process.cwd());
  return {
    ...config,
    ...args,
    account: {
      ...(config.account || {}),
      appId: args.appId || config.appId || config.account?.appId,
      appSecret: args.appSecret || config.appSecret || config.account?.appSecret,
      author: args.author || config.author || config.account?.author,
      contentSourceUrl: args.contentSourceUrl || config.contentSourceUrl || config.account?.contentSourceUrl,
      openComment: args.openComment !== undefined ? args.openComment : config.account?.openComment,
      onlyFansCanComment: args.onlyFansCanComment !== undefined ? args.onlyFansCanComment : config.account?.onlyFansCanComment,
    },
    advanced: args.advanced,
  };
}

async function run() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }

  const args = parseArgs(rest);
  const inputPath = args._[0];
  if (!inputPath) {
    printHelp();
    process.exitCode = 1;
    return;
  }

  const options = loadOptions(args, inputPath);
  if (command === 'render') {
    const renderOptions = buildRenderOptions(options);
    const result = await renderMarkdownFile(inputPath, {
      ...renderOptions,
      full: !!args.full,
    });
    const output = args.output || options.output;
    if (output) {
      fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
      fs.writeFileSync(output, result.html, 'utf8');
      console.log(JSON.stringify({ ok: true, output: path.resolve(output), title: result.title, theme: result.options.theme, fontSize: result.options.fontSize, diagnostics: result.diagnostics }, null, 2));
    } else {
      if (result.diagnostics?.length) {
        console.error(JSON.stringify({ diagnostics: result.diagnostics }, null, 2));
      }
      process.stdout.write(result.html);
    }
    return;
  }

  if (command === 'sync') {
    const result = await syncMarkdownFile(inputPath, {
      ...buildRenderOptions(options),
      ...options,
      onImageProgress: (current, total) => {
        console.error(`[images] ${current}/${total}`);
      },
    });
    console.log(JSON.stringify({
      ok: true,
      mediaId: result.mediaId,
      isUpdate: result.isUpdate,
      title: result.article.title,
      diagnostics: result.diagnostics,
      imageUploadFailures: result.imageUploadFailures,
      svgUploadFailures: result.svgUploadFailures,
    }, null, 2));
    return;
  }

  printHelp();
  process.exitCode = 1;
}

run().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

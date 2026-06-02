---
name: wechat-agent-publisher
description: Render Markdown files into WeChat Official Account compatible HTML and optionally sync them to the WeChat draft box using the local wechat-agent-publisher CLI. Use when an agent such as Codex or OpenClaw is asked to convert Markdown to WeChat-ready HTML, apply WeChat article themes, choose article font size, upload article images, create or update WeChat Official Account drafts, or publish Markdown through skills.
---

# WeChat Agent Publisher

Use this skill to turn a Markdown file into WeChat-safe HTML or send it to a WeChat Official Account draft. Do not reimplement the renderer; call the project CLI.

## Quick Start

From the project root:

```bash
npm install
node src/cli.js render path/to/article.md --output out/article.html
```

Default rendering choices:

- Theme: `classic` / `经典`
- Font size: `small` / `小`
- Advanced options: enabled

## Render Workflow

1. Locate the Markdown file.
2. Render a browser preview first unless the user explicitly asks for a fragment: `node src/cli.js render <file.md> --full --output out/<name>.preview.html`.
3. If the user asks for a theme, pass `--theme <name>`.
4. If the user asks for a font size, pass `--font-size <size>`.
5. Read the JSON result and report the output path, selected theme/font size, and any diagnostics.

Example:

```bash
node src/cli.js render notes/post.md --theme classic --font-size small --output out/post.html
```

Use `--full` only when the user wants a standalone browser HTML document. For WeChat paste/sync, the fragment output is preferred.

For Obsidian wiki embeds or vault-wide image lookup, add `--vault-root <vault-dir>`.

The renderer supports Obsidian image swipe callouts:

```markdown
> [!image-sensitive] 此类图片可能引发不适，向左滑动查看
> ![[图片1.png]]
```

`[!image-swipe]` becomes a horizontal gallery. `[!image-sensitive]` becomes a warning-first horizontal gallery.

Math is supported: inline/block LaTeX renders as MathJax SVG for preview. During sync, SVG formulas are rasterized to PNG and uploaded to WeChat.

Mermaid fenced code is detected as a diagnostic. Do not claim Mermaid was rendered by the CLI; render diagrams to image files first when exact diagram output is required.

## Sync Workflow

Use `sync` only when the user explicitly wants to create or update a WeChat Official Account draft and credentials are available through arguments, config, or environment variables.

```bash
$env:WECHAT_APP_ID="..."
$env:WECHAT_APP_SECRET="..."
node src/cli.js sync path/to/article.md --cover path/to/cover.png
```

The command accepts credentials from:

- `WECHAT_APP_ID` and `WECHAT_APP_SECRET`
- `--app-id` and `--app-secret`
- `wechat-agent-publisher.config.json`

Before syncing, remind the user that the current machine/server IP must be in the WeChat Official Account IP allowlist.

To update an existing draft:

```bash
node src/cli.js sync path/to/article.md --draft-media-id MEDIA_ID --draft-index 0
```

Sync behavior:

- Cover source priority: `--cover`, frontmatter `cover`, first article image.
- Frontmatter `author`, `source_url`, `need_open_comment`, and `only_fans_can_comment` are mapped into the WeChat article payload.
- Article images are uploaded through WeChat's article image API.
- Formula SVG is rasterized to PNG and uploaded.
- Failed article image uploads become placeholders instead of aborting draft creation.
- `type: image` and `image_list` image-message publishing are not implemented yet; report that clearly instead of attempting a normal article sync.

## Themes

Read `references/themes.md` when choosing or explaining themes. Valid theme values:

- `minimal` / `简约`
- `classic` / `经典`
- `elegant` / `优雅`
- `paper` / `纸张长文`
- `grid` / `网格文档`
- `typo` / `Typo`
- `media` / `清爽媒体`
- `colorful` / `彩色强调`

## Font Sizes

Valid font sizes are `xs`, `small`, `normal`, `large`, `xl`, or numeric `1..5`. Use `small` unless the user asks otherwise.

## Config

If repeated use is expected, create `wechat-agent-publisher.config.json` based on `wechat-agent-publisher.config.example.json`. Do not commit real AppSecret values.

Preferred config keys:

```json
{
  "theme": "classic",
  "fontSize": "small",
  "themeColor": "blue",
  "customColor": "#0366d6",
  "advanced": true,
  "vaultRoot": "",
  "account": {
    "appId": "",
    "appSecret": "",
    "author": "",
    "sourceUrl": ""
  }
}
```

## Safety

- Never invent WeChat credentials.
- Do not sync to WeChat unless the user requested sync or draft creation/update.
- Prefer local render validation before syncing.
- Preview image paths are local `file://` URLs; sync uploads images to WeChat APIs, not to a third-party image host by default.
- Keep generated HTML files outside source folders, usually under `out/`.

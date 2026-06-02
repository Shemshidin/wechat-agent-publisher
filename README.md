# WeChat Agent Publisher

Agent-friendly CLI and skill for turning Markdown into WeChat Official Account HTML and syncing it to the draft box.

## Install

```bash
npm install
```

## Render HTML

```bash
node src/cli.js render examples/article.md --output out/article.html
```

Defaults:

- Theme: `classic` / `经典`
- Font size: `small` / `小`
- Theme color: `blue` / `#0366d6`, matching the source Obsidian WeChat Converter defaults
- Advanced options: enabled

Available themes:

- `minimal` / `简约`
- `classic` / `经典`
- `elegant` / `优雅`
- `paper` / `纸张长文`
- `grid` / `网格文档`
- `typo` / `Typo`
- `media` / `清爽媒体`
- `colorful` / `彩色强调`

Font sizes: `xs`, `small`, `normal`, `large`, `xl` or `1..5`.

Recommended agent workflow:

1. Render a browser preview first:

```bash
node src/cli.js render article.md --full --output out/article.preview.html
```

2. Inspect the JSON result and any diagnostics.
3. Only sync after the user explicitly asks for a WeChat draft.
4. Keep generated files under `out/`.

For a WeChat editor fragment instead of a browser preview, omit `--full`.

Common render options:

```bash
node src/cli.js render article.md --theme classic --font-size small --output out/article.html
node src/cli.js render article.md --theme paper --font-size normal --full --output out/article.preview.html
node src/cli.js render article.md --vault-root D:\Documents\Obsidian\ShemNotes --output out/article.html
node src/cli.js render article.md --no-normalize-chinese-punctuation --output out/article.html
```

## Sync To WeChat Draft

```bash
$env:WECHAT_APP_ID="..."
$env:WECHAT_APP_SECRET="..."
node src/cli.js sync article.md --cover cover.png
```

The sync command follows this frontmatter convention for normal WeChat article drafts:

```md
---
title: 在本地跑一个大语言模型(2) - 给模型提供外部知识库
cover: /Users/xxx/image.jpg
author: xxx
source_url: https://example.com/original
need_open_comment: true
only_fans_can_comment: false
---
```

Field rules:

| Field | Required | Notes |
| --- | --- | --- |
| `title` | Recommended | Falls back to the first `#` heading or filename. |
| `cover` | Optional | Local absolute path, relative path, `file://`, data URL, or network URL. Falls back to the first article image. |
| `author` | Optional | Used as WeChat article author unless overridden by CLI/config. |
| `source_url` | Optional | Mapped to WeChat `content_source_url`. |
| `need_open_comment` | Optional | Boolean-like value, maps to WeChat `need_open_comment`. |
| `only_fans_can_comment` | Optional | Boolean-like value, maps to WeChat `only_fans_can_comment`. |
| `type` / `image_list` | Not supported yet | Image-message / 小绿书 publishing is rejected with a clear error instead of being sent as a normal article. |

The sync command uploads the cover, uploads article images, cleans the HTML for the WeChat draft API, then creates a draft. To update an existing draft:

```bash
node src/cli.js sync article.md --draft-media-id MEDIA_ID --draft-index 0
```

Sync rules:

- Provide credentials through `WECHAT_APP_ID` / `WECHAT_APP_SECRET`, CLI flags, or `wechat-agent-publisher.config.json`.
- Ensure the current machine/server IP is added to the WeChat Official Account IP allowlist before sync.
- Never store real AppSecret values in committed files.
- `cover` can come from `--cover`, frontmatter `cover`, or the first article image.
- Article images support local absolute paths, relative paths, `file://`, data URLs, and network URLs.
- Failed article image uploads become visible placeholders so draft creation can continue.

Image handling matches the source converter model:

- Preview/render resolves local Markdown images and Obsidian wiki embeds to local `file://` URLs so browser previews can display them.
- Draft sync does not use an external image host by default. It uploads the cover through WeChat material upload and article images through WeChat's article image upload API, then replaces image `src` values with WeChat URLs.
- Use `--vault-root <dir>` when wiki embeds need vault-wide lookup beyond the Markdown file's folder.

Obsidian image swipe callouts are supported:

```markdown
> [!image-sensitive] 此类图片可能引发不适，向左滑动查看
> ![[图片1.png]]
```

`[!image-swipe]` renders as a horizontal image gallery, and `[!image-sensitive]` renders a warning panel before the gallery.

Math support:

- Inline and block LaTeX render to MathJax SVG for preview.
- During `sync`, SVG formulas are rasterized to PNG with `sharp`, uploaded to WeChat, and replaced by WeChat image URLs.

Mermaid support:

- Mermaid fenced code blocks are detected and reported in CLI diagnostics.
- The CLI does not silently fake Mermaid diagrams. Render Mermaid diagrams to image files first, then embed those images for final WeChat sync.

## Agent Skill

Use the bundled skill at:

```text
skills/wechat-agent-publisher/SKILL.md
```

Agents such as Codex or OpenClaw can load that skill and call the CLI instead of hand-writing conversion logic.

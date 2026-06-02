# AGENTS.md

This project provides an agent-facing Markdown to WeChat publishing CLI plus a bundled skill.

When a user asks to render Markdown to WeChat HTML or sync a Markdown article to a WeChat Official Account draft, use:

```text
skills/wechat-agent-publisher/SKILL.md
```

Do not hand-edit generated HTML when the CLI can render it. Prefer preview first:

```bash
node src/cli.js render <file.md> --full --output out/<name>.preview.html
```

Only sync after the user explicitly asks for a WeChat draft:

```bash
node src/cli.js sync <file.md> --cover <cover.png>
```

Before sync, confirm credentials are available through `WECHAT_APP_ID` / `WECHAT_APP_SECRET`, CLI flags, or config, and remind that the running machine IP must be in the WeChat Official Account IP allowlist.

Defaults are intentional:

- Theme: `classic` / `经典`
- Theme color: `blue` / `#0366d6`, matching the source Obsidian WeChat Converter defaults
- Font size: `small` / `小`
- Advanced options: enabled

Preview rendering resolves local images to `file://` URLs. Draft sync uploads cover and article images to WeChat APIs; it does not use a third-party image host by default.

The renderer supports Obsidian image swipe callouts:

```markdown
> [!image-sensitive] 此类图片可能引发不适，向左滑动查看
> ![[图片1.png]]
```

Math formulas render as MathJax SVG for preview and are rasterized/uploaded during sync. Mermaid fences are diagnostic-only; render Mermaid diagrams to images before final sync.

Do not store real WeChat AppSecret values in committed files.

# Themes

The CLI uses the renderer and theme system adapted from the Obsidian WeChat Converter project. The vendored files under `vendor/` are synced from upstream `obsidian-wechat-converter` (currently v2.12.0, commit `a8035a5`) via `node scripts/sync-vendor.mjs`.

| CLI value | Chinese label | Style intent |
| --- | --- | --- |
| `minimal` | 简约 | Clean GitHub-like article formatting. |
| `classic` | 经典 | Default WeChat article style, balanced headings and spacing. |
| `elegant` | 优雅 | Editorial serif-like tone with more formal headings. |
| `paper` | 纸张长文 | Warm long-form reading style. |
| `grid` | 网格文档 | Structured document style with grid-inspired hierarchy. |
| `typo` | Typo | Typography-focused long text layout. |
| `media` | 清爽媒体 | Fresh media/article style for image-rich posts. |
| `colorful` | 彩色强调 | Stronger color accents for key sections and emphasis. |

Default to `classic` unless the user requests another theme.

## Section Heading Styles (分节标题)

`--heading-style` decorates level-2 (`##`) headings, matching the plugin's 分节标题 setting:

| Value | Chinese alias | Look |
| --- | --- | --- |
| `default` | 跟随主题 | Keep the current theme's h2 styling (no decoration). |
| `serial-number` | 序号 | Large 34px index number (01, 02, …) beside the title with a hairline bottom border. |
| `badge` | 徽标 | Solid-color pill badge with the index number plus a gradient divider. |
| `zen` | 禅意 | Centered letterspaced `PART 01` kicker, serif title, thin centered divider. |
| `left-border` | 左侧色块 | Left color bar accent. |
| `bottom-line` | 底边下划线 | Bottom underline accent. |
| `bubble` | 气泡 | Light background card. |
| `card` | 卡片 | Light background card (bubble variant). |
| `double-line` | 双细下划线 | Double hairline underline. |

Numbers follow document order across all `##` headings. Precedence: `--heading-style` flag > article frontmatter `headingStyle` > config file > default.

Behavior inherited from the v2.12.0 sync (visible differences vs older vendored versions):

- Task-list checkboxes render as theme-colored `☐` / struck-through `☑` markers.
- Blockquotes use a slimmer 2px theme-colored left border.
- Table header cells carry a theme-color background tint; the CLI re-applies explicit body font-size and text color on all cells because the WeChat editor drops inherited styles inside tables.
- Body text is justified by default (`text-align: justify`), matching upstream since 2.5.5.

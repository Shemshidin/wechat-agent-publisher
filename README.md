# WeChat Agent Publisher

面向 AI Agent 的 Markdown 到微信公众号发布工具。它提供一个本地 CLI 和一个内置 skill，让 Codex、OpenClaw 等 agent 可以把 Markdown 文件渲染为微信公众号友好的 HTML，并在用户明确要求时同步到微信公众号草稿箱。

## 功能特性

- Markdown 转微信公众号内联样式 HTML
- 支持 Agent skill 调用，避免每次让 agent 重写转换逻辑
- 默认使用 `经典` 主题、`小` 字号（`xs` / 14px）、蓝色主题色 `#0366d6`
- 支持主题：`简约`、`经典`、`优雅`、`纸张长文`、`网格文档`、`Typo`、`清爽媒体`、`彩色强调`
- 支持 Obsidian 图片语法和本地图片路径解析
- 支持 `image-swipe` / `image-sensitive` 横向滑动图片块
- 支持 LaTeX 数学公式预览和同步时转 PNG 上传
- 支持中文标点规范化、任务列表、YAML frontmatter
- 同步草稿时上传封面、正文图片和公式图片到微信官方接口

## 安装

```bash
npm install
```

Node.js 要求：`>=18`。

## 基本用法

先生成浏览器预览 HTML：

```bash
node src/cli.js render article.md --full --output out/article.preview.html
```

生成可粘贴到微信编辑器的 HTML 片段：

```bash
node src/cli.js render article.md --output out/article.html
```

指定主题和字号：

```bash
node src/cli.js render article.md --theme classic --font-size xs --output out/article.html
node src/cli.js render article.md --theme paper --font-size normal --full --output out/article.preview.html
```

如果文章里有 Obsidian wiki 图片，并且需要从 vault 根目录查找图片：

```bash
node src/cli.js render article.md --vault-root D:\Documents\Obsidian\ShemNotes --output out/article.html
```

关闭中文标点规范化：

```bash
node src/cli.js render article.md --no-normalize-chinese-punctuation --output out/article.html
```

## 主题和字号

可用主题：

| CLI 值 | 中文名 |
| --- | --- |
| `minimal` | 简约 |
| `classic` | 经典 |
| `elegant` | 优雅 |
| `paper` | 纸张长文 |
| `grid` | 网格文档 |
| `typo` | Typo |
| `media` | 清爽媒体 |
| `colorful` | 彩色强调 |

可用字号：`xs`、`small`、`normal`、`large`、`xl`，也可以使用 `1..5`。中文名中，`小` 对应 `xs` / 正文 14px，`较小` 对应 `small` / 正文 15px。默认使用 `小`，正文和表格单元格文字都会显式使用 14px。

默认值：

- 主题：`classic` / `经典`
- 字号：`xs` / `小`
- 主题色：`blue` / `#0366d6`
- 高级选项：开启

## 同步到微信公众号草稿箱

同步前请确认：

- 已配置 `WECHAT_APP_ID`
- 已配置 `WECHAT_APP_SECRET`
- 当前运行机器的 IP 已加入微信公众号后台 IP 白名单

PowerShell 示例：

```powershell
$env:WECHAT_APP_ID="你的 AppID"
$env:WECHAT_APP_SECRET="你的 AppSecret"
node src/cli.js sync article.md --cover cover.png
```

更新已有草稿：

```bash
node src/cli.js sync article.md --draft-media-id MEDIA_ID --draft-index 0
```

创建同一个草稿里的多篇图文（按参数顺序：头条、第二条、第三条）：

```bash
node src/cli.js sync first.md second.md third.md
```

多篇图文同步时，每篇 Markdown 需要在自己的 frontmatter 里设置 `cover`，或正文里有可作为封面的第一张图片。`--cover`、`--title`、`--digest`、`--source-url` 这类单篇覆盖参数只适用于单篇同步。

更新已有多图文草稿时，会从 `--draft-index` 开始按顺序更新：

```bash
node src/cli.js sync first.md second.md --draft-media-id MEDIA_ID --draft-index 0
```

同步规则：

- 封面优先级：`--cover`、frontmatter `cover`、正文第一张图片
- 封面图上传到微信永久素材接口，返回 `media_id`
- 正文图片上传到微信文章图片接口，返回 `https://mmbiz.qpic.cn/...`
- 数学公式 SVG 会转成 PNG 后上传到微信
- 正文图片上传失败时会插入占位提示，并继续创建草稿
- 不使用第三方图床

## Frontmatter 约定

普通公众号图文草稿支持以下字段：

```md
---
title: 在本地跑一个大语言模型(2) - 给模型提供外部知识库
cover: /Users/xxx/image.jpg
author: xxx
summary: 这是一段显示在微信公众号文章摘要里的文字
source_url: https://example.com/original
need_open_comment: true
only_fans_can_comment: false
---
```

字段说明：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `title` | 推荐 | 文章标题；未设置时回退到一级标题或文件名 |
| `cover` | 否 | 封面图片，本地路径、相对路径、`file://`、data URL、网络 URL 均可 |
| `author` | 否 | 作者 |
| `summary` | 否 | 文章摘要，映射到微信公众号草稿 `digest` 字段 |
| `digest` | 否 | 文章摘要；优先级高于 `summary` |
| `abstract` / `description` / `excerpt` | 否 | 摘要别名；兼容已有写法 |
| `source_url` | 否 | 原文链接，映射到微信 `content_source_url` |
| `need_open_comment` | 否 | 是否打开评论 |
| `only_fans_can_comment` | 否 | 是否仅粉丝可评论 |
| `type` / `image_list` | 暂不支持 | 图片消息 / 小绿书发布暂未实现，遇到时会明确报错 |

## 图片处理

预览时：

- 本地图片解析为 `file://` 路径
- Obsidian wiki 图片如 `![[图片.png]]` 会解析为本地文件

同步时：

- 本地图片、相对路径图片、网络图片都会上传到微信官方接口
- 正文图片会替换为微信返回的 `mmbiz.qpic.cn` 地址
- 不会上传到第三方图床

支持的图片写法包括：

```md
![图片](./assets/image.png)
![[image.png]]
![[image.png|说明文字]]
```

## 图片滑动块

普通横向滑动图片：

```md
> [!image-swipe] 左右滑动查看图片
> ![[图片1.png]]
> ![[图片2.png]]
```

敏感图片滑动块：

```md
> [!image-sensitive] 此类图片可能引发不适，向左滑动查看
> ![[图片1.png]]
```

`image-sensitive` 会先显示“敏感图片”提示面板，再横向滑动查看图片。

## 数学公式和 Mermaid

数学公式：

- 预览时渲染为 MathJax SVG
- 同步时转 PNG 并上传到微信

Mermaid：

- CLI 会检测 Mermaid fenced code，并在 `diagnostics` 中提示
- 当前不会在 CLI 中伪造 Mermaid 渲染结果
- 如需精确发布，请先把 Mermaid 导出为图片，再嵌入 Markdown

## Agent Skill

内置 skill 位于：

```text
skills/wechat-agent-publisher/SKILL.md
```

Codex、OpenClaw 等 agent 应加载该 skill，并通过 CLI 执行渲染或同步，不要临时手写转换逻辑。

本机安装到 Codex / OpenClaw：

```powershell
Copy-Item -Recurse -Force .\skills\wechat-agent-publisher $env:USERPROFILE\.codex\skills\
Copy-Item -Recurse -Force .\skills\wechat-agent-publisher $env:USERPROFILE\.agents\skills\
```

推荐 agent 工作流：

1. 先运行 `render --full` 生成预览
2. 检查输出路径和 diagnostics
3. 只有在用户明确要求时才运行 `sync`
4. 不要提交真实 AppSecret

## 测试

```bash
npm test
```

当前测试覆盖：

- 默认主题/字号
- 本地图片和 Obsidian wiki 图片解析
- 图片滑动块
- YAML frontmatter
- 中文标点规范化
- 任务列表
- 数学公式
- Mermaid diagnostics
- 微信草稿同步 mock
- 图片上传失败占位

# Changelog

## 0.2.0 — 2026-10-26

渲染核心从 obsidian-wechat-converter 2.8.4 同步到 2.12.0（commit `a8035a5`），并新增插件"分节标题"功能。

### 新增

- **分节标题（`##` 装饰）**：渲染选项 `--heading-style <style>`，同时支持文章 frontmatter 字段 `headingStyle` 与配置文件键 `headingStyle`。可选值（中文别名与插件 UI 一致）：
  - `default` / `跟随主题` —— 默认，保持主题 h2 样式，不装饰
  - `serial-number` / `序号` —— 34px 大序号（01、02…）+ 底部细线
  - `badge` / `徽标` —— 主题色胶囊序号标签 + 渐变分割线
  - `zen` / `禅意` —— 居中 `PART 01` 字距小标 + 宋体大标题 + 细分割线
  - `left-border` / `左侧色块`、`bottom-line` / `底边下划线`、`bubble` / `气泡`、`card` / `卡片`、`double-line` / `双细下划线`
  - 优先级：**CLI 旗标 > 文章 frontmatter > 配置文件 > default**；序号按文档中 `##` 出现顺序递增
- 配置文件新增可透传排版参数：`lineHeight`、`paragraphGap`、`letterSpacing`（数字，不填用主题默认）。
- `npm run sync:vendor`：从本地上游检出（默认 `D:\Code\wechat-converter`，可用 `--upstream <path>` 覆盖）重新生成全部 vendor 文件，并自动重放 CLI 补丁。

### 行为变化（2.12.0 同步带来，对现有文章可见）

- 任务列表标记：`□ 文本` → 主题色 `☐`（未完成）/ 删除线 `☑`（已完成）的 span 结构。
- 引用块左边框 4px → 2px，颜色随主题色。
- 表格：表头单元格带主题色底纹（如 `#0366d61F`）；CLI 会在所有 `th`/`td` 上显式写入正文字号与颜色（微信编辑器会丢表格内的继承样式，显式值保证渲染一致）。
- 代码块高亮：由 hljs 类名改为**内联颜色 span**。若你的流程曾按 `hljs` 类名做 HTML 后处理或断言，需要改为按内联 `color:` 样式匹配。
- 标题安全：上游修复了标题前缀的 HTML 注入问题（对正常文章无影响）。
- 数学公式、Mermaid、图片解析、草稿同步流程不变。

### 不变

- 命令行界面：`render` / `sync` 的原有参数全部不变，仅新增 `--heading-style`。
- 默认值：classic 主题 / blue `#0366d6` / xs（小，正文 14px）/ advanced 开启 / 六级标题统一发布蓝。
- sync 流程、图片与公式/Mermaid 上传、凭证来源（环境变量 / 旗标 / 配置）均不变。

### 面向 agent 的操作提示

- `vendor/` 目录全部是生成文件，**不要手工编辑**；需要更新时运行 `npm run sync:vendor`（上游检出须干净）。
- 对生成 HTML 做断言或后处理时，注意上文"行为变化"中的标记变化（`□`→`☐` span、hljs 类名→内联色、表格单元格显式字号）。
- 测试基线：`npm test`，32 个测试全部通过；新增分节标题相关测试 6 个。

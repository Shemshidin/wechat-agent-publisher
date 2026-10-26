const fs = require('fs');
const path = require('path');

const { VALID_HEADING_STYLES } = require('../vendor/heading-style-renderer');

const THEME_ALIASES = {
  github: 'github',
  minimal: 'github',
  simple: 'github',
  '简约': 'github',
  wechat: 'wechat',
  classic: 'wechat',
  default: 'wechat',
  '经典': 'wechat',
  serif: 'serif',
  elegant: 'serif',
  '优雅': 'serif',
  paper: 'paper',
  longform: 'paper',
  '纸张长文': 'paper',
  grid: 'grid',
  document: 'grid',
  '网格文档': 'grid',
  typo: 'typo',
  Typo: 'typo',
  media: 'media',
  freshmedia: 'media',
  '清爽媒体': 'media',
  colorful: 'colorful',
  accent: 'colorful',
  '彩色强调': 'colorful',
};

const FONT_SIZE_ALIASES = {
  xs: 1,
  mini: 1,
  smallest: 1,
  '极小': 1,
  '小': 1,
  small: 2,
  '较小': 2,
  normal: 3,
  medium: 3,
  default: 3,
  '默认': 3,
  '中': 3,
  large: 4,
  '大': 4,
  xl: 5,
  largest: 5,
  '特大': 5,
};

const WECHAT_CONVERTER_DEFAULT_THEME_COLOR = 'blue';
const WECHAT_CONVERTER_DEFAULT_CUSTOM_COLOR = '#0366d6';
// Every heading's text must use the configured publishing blue. Decorative
// accents or per-level tints are not sufficient for WeChat draft validation.
const WECHAT_CONVERTER_DEFAULT_HEADING_COLORS = Array(6).fill(WECHAT_CONVERTER_DEFAULT_CUSTOM_COLOR);

// Section heading (##) decoration styles, aligned with upstream
// heading-style-renderer HEADING_STYLES. Chinese aliases match the plugin UI.
const HEADING_STYLE_ALIASES = {
  default: 'default',
  follow: 'default',
  theme: 'default',
  '跟随主题': 'default',
  '默认': 'default',
  'serial-number': 'serial-number',
  serial: 'serial-number',
  serialnumber: 'serial-number',
  number: 'serial-number',
  numbered: 'serial-number',
  '序号': 'serial-number',
  badge: 'badge',
  '徽标': 'badge',
  '胶囊': 'badge',
  pill: 'badge',
  zen: 'zen',
  '禅意': 'zen',
  '留白': 'zen',
  'left-border': 'left-border',
  leftborder: 'left-border',
  '左侧色块': 'left-border',
  '左边框': 'left-border',
  'bottom-line': 'bottom-line',
  bottomline: 'bottom-line',
  underline: 'bottom-line',
  '底边下划线': 'bottom-line',
  '下划线': 'bottom-line',
  bubble: 'bubble',
  '气泡': 'bubble',
  card: 'card',
  '卡片': 'card',
  'double-line': 'double-line',
  doubleline: 'double-line',
  '双细下划线': 'double-line',
  '双下划线': 'double-line',
};

const DEFAULT_OPTIONS = {
  theme: 'wechat',
  themeColor: WECHAT_CONVERTER_DEFAULT_THEME_COLOR,
  customColor: WECHAT_CONVERTER_DEFAULT_CUSTOM_COLOR,
  quoteCalloutStyleMode: 'theme',
  fontFamily: 'sans-serif',
  fontSize: 1,
  macCodeBlock: true,
  codeLineNumber: true,
  sidePadding: 16,
  coloredHeader: true,
  headingColors: WECHAT_CONVERTER_DEFAULT_HEADING_COLORS,
  headingStyle: 'default',
  showImageCaption: true,
  normalizeChinesePunctuation: true,
  advanced: true,
};

function normalizeTheme(value) {
  const raw = String(value || '').trim();
  return THEME_ALIASES[raw] || THEME_ALIASES[raw.toLowerCase()] || DEFAULT_OPTIONS.theme;
}

function normalizeHeadingStyle(value) {
  const raw = String(value || '').trim();
  const resolved = HEADING_STYLE_ALIASES[raw] || HEADING_STYLE_ALIASES[raw.toLowerCase()];
  if (resolved && VALID_HEADING_STYLES.includes(resolved)) return resolved;
  return DEFAULT_OPTIONS.headingStyle;
}

function normalizeFontSize(value) {
  if (value === undefined || value === null || value === '') return DEFAULT_OPTIONS.fontSize;
  const raw = String(value).trim();
  if (FONT_SIZE_ALIASES[raw] !== undefined) return FONT_SIZE_ALIASES[raw];
  if (FONT_SIZE_ALIASES[raw.toLowerCase()] !== undefined) return FONT_SIZE_ALIASES[raw.toLowerCase()];
  const parsed = Number(raw);
  if (Number.isFinite(parsed)) return Math.max(1, Math.min(5, Math.round(parsed)));
  return DEFAULT_OPTIONS.fontSize;
}

function readJsonFile(filePath) {
  if (!filePath) return {};
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) return {};
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function loadProjectConfig(startDir = process.cwd()) {
  const candidates = [
    path.join(startDir, 'wechat-agent-publisher.config.json'),
    path.join(startDir, '.wechat-agent-publisher.json'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return readJsonFile(candidate);
  }
  return {};
}

function buildRenderOptions(raw = {}) {
  const merged = { ...DEFAULT_OPTIONS, ...(raw || {}) };
  const headingColors = Array.isArray(merged.headingColors)
    ? WECHAT_CONVERTER_DEFAULT_HEADING_COLORS.map((color, index) => merged.headingColors[index] || color)
    : WECHAT_CONVERTER_DEFAULT_HEADING_COLORS;
  return {
    ...merged,
    theme: normalizeTheme(merged.theme),
    fontSize: normalizeFontSize(merged.fontSize),
    headingStyle: normalizeHeadingStyle(merged.headingStyle),
    macCodeBlock: merged.advanced === false ? false : merged.macCodeBlock !== false,
    codeLineNumber: merged.advanced === false ? false : merged.codeLineNumber !== false,
    showImageCaption: merged.showImageCaption !== false,
    normalizeChinesePunctuation: merged.normalizeChinesePunctuation !== false,
    headingColors,
  };
}

function buildWechatAccount(raw = {}) {
  return {
    appId: raw.appId || process.env.WECHAT_APP_ID || '',
    appSecret: raw.appSecret || process.env.WECHAT_APP_SECRET || '',
    author: raw.author || process.env.WECHAT_AUTHOR || '',
    contentSourceUrl: raw.contentSourceUrl || process.env.WECHAT_CONTENT_SOURCE_URL || '',
    openComment: raw.openComment !== undefined ? !!raw.openComment : true,
    onlyFansCanComment: raw.onlyFansCanComment !== undefined ? !!raw.onlyFansCanComment : false,
  };
}

module.exports = {
  DEFAULT_OPTIONS,
  WECHAT_CONVERTER_DEFAULT_THEME_COLOR,
  WECHAT_CONVERTER_DEFAULT_CUSTOM_COLOR,
  WECHAT_CONVERTER_DEFAULT_HEADING_COLORS,
  THEME_ALIASES,
  FONT_SIZE_ALIASES,
  HEADING_STYLE_ALIASES,
  normalizeTheme,
  normalizeFontSize,
  normalizeHeadingStyle,
  loadProjectConfig,
  readJsonFile,
  buildRenderOptions,
  buildWechatAccount,
};

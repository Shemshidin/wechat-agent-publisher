const fs = require('fs');
const path = require('path');

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
  small: 2,
  '小': 2,
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

const DEFAULT_OPTIONS = {
  theme: 'wechat',
  themeColor: WECHAT_CONVERTER_DEFAULT_THEME_COLOR,
  customColor: WECHAT_CONVERTER_DEFAULT_CUSTOM_COLOR,
  quoteCalloutStyleMode: 'theme',
  fontFamily: 'sans-serif',
  fontSize: 2,
  macCodeBlock: true,
  codeLineNumber: true,
  sidePadding: 16,
  coloredHeader: false,
  showImageCaption: true,
  normalizeChinesePunctuation: true,
  advanced: true,
};

function normalizeTheme(value) {
  const raw = String(value || '').trim();
  return THEME_ALIASES[raw] || THEME_ALIASES[raw.toLowerCase()] || DEFAULT_OPTIONS.theme;
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
  return {
    ...merged,
    theme: normalizeTheme(merged.theme),
    fontSize: normalizeFontSize(merged.fontSize),
    macCodeBlock: merged.advanced === false ? false : merged.macCodeBlock !== false,
    codeLineNumber: merged.advanced === false ? false : merged.codeLineNumber !== false,
    showImageCaption: merged.showImageCaption !== false,
    normalizeChinesePunctuation: merged.normalizeChinesePunctuation !== false,
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
  THEME_ALIASES,
  FONT_SIZE_ALIASES,
  normalizeTheme,
  normalizeFontSize,
  loadProjectConfig,
  readJsonFile,
  buildRenderOptions,
  buildWechatAccount,
};

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp']);

function normalizeSlashes(value) {
  return String(value || '').replace(/\\/g, '/');
}

function stripAnchorAndQuery(value) {
  return String(value || '').split('#')[0].split('?')[0];
}

function decodePath(value) {
  try {
    return decodeURI(value);
  } catch (error) {
    return value;
  }
}

function isRemoteOrData(src) {
  return /^(https?:\/\/|data:)/i.test(String(src || ''));
}

function isAbsoluteLocalPath(value) {
  return path.isAbsolute(value) || /^[a-zA-Z]:[\\/]/.test(value);
}

function getCandidatePaths(linkPath, sourcePath = '', vaultRoot = '') {
  const cleaned = stripAnchorAndQuery(decodePath(linkPath)).trim();
  if (!cleaned || isRemoteOrData(cleaned)) return [];

  const candidates = [];
  if (isAbsoluteLocalPath(cleaned)) {
    candidates.push(path.resolve(cleaned));
    return candidates;
  }

  const sourceDir = sourcePath ? path.dirname(path.resolve(sourcePath)) : process.cwd();
  candidates.push(path.resolve(sourceDir, cleaned));

  if (vaultRoot) {
    candidates.push(path.resolve(vaultRoot, cleaned));
  }

  return Array.from(new Set(candidates));
}

function findByBasename(root, basename, maxMatches = 1) {
  const matches = [];
  const stack = [root];
  const target = basename.toLowerCase();

  while (stack.length && matches.length < maxMatches) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (error) {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!['.git', 'node_modules', '.obsidian'].includes(entry.name)) {
          stack.push(fullPath);
        }
      } else if (entry.name.toLowerCase() === target) {
        matches.push(fullPath);
        if (matches.length >= maxMatches) break;
      }
    }
  }

  return matches[0] || '';
}

function resolveImageFile(linkPath, { sourcePath = '', vaultRoot = '' } = {}) {
  const cleaned = stripAnchorAndQuery(decodePath(linkPath)).trim();
  if (!cleaned || isRemoteOrData(cleaned)) return '';

  for (const candidate of getCandidatePaths(cleaned, sourcePath, vaultRoot)) {
    if (fs.existsSync(candidate)) return candidate;
  }

  const basename = path.basename(cleaned);
  if (!IMAGE_EXTENSIONS.has(path.extname(basename).toLowerCase())) return '';

  const sourceDir = sourcePath ? path.dirname(path.resolve(sourcePath)) : process.cwd();
  const roots = Array.from(new Set([sourceDir, vaultRoot].filter(Boolean).map((root) => path.resolve(root))));
  for (const root of roots) {
    const found = findByBasename(root, basename);
    if (found) return found;
  }

  return '';
}

function resolveImageSrc(linkPath, options = {}) {
  if (isRemoteOrData(linkPath)) return linkPath;
  const filePath = resolveImageFile(linkPath, options);
  return filePath ? pathToFileURL(filePath).href : linkPath;
}

function createObsidianLikeImageApp({ sourcePath = '', vaultRoot = '' } = {}) {
  return {
    metadataCache: {
      getFirstLinkpathDest(linkPath) {
        const filePath = resolveImageFile(linkPath, { sourcePath, vaultRoot });
        return filePath ? { path: filePath } : null;
      },
    },
    vault: {
      getResourcePath(file) {
        const filePath = typeof file === 'string' ? file : file?.path;
        return filePath ? pathToFileURL(filePath).href : '';
      },
    },
  };
}

module.exports = {
  createObsidianLikeImageApp,
  resolveImageFile,
  resolveImageSrc,
  isRemoteOrData,
  normalizeSlashes,
};

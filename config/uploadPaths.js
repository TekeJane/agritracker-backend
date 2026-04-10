const fs = require('fs');
const path = require('path');

const backendRoot = path.resolve(__dirname, '..');
const configuredUploadRoot =
  process.env.UPLOAD_DIR ||
  process.env.RAILWAY_VOLUME_PATH ||
  process.env.RAILWAY_VOLUME_MOUNT_PATH ||
  process.env.VOLUME_MOUNT_PATH ||
  path.join(backendRoot, 'uploads');
const primaryUploadDir = path.resolve(configuredUploadRoot);
const legacyUploadDir = path.join(process.cwd(), 'uploads');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function ensureUploadDir(subdir = '') {
  const targetDir = subdir
    ? path.join(primaryUploadDir, subdir)
    : primaryUploadDir;
  ensureDir(targetDir);
  return targetDir;
}

function toUploadDbPath(filePath) {
  if (!filePath) return null;

  const normalized = filePath.replace(/\\/g, '/');
  const uploadsIndex = normalized.toLowerCase().lastIndexOf('/uploads/');
  if (uploadsIndex >= 0) {
    return normalized.substring(uploadsIndex);
  }

  if (normalized.toLowerCase().startsWith('uploads/')) {
    return `/${normalized}`;
  }

  return `/uploads/${path.basename(normalized)}`;
}

function resolveUploadFilePath(dbPath) {
  if (!dbPath) return null;

  const normalized = String(dbPath).replace(/\\/g, '/').trim();
  if (!normalized) return null;

  const relativePath = normalized
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/^\/+/, '');

  if (!relativePath.toLowerCase().startsWith('uploads/')) {
    return null;
  }

  const relativeWithoutRoot = relativePath.substring('uploads/'.length);
  return path.join(primaryUploadDir, relativeWithoutRoot);
}

ensureDir(primaryUploadDir);

module.exports = {
  backendRoot,
  primaryUploadDir,
  legacyUploadDir,
  ensureUploadDir,
  resolveUploadFilePath,
  toUploadDbPath,
};

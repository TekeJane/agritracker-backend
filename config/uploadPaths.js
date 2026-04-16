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
const uploadRoots = Array.from(
  new Set([primaryUploadDir, legacyUploadDir].map((dir) => path.resolve(dir))),
);

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

  const normalized = String(dbPath)
    .replace(/\\/g, '/')
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/[?#].*$/, '')
    .trim();
  if (!normalized) return null;

  const directPath = path.resolve(normalized);
  if (fs.existsSync(directPath)) {
    return directPath;
  }

  const relativePath = normalized.replace(/^\/+/, '');
  const relativeCandidates = [];

  if (relativePath.toLowerCase().startsWith('uploads/')) {
    relativeCandidates.push(relativePath.substring('uploads/'.length));
  } else {
    relativeCandidates.push(relativePath);
    relativeCandidates.push(path.basename(relativePath));
  }

  for (const uploadRoot of uploadRoots) {
    const normalizedRoot = uploadRoot.replace(/\\/g, '/');
    if (normalized.toLowerCase().startsWith(normalizedRoot.toLowerCase())) {
      const nestedRelative = normalized.slice(normalizedRoot.length).replace(/^\/+/, '');
      if (nestedRelative) {
        relativeCandidates.unshift(nestedRelative);
      }
    }
  }

  for (const candidate of relativeCandidates) {
    if (!candidate) continue;

    for (const uploadRoot of uploadRoots) {
      const resolved = path.join(uploadRoot, candidate);
      if (fs.existsSync(resolved)) {
        return resolved;
      }
    }
  }

  const preferredCandidate = relativeCandidates.find(Boolean);
  return preferredCandidate ? path.join(primaryUploadDir, preferredCandidate) : null;
}

ensureDir(primaryUploadDir);
ensureDir(legacyUploadDir);

module.exports = {
  backendRoot,
  primaryUploadDir,
  legacyUploadDir,
  uploadRoots,
  ensureUploadDir,
  resolveUploadFilePath,
  toUploadDbPath,
};

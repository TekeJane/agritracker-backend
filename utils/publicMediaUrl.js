function buildPublicMediaUrl(value, host) {
    if (!value) return null;

    const raw = String(value).trim();
    if (!raw) return null;
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
        return raw;
    }

    let normalized = raw.replace(/\\/g, '/');
    if (!normalized.startsWith('/')) {
        normalized = normalized.startsWith('uploads/')
            ? `/${normalized}`
            : `/uploads/${normalized}`;
    }

    if (normalized.startsWith('/uploads/uploads/')) {
        normalized = normalized.replace('/uploads/uploads/', '/uploads/');
    }

    return `${host}${normalized}`;
}

module.exports = { buildPublicMediaUrl };

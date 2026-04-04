const multer = require('multer');
const path = require('path');
const { ensureUploadDir } = require('../config/uploadPaths');

const uploadDir = ensureUploadDir('videos');
const maxVideoUploadSizeBytes =
    Number(process.env.VIDEO_UPLOAD_MAX_MB || 250) * 1024 * 1024;

const storage = multer.diskStorage({
    destination(req, file, cb) {
        cb(null, uploadDir);
    },
    filename(req, file, cb) {
        const timestamp = Date.now();
        const randomSuffix = Math.round(Math.random() * 1e9);
        const extension = path.extname(file.originalname || '').toLowerCase();
        cb(null, `${timestamp}-${randomSuffix}${extension}`);
    },
});

function isAllowedVideo(file) {
    const extension = path.extname(file.originalname || '').toLowerCase();
    const mimeType = String(file.mimetype || '').toLowerCase();
    const allowedExtensions = ['.mp4', '.mov', '.avi', '.webm', '.mkv', '.m4v'];
    const allowedMimeTypes = [
        'video/mp4',
        'video/quicktime',
        'video/x-msvideo',
        'video/webm',
        'video/x-matroska',
        'video/mp2t',
        'application/octet-stream',
    ];

    return allowedExtensions.includes(extension) || allowedMimeTypes.includes(mimeType);
}

function isAllowedImage(file) {
    const extension = path.extname(file.originalname || '').toLowerCase();
    const mimeType = String(file.mimetype || '').toLowerCase();
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
    const allowedMimeTypes = [
        'image/jpeg',
        'image/png',
        'image/webp',
        'application/octet-stream',
    ];

    return allowedExtensions.includes(extension) || allowedMimeTypes.includes(mimeType);
}

function fileFilter(req, file, cb) {
    const fieldName = String(file.fieldname || '').toLowerCase();

    if (fieldName === 'video_url') {
        if (isAllowedVideo(file)) {
            return cb(null, true);
        }
        return cb(new Error('Video file must be MP4, MOV, AVI, WEBM, MKV, or M4V.'));
    }

    if (fieldName === 'thumbnail_image' || fieldName === 'creator_image') {
        if (isAllowedImage(file)) {
            return cb(null, true);
        }
        return cb(new Error('Thumbnail and creator images must be JPG, PNG, or WEBP.'));
    }

    return cb(new Error(`Unexpected upload field: ${file.fieldname}`));
}

const videoUpload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: maxVideoUploadSizeBytes,
        files: 3,
    },
});

module.exports = videoUpload;

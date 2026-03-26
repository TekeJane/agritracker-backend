const multer = require('multer');
const fs = require('fs');
const path = require('path');

const uploadDir = path.join(process.cwd(), 'uploads');

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// === Storage config ===
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    },
});

// === File filter ===
const fileFilter = function (req, file, cb) {
    const allowedExtensions = [
        '.jpg', '.jpeg', '.png', '.gif',          // images
        '.mp4', '.mov', '.avi', '.webm', '.mkv',  // videos
        '.pdf', '.epub', '.docx',                 // documents
    ];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedExtensions.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error('Only image, video, and document files are allowed'));
    }
};

// === Multer instance ===
const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50 MB max
    },
});

module.exports = upload;

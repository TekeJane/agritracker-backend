const express = require('express');
const router = express.Router();
const EbookController = require('../controllers/ebookController');
const { authenticate, authorizeAdmin } = require('../middleware/authMiddleware');
const multer = require('multer');
const path = require('path');

// === Multer Setup ===
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/'); // Make sure this folder exists
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    },
});

const upload = multer({ storage });

// === Routes ===

// ✅ Upload Ebook (requires authentication)
router.post(
    '/',
    authenticate,
    upload.fields([
        { name: 'file', maxCount: 1 },
        { name: 'cover_image', maxCount: 1 },
    ]),
    EbookController.uploadEbook
);

// ✅ Get list of approved Ebooks (public)
router.get('/', EbookController.listApprovedEbooks);

// ✅ Admin approves an Ebook
router.put(
    '/:id/approve',
    authenticate,
    authorizeAdmin,
    EbookController.approveEbook
);
router.put(
    '/Ebooks/:id/approve',
    authenticate,
    authorizeAdmin,
    EbookController.approveEbook
);

// ✅ Admin creates a category
router.post(
    '/categories',
    authenticate,
    authorizeAdmin,
    EbookController.createEbookCategory
);
router.post(
    '/Ebooks/categories',
    authenticate,
    authorizeAdmin,
    EbookController.createEbookCategory
);

// ✅ Get all Ebook categories (public)
router.get('/categories', EbookController.getEbookCategories);

// ✅ User purchases an Ebook
router.post('/purchase', authenticate, EbookController.purchaseEbook);
router.post('/Ebooks/purchase', authenticate, EbookController.purchaseEbook);

// ✅ Update Ebook (author only or admin, depending on logic)
router.put('/:id', authenticate, EbookController.updateEbook);
router.put('/Ebooks/:id', authenticate, EbookController.updateEbook);

// ✅ Delete Ebook (author only or admin)
router.delete('/:id', authenticate, EbookController.deleteEbook);
router.delete('/Ebooks/:id', authenticate, EbookController.deleteEbook);

router.get('/random', EbookController.getRandomEbooks);


module.exports = router; // 🔁 Export the router

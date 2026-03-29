const express = require('express');
const router = express.Router();
const EbookController = require('../controllers/ebookController');
const { authenticate, authorizeAdmin } = require('../middleware/authMiddleware');
const multer = require('multer');
const path = require('path');
const { ensureUploadDir } = require('../config/uploadPaths');

// === Multer Setup ===
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, ensureUploadDir());
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
        { name: 'gallery_images', maxCount: 8 },
        { name: 'ebook_file', maxCount: 1 },
        { name: 'ebook_cover_image', maxCount: 1 },
        { name: 'ebook_print_ready_cover', maxCount: 1 },
        { name: 'paperback_file', maxCount: 1 },
        { name: 'paperback_cover_image', maxCount: 1 },
        { name: 'paperback_print_ready_cover', maxCount: 1 },
        { name: 'hardcover_file', maxCount: 1 },
        { name: 'hardcover_cover_image', maxCount: 1 },
        { name: 'hardcover_print_ready_cover', maxCount: 1 },
    ]),
    EbookController.uploadEbook
);
router.post('/drafts', authenticate, EbookController.saveDraft);

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
router.get('/Ebooks/categories', EbookController.getEbookCategories);
router.get('/subcategories', EbookController.getEbookSubCategories);
router.get('/subcategories/category/:categoryId', EbookController.getEbookSubCategories);
router.get('/details/:id', EbookController.getEbookById);
router.get('/:id/purchase-status', authenticate, EbookController.getPurchaseStatus);
router.post('/checkout', authenticate, EbookController.createCheckoutOrder);
router.post(
    '/subcategories',
    authenticate,
    authorizeAdmin,
    EbookController.createEbookSubCategory
);
router.put(
    '/subcategories/:id',
    authenticate,
    authorizeAdmin,
    EbookController.updateEbookSubCategory
);
router.delete(
    '/subcategories/:id',
    authenticate,
    authorizeAdmin,
    EbookController.deleteEbookSubCategory
);
router.put(
    '/categories/:id',
    authenticate,
    authorizeAdmin,
    EbookController.updateEbookCategory
);
router.put(
    '/Ebooks/categories/:id',
    authenticate,
    authorizeAdmin,
    EbookController.updateEbookCategory
);
router.delete(
    '/categories/:id',
    authenticate,
    authorizeAdmin,
    EbookController.deleteEbookCategory
);
router.delete(
    '/Ebooks/categories/:id',
    authenticate,
    authorizeAdmin,
    EbookController.deleteEbookCategory
);

// ✅ User purchases an Ebook
router.post('/purchase', authenticate, EbookController.purchaseEbook);
router.post('/Ebooks/purchase', authenticate, EbookController.purchaseEbook);

// ✅ Update Ebook (author only or admin, depending on logic)
router.put('/:id', authenticate, EbookController.updateEbook);
router.put('/Ebooks/:id', authenticate, EbookController.updateEbook);

router.put(
    '/:id/feature',
    authenticate,
    authorizeAdmin,
    EbookController.featureEbook
);
router.put(
    '/:id/unfeature',
    authenticate,
    authorizeAdmin,
    EbookController.unfeatureEbook
);

// ✅ Delete Ebook (author only or admin)
router.delete('/:id', authenticate, EbookController.deleteEbook);
router.delete('/Ebooks/:id', authenticate, EbookController.deleteEbook);

router.get('/random', EbookController.getRandomEbooks);


module.exports = router; // 🔁 Export the router

const express = require('express');
const router = express.Router();

const { addAdmin, getAllAdmins, deleteAdmin } = require('../controllers/adminController');
const { authenticate, authorizeAdmin } = require('../middleware/authMiddleware');

console.log({
    addAdmin,
    getAllAdmins,
    deleteAdmin,
    authenticate,
    authorizeAdmin
});


router.post('/add', authenticate, authorizeAdmin, addAdmin);
router.get('/', authenticate, authorizeAdmin, getAllAdmins);
router.delete('/:id', authenticate, authorizeAdmin, deleteAdmin);

module.exports = router;

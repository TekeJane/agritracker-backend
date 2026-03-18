const express = require('express');
const router = express.Router();
const { loginUser, googleLogin, forgotPassword, resetPassword, sendOtp, verifyOtp} = require('../controllers/loginController');

router.post('/login', loginUser);
router.post('/auth/google-login', googleLogin);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);




module.exports = router;

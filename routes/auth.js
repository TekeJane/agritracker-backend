const express = require('express');
const router = express.Router();
const { loginUser, googleLogin, forgotPassword, resetPassword, sendOtp, verifyOtp} = require('../controllers/loginController');

router.Post('/login', loginUser);
router.Post('/auth/google-login', googleLogin);
router.Post('/forgot-password', forgotPassword);
router.Post('/reset-password', resetPassword);
router.Post('/send-otp', sendOtp);
router.Post('/verify-otp', verifyOtp);




module.exports = router;

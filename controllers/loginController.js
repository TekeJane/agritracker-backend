const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const User = require('../models/user');
const otpStore = {};
const axios = require('axios');

// Send OTP via ClickSend
const sendOtp = async (req, res) => {
    const { phone } = req.body;

    console.log(`📨 Request to send OTP to: ${phone}`);

    if (!phone) {
        console.warn("⚠️ No phone number provided");
        return res.status(400).json({ message: 'Phone number is required' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000); // 6-digit OTP
    console.log(`🔐 Generated OTP: ${otp} for ${phone}`);

    // Store OTP temporarily
    otpStore[phone] = {
        otp,
        expiresAt: Date.now() + 5 * 60 * 1000, // valid for 5 minutes
    };

    try {
        const response = await axios.post(
            'https://rest.clicksend.com/v3/sms/send',
            {
                messages: [
                    {
                        source: 'nodejs',
                        to: phone.startsWith('+') ? phone : `+${phone}`,
                        body: `Your OTP code is: ${otp}`,
                    },
                ],
            },
            {
                auth: {
                    username: process.env.CLICKSEND_USERNAME,
                    password: process.env.CLICKSEND_API_KEY,
                },
                headers: {
                    'Content-Type': 'application/json',
                },
            }
        );

        console.log(`✅ OTP sent to ${phone}. ClickSend response:`, response.data);
        return res.json({ message: 'OTP sent successfully', clicksend: response.data });

    } catch (error) {
        console.error("❌ Failed to send OTP:", error.response?.data || error.message);
        return res.status(500).json({
            message: 'Failed to send OTP',
            error: error.response?.data || error.message,
        });
    }
};

// Verify OTP
const verifyOtp = (req, res) => {
    const { phone, otp } = req.body;

    console.log(`📥 Verifying OTP for ${phone}: ${otp}`);

    const entry = otpStore[phone];

    if (!entry) {
        console.warn(`⚠️ No OTP entry found for ${phone}`);
        return res.status(400).json({ message: 'OTP not found. Please request a new one.' });
    }

    if (entry.expiresAt < Date.now()) {
        console.warn(`⏳ OTP for ${phone} has expired.`);
        delete otpStore[phone];
        return res.status(400).json({ message: 'OTP expired. Please request a new one.' });
    }

    if (entry.otp != otp) {
        console.warn(`❌ Invalid OTP for ${phone}. Provided: ${otp}, Expected: ${entry.otp}`);
        return res.status(400).json({ message: 'Invalid OTP. Please try again.' });
    }

    console.log(`✅ OTP verified for ${phone}`);
    delete otpStore[phone]; // Clear OTP after successful verification

    return res.json({ message: 'OTP verified successfully' });
};





const loginUser = async (req, res) => {
    try {
        const { email, phone, password } = req.body;
        const identifier = email || phone;

        console.log("🟢 Login attempt with identifier:", identifier);

        if (!identifier || !password) {
            return res.status(400).json({ message: 'Email/Phone and password are required' });
        }

        const user = await User.findOne({
            where: {
                [Op.or]: [
                    { email: identifier },
                    { phone: identifier }
                ]
            }
        });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const token = jwt.sign(
            {
                id: user.id,
                email: user.email,
                phone: user.phone,
                role: user.role
            },
            process.env.JWT_SECRET || 'yourSecretKey',
            { expiresIn: '30d' } // Extended token lifespan
        );

        const { password: _, ...safeUserData } = user.toJSON();
        console.log("✅ Login successful:", safeUserData); // Optional: Debug log


        return res.status(200).json({
            message: 'Login successful',
            token,
            user: safeUserData
        });

    } catch (error) {
        console.error("🔥 Error during login:", error);
        return res.status(500).json({ message: 'Server error', error: error.message });
    }
};



const googleLogin = async (req, res) => {
    try {
        const { email, full_name, profile_image } = req.body;

        if (!email || !full_name) {
            return res.status(400).json({ message: 'Missing email or name' });
        }

        let user = await User.findOne({ where: { email } });

        if (!user) {
            user = await User.create({
                email,
                full_name,
                phone: '0000000000', // dummy phone (since it's required)
                password: 'google_oauth_login', // dummy password (not used)
                profile_image,
                role: 'user',
            });
        }

        const token = jwt.sign(
            {
                id: user.id,
                email: user.email,
                role: user.role,
            },
            process.env.JWT_SECRET || 'yourSecretKey',
            { expiresIn: '30d' }
        );

        const { password, ...userSafe } = user.toJSON();

        return res.status(200).json({ token, user: userSafe });
    } catch (error) {
        console.error('🔥 Google login error:', error);
        return res.status(500).json({ message: 'Google login failed', error: error.message });
    }
};


const forgotPassword = async (req, res) => {
    const { identifier } = req.body; // can be email or phone

    try {
        const user = await User.findOne({
            where: {
                [Op.or]: [
                    { email: identifier },
                    { phone: identifier }
                ]
            }
        });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Create reset token (valid for 15 mins)
        const resetToken = jwt.sign(
            { id: user.id },
            process.env.JWT_SECRET,
            { expiresIn: '15m' }
        );

        // Return reset token to frontend (for testing/dev)
        res.status(200).json({
            message: 'Reset token generated successfully',
            resetToken
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};



const resetPassword = async (req, res) => {
    const { resetToken, newPassword } = req.body;

    try {
        const decoded = jwt.verify(resetToken, process.env.JWT_SECRET);
        const userId = decoded.id;

        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedPassword;
        await user.save();

        res.status(200).json({ message: 'Password has been reset successfully' });
    } catch (error) {
        res.status(400).json({ message: 'Invalid or expired token', error: error.message });
    }
};



module.exports = {   loginUser,
    googleLogin,
    forgotPassword,
    resetPassword,
    sendOtp,
    verifyOtp

};



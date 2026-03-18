const bcrypt = require('bcrypt');
const User = require('../models/user');

const registerUser = async (req, res) => {
    try {
        const {
            full_name,
            email,
            phone,
            password,
            address,
            date_of_birth,
            account_type // <-- New field
        } = req.body;

        if (!full_name || !email || !phone || !password || !account_type) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        const validTypes = ['buyer', 'seller', 'author'];
        if (!validTypes.includes(account_type)) {
            return res.status(400).json({ message: 'Invalid account type' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await User.create({
            full_name,
            email,
            phone,
            password: hashedPassword,
            address,
            date_of_birth,
            profile_image: req.file ? req.file.filename : null,
            account_type, // <-- Save it
        });

        res.status(201).json({ message: 'User registered successfully', user: newUser });
    } catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({ message: 'Email or phone already exists' });
        }
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};


const changePassword = async (req, res) => {
    try {
        const { oldPassword, newPassword, phone } = req.body;
        const userId = req.user.id; // `req.user` is set by the auth middleware

        if (!oldPassword || !newPassword) {
            return res.status(400).json({ message: 'Old and new passwords are required' });
        }

        // Find user by ID
        const user = await User.findByPk(userId);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // If phone was sent, verify it matches user's phone
        if (phone && user.phone !== phone) {
            return res.status(400).json({ message: 'Phone number does not match' });
        }

        // Check old password
        const isMatch = await bcrypt.compare(oldPassword, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Incorrect old password' });
        }

        // Hash new password
        const hashedNewPassword = await bcrypt.hash(newPassword, 10);

        // Update password
        user.password = hashedNewPassword;
        await user.save();

        return res.status(200).json({ message: 'Password changed successfully' });

    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

module.exports = { registerUser,
changePassword,
};

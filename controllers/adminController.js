const bcrypt = require('bcrypt');
const User = require('../models/user');

// ✅ Add a new admin
const addAdmin = async (req, res) => {
    try {
        const { full_name, email, phone, password } = req.body;

        if (!full_name || !email || !phone || !password) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        const existing = await User.findOne({ where: { email } });
        if (existing) {
            return res.status(409).json({ message: 'Admin with this email already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newAdmin = await User.create({
            full_name,
            email,
            phone,
            password: hashedPassword,
            role: 'admin',
        });

        const { password: _, ...adminData } = newAdmin.toJSON();
        return res.status(201).json({ message: 'Admin created', admin: adminData });
    } catch (err) {
        console.error('🔥 Error creating admin:', err);
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
};

// ✅ Get all admins
const getAllAdmins = async (req, res) => {
    try {
        const admins = await User.findAll({
            where: { role: 'admin' },
            attributes: { exclude: ['password'] }
        });

        return res.status(200).json({ admins });
    } catch (err) {
        console.error('🔥 Error fetching admins:', err);
        return res.status(500).json({ message: 'Server error' });
    }
};

// ✅ Delete an admin
const deleteAdmin = async (req, res) => {
    try {
        const { id } = req.params;

        const admin = await User.findOne({ where: { id, role: 'admin' } });
        if (!admin) {
            return res.status(404).json({ message: 'Admin not found' });
        }

        await admin.destroy();
        return res.status(200).json({ message: 'Admin deleted' });
    } catch (err) {
        console.error('🔥 Error deleting admin:', err);
        return res.status(500).json({ message: 'Server error' });
    }
};

module.exports = {
    addAdmin,
    getAllAdmins,
    deleteAdmin,
};

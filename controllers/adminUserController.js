const { Sequelize } = require('sequelize');
const User = require('../models/user');
const BlockedUser = require('../models/BlockedUser');

// ✅ View all users (non-admin)
const getUsers = async (req, res) => {
    try {
        const users = await User.findAll({
            where: { role: 'user' },
            attributes: {
                exclude: ['password'],
                include: [
                    [Sequelize.col('createdAt'), 'created_at'],
                    [Sequelize.col('updatedAt'), 'updated_at'],
                ],
            },
            order: [['createdAt', 'DESC']],
        });
        res.status(200).json({ users });
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};

// ✅ Block user
const blockUser = async (req, res) => {
    try {
        const { id } = req.params;
        const user = await User.findOne({ where: { id, role: 'user' } });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        await BlockedUser.create({
            user_id: user.id,
            full_name: user.full_name,
            email: user.email,
            phone: user.phone,
            reason: 'Blocked by admin',
        });

        await user.destroy(); // Or set is_active = false if soft-delete preferred

        res.status(200).json({ message: 'User blocked successfully' });
    } catch (err) {
        res.status(500).json({ message: 'Error blocking user', error: err.message });
    }
};

// ✅ View all blocked users
const getBlockedUsers = async (req, res) => {
    try {
        const blocked = await BlockedUser.findAll();
        res.status(200).json({ blocked_users: blocked });
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
};

module.exports = {
    getUsers,
    blockUser,
    getBlockedUsers,
};

const express = require('express');
const { Notification } = require('../models');
const { authenticate } = require('../middleware/auth');
const {
    registerDeviceToken,
    unregisterDeviceToken,
} = require('../services/pushNotificationService');

const router = express.Router();

router.post('/device-token', authenticate, async (req, res) => {
    const { token, platform } = req.body;
    const normalizedToken = String(token || '').trim();

    if (!normalizedToken) {
        return res.status(400).json({ message: 'Device token is required' });
    }

    try {
        const tokens = await registerDeviceToken(req.user.id, normalizedToken, platform);
        return res.json({
            message: 'Device token registered successfully',
            tokens_count: tokens.length,
        });
    } catch (error) {
        console.error('Error registering device token:', error.message);
        return res.status(500).json({ error: 'Failed to register device token.' });
    }
});

router.delete('/device-token', authenticate, async (req, res) => {
    const normalizedToken = String(req.body?.token || '').trim();

    try {
        const tokens = await unregisterDeviceToken(req.user.id, normalizedToken);
        return res.json({
            message: 'Device token removed successfully',
            tokens_count: tokens.length,
        });
    } catch (error) {
        console.error('Error removing device token:', error.message);
        return res.status(500).json({ error: 'Failed to remove device token.' });
    }
});

router.patch('/:userId/read-all', async (req, res) => {
    const { userId } = req.params;

    try {
        await Notification.update(
            { is_read: true },
            {
                where: {
                    user_id: userId,
                    is_read: false,
                },
            }
        );

        return res.json({ message: 'Notifications marked as read' });
    } catch (err) {
        console.error('Error marking notifications as read:', err.message);
        return res.status(500).json({ error: 'Failed to update notifications.' });
    }
});

router.get('/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
        const notifs = await Notification.findAll({
            where: { user_id: userId },
            order: [['created_at', 'DESC']],
        });

        const serialized = notifs.map((notification) => {
            const item = notification.toJSON ? notification.toJSON() : notification;
            let metadata = item.metadata;

            if (typeof metadata === 'string' && metadata.trim()) {
                try {
                    metadata = JSON.parse(metadata);
                } catch (_) {}
            }

            return {
                ...item,
                metadata,
            };
        });

        res.json(serialized);
    } catch (err) {
        console.error('Error fetching notifications:', err.message);
        res.status(500).json({ error: 'Failed to fetch notifications.' });
    }
});

module.exports = router;

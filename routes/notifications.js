// routes/notifications.js
const express = require('express');
const { Notification } = require('../models');
const router = express.Router();

router.get('/:userId', async (req, res) => {
    const { userId } = req.params;

    console.log("📨 Notification fetch request received for user ID:", userId);

    try {
        const notifs = await Notification.findAll({
            where: { user_id: userId },
            order: [['created_at', 'DESC']],
        });

        console.log("✅ Notifications found:", notifs.length);
        console.log("📦 First notification sample:", notifs[0] || "No notifications");

        res.json(notifs);
    } catch (err) {
        console.error("❌ Error fetching notifications:", err.message);
        console.error("📛 Full error stack:", err);
        res.status(500).json({ error: "Failed to fetch notifications." });
    }
});

module.exports = router;

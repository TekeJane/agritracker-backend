// utils/notifyUser.js
const { Notification } = require('../models');

async function notifyUser(userId, title, message, type = 'order') {
    try {
        await Notification.create({
            user_id: userId,
            title,
            message,
            type,
        });
        console.log(`📢 Notification sent to user ${userId}`);
    } catch (err) {
        console.error("Failed to send notification:", err);
    }
}

module.exports = notifyUser;

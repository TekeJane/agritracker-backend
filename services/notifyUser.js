const { Notification } = require('../models');
const { sendPushNotification } = require('./pushNotificationService');

async function notifyUser(userId, title, message, type = 'order', metadata = {}) {
    try {
        const normalizedMetadata =
            metadata && Object.keys(metadata).length ? metadata : null;

        await Notification.create({
            user_id: userId,
            title,
            message,
            type,
            metadata: normalizedMetadata ? JSON.stringify(normalizedMetadata) : null,
        });

        await sendPushNotification(userId, {
            title,
            body: message,
            data: {
                type,
                ...(normalizedMetadata || {}),
            },
        });

        console.log(`Notification sent to user ${userId}`);
    } catch (err) {
        console.error('Failed to send notification:', err);
    }
}

module.exports = notifyUser;

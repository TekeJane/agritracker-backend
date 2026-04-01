const { User } = require('../models');

let firebaseAdminInstance = null;

function normalizePrivateKey(rawKey) {
    return rawKey ? rawKey.replace(/\\n/g, '\n') : null;
}

function getFirebaseConfig() {
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.FCM_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || process.env.FCM_CLIENT_EMAIL;
    const privateKey = normalizePrivateKey(
        process.env.FIREBASE_PRIVATE_KEY || process.env.FCM_PRIVATE_KEY
    );

    if (!projectId || !clientEmail || !privateKey) {
        return null;
    }

    return { projectId, clientEmail, privateKey };
}

function getFirebaseAdmin() {
    if (firebaseAdminInstance) {
        return firebaseAdminInstance;
    }

    let admin;
    try {
        admin = require('firebase-admin');
    } catch (error) {
        console.warn('Push notifications disabled: firebase-admin package is missing.');
        return null;
    }

    const config = getFirebaseConfig();
    if (!config) {
        console.warn('Push notifications disabled: Firebase service account variables are not configured.');
        return null;
    }

    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: config.projectId,
                clientEmail: config.clientEmail,
                privateKey: config.privateKey,
            }),
        });
    }

    firebaseAdminInstance = admin;
    return firebaseAdminInstance;
}

function normalizeTokenList(rawValue) {
    if (!rawValue) {
        return [];
    }

    if (Array.isArray(rawValue)) {
        return rawValue
            .map((token) => String(token || '').trim())
            .filter(Boolean);
    }

    if (typeof rawValue === 'string') {
        try {
            const parsed = JSON.parse(rawValue);
            return normalizeTokenList(parsed);
        } catch (_) {
            return rawValue
                .split(',')
                .map((token) => token.trim())
                .filter(Boolean);
        }
    }

    return [];
}

function dedupeTokens(tokens) {
    return [...new Set(tokens.map((token) => token.trim()).filter(Boolean))];
}

async function saveUserPushTokens(user, tokens, platform = null) {
    const normalizedTokens = dedupeTokens(tokens);
    user.push_tokens = normalizedTokens.length ? JSON.stringify(normalizedTokens) : null;
    if (platform) {
        user.last_push_platform = platform;
    }
    await user.save();
    return normalizedTokens;
}

async function registerDeviceToken(userId, deviceToken, platform = null) {
    const normalizedToken = String(deviceToken || '').trim();
    if (!normalizedToken) {
        return [];
    }

    const user = await User.findByPk(userId);
    if (!user) {
        return [];
    }

    const nextTokens = dedupeTokens([
        ...normalizeTokenList(user.push_tokens),
        normalizedToken,
    ]).slice(-10);

    return saveUserPushTokens(user, nextTokens, platform);
}

async function unregisterDeviceToken(userId, deviceToken) {
    const normalizedToken = String(deviceToken || '').trim();
    const user = await User.findByPk(userId);
    if (!user) {
        return [];
    }

    const nextTokens = normalizeTokenList(user.push_tokens).filter(
        (token) => token !== normalizedToken
    );

    return saveUserPushTokens(user, nextTokens);
}

async function sendPushNotification(userId, payload = {}) {
    const admin = getFirebaseAdmin();
    if (!admin) {
        return { sent: false, reason: 'not_configured' };
    }

    const user = await User.findByPk(userId);
    if (!user) {
        return { sent: false, reason: 'user_not_found' };
    }

    const tokens = normalizeTokenList(user.push_tokens);
    if (!tokens.length) {
        return { sent: false, reason: 'no_device_token' };
    }

    const data = Object.entries(payload.data || {}).reduce((acc, [key, value]) => {
        if (value == null) {
            return acc;
        }
        acc[key] = String(value);
        return acc;
    }, {});

    const message = {
        tokens,
        notification: {
            title: payload.title || 'AgriTracker',
            body: payload.body || '',
        },
        data,
        android: {
            priority: 'high',
            notification: {
                channelId: 'agritracker_high_priority',
                sound: 'default',
            },
        },
        apns: {
            payload: {
                aps: {
                    sound: 'default',
                    badge: 1,
                },
            },
        },
    };

    try {
        const response = await admin.messaging().sendEachForMulticast(message);
        const invalidTokens = [];

        response.responses.forEach((entry, index) => {
            if (entry.success) {
                return;
            }

            const code = entry.error?.code || '';
            if (
                code === 'messaging/invalid-registration-token' ||
                code === 'messaging/registration-token-not-registered'
            ) {
                invalidTokens.push(tokens[index]);
            }

            console.warn(`Push send failed for user ${userId}:`, code || entry.error?.message);
        });

        if (invalidTokens.length) {
            const nextTokens = tokens.filter((token) => !invalidTokens.includes(token));
            await saveUserPushTokens(user, nextTokens);
        }

        return {
            sent: response.successCount > 0,
            successCount: response.successCount,
            failureCount: response.failureCount,
        };
    } catch (error) {
        console.error(`Push send error for user ${userId}:`, error.message);
        return { sent: false, reason: error.message };
    }
}

module.exports = {
    registerDeviceToken,
    unregisterDeviceToken,
    sendPushNotification,
    normalizeTokenList,
};

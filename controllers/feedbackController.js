const nodemailer = require('nodemailer');
const { Feedback } = require('../models');

const companyFeedbackEmail =
    process.env.COMPANY_FEEDBACK_EMAIL || 'officialagritracker@gmail.com';

function buildTransporter() {
    const user = process.env.EMAIL_USER || process.env.SMTP_USER;
    const pass = process.env.EMAIL_PASSWORD || process.env.SMTP_PASS;

    if (!user || !pass) {
        throw new Error('Feedback email is not configured on the server');
    }

    return nodemailer.createTransport({
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: Number(process.env.EMAIL_PORT || 587),
        secure: String(process.env.EMAIL_SECURE || 'false').toLowerCase() === 'true',
        auth: { user, pass },
    });
}

async function sendFeedbackEmail({ type, message, rating, contact_info }) {
    const transporter = buildTransporter();
    const sender = process.env.EMAIL_USER || process.env.SMTP_USER;

    await transporter.sendMail({
        from: sender,
        to: companyFeedbackEmail,
        replyTo: contact_info,
        subject: `AgriTracker Feedback: ${type}`,
        text: [
            `Feedback Type: ${type}`,
            `Rating: ${rating ?? 'N/A'}`,
            `Contact Info: ${contact_info}`,
            '',
            'Message:',
            message,
        ].join('\n'),
        html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
                <h2 style="color: #2e7d32;">New AgriTracker Feedback</h2>
                <p><strong>Type:</strong> ${type}</p>
                <p><strong>Rating:</strong> ${rating ?? 'N/A'}</p>
                <p><strong>Contact Info:</strong> ${contact_info}</p>
                <p><strong>Message:</strong></p>
                <div style="padding: 12px; background: #f3f4f6; border-radius: 8px; white-space: pre-wrap;">${message}</div>
            </div>
        `,
    });
}

exports.submitFeedback = async (req, res) => {
    try {
        const { type, message, rating, contact_info } = req.body;

        if (!type || !message || !contact_info) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        await Feedback.create({ type, message, rating, contact_info });
        await sendFeedbackEmail({ type, message, rating, contact_info });

        return res.status(200).json({
            message: 'Feedback submitted successfully',
            deliveredTo: companyFeedbackEmail,
        });
    } catch (err) {
        console.error('Feedback submission error:', err);
        return res.status(500).json({
            error: err.message || 'Server error',
        });
    }
};

const nodemailer = require('nodemailer');
const { Feedback } = require('../models');

const companyFeedbackEmail =
    process.env.COMPANY_FEEDBACK_EMAIL || 'officialagritracker@gmail.com';

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

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
    const trimmedContact = String(contact_info || '').trim();
    const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedContact);

    const mailOptions = {
        from: sender,
        to: companyFeedbackEmail,
        subject: `AgriTracker Feedback: ${type}`,
        text: [
            'Hello AgriTracker Team,',
            '',
            'A new feedback message has been received from the app.',
            '',
            `Feedback Type: ${type}`,
            `Rating: ${rating ?? 'N/A'}/5`,
            `Contact Info: ${contact_info}`,
            '',
            'Message',
            `${message}`,
            '',
            'Regards,',
            'AgriTracker App',
        ].join('\n'),
        html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937;">
                <h2 style="color: #2e7d32;">New AgriTracker Feedback</h2>
                <p>Hello AgriTracker Team,</p>
                <p>A new feedback message has been received from the app.</p>
                <table style="border-collapse: collapse; width: 100%; margin: 20px 0;">
                    <tr>
                        <td style="padding: 8px 0; font-weight: 700; width: 140px;">Feedback Type</td>
                        <td style="padding: 8px 0;">${escapeHtml(type)}</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 0; font-weight: 700;">Rating</td>
                        <td style="padding: 8px 0;">${escapeHtml(rating ?? 'N/A')}/5</td>
                    </tr>
                    <tr>
                        <td style="padding: 8px 0; font-weight: 700;">Contact Info</td>
                        <td style="padding: 8px 0;">${escapeHtml(contact_info)}</td>
                    </tr>
                </table>
                <p style="margin-bottom: 8px; font-weight: 700;">Message</p>
                <div style="padding: 14px; background: #f3f4f6; border-radius: 10px; white-space: pre-wrap;">${escapeHtml(message)}</div>
                <p style="margin-top: 20px;">Regards,<br/>AgriTracker App</p>
            </div>
        `,
    };

    if (looksLikeEmail) {
        mailOptions.replyTo = trimmedContact;
    }

    await transporter.sendMail(mailOptions);
}

exports.submitFeedback = async (req, res) => {
    try {
        const { type, message, rating, contact_info } = req.body;

        if (!type || !message || !contact_info) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        await Feedback.create({ type, message, rating, contact_info });

        try {
            await sendFeedbackEmail({ type, message, rating, contact_info });
        } catch (mailError) {
            console.error('Feedback email delivery error:', mailError);
            return res.status(202).json({
                message: 'Feedback saved. Email delivery needs user confirmation.',
                deliveredTo: companyFeedbackEmail,
                openEmailFallback: true,
                warning: mailError.message || 'Email delivery failed',
            });
        }

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

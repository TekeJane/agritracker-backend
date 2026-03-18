const { Feedback } = require('../models');

exports.submitFeedback = async (req, res) => {
    try {
        const { type, message, rating, contact_info } = req.body;

        if (!type || !message || !contact_info) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        await Feedback.create({ type, message, rating, contact_info });

        return res.status(200).json({ message: 'Feedback submitted successfully' });
    } catch (err) {
        console.error('Feedback submission error:', err);
        return res.status(500).json({ error: 'Server error' });
    }
};

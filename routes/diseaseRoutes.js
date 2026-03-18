const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();
const upload = multer({ dest: 'uploads/disease/' });

// Minimal handler to avoid 404 and return structured data expected by mobile app
router.post('/detect-plant-disease', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'Image file is required under field "image".' });
        }

        // TODO: integrate real model; for now return a safe fallback response
        const fallback = {
            diseases: [
                {
                    name: 'Unknown Disease',
                    probability: 0.35,
                    treatment: {
                        chemical: 'Consult local agronomist; apply broad-spectrum fungicide if fungal symptoms are visible.',
                        biological: 'Improve drainage and remove affected leaves to reduce spread.',
                    },
                },
            ],
            mostProbableDisease: {
                name: 'Unknown Disease',
                probability: 0.35,
            },
        };

        res.json(fallback);
    } catch (err) {
        console.error('Disease detection error:', err);
        res.status(500).json({ message: 'Failed to process image' });
    } finally {
        if (req.file) {
            fs.unlink(req.file.path, () => {});
        }
    }
});

module.exports = router;

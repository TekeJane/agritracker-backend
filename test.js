const axios = require('axios');

const API_KEY = 'AIzaSyDTy4E1G47plc1lctNMRc0xLxZr6kqdQhQ';

const geminiApiUrl = 'https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent';

const payload = {
    contents: [
        {
            role: 'user',
            parts: [
                { text: 'Hello Gemini, what crops grow best in Cameroon?' }
            ]
        }
    ]
};

axios
    .post(geminiApiUrl, payload, {
        headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': API_KEY
        }
    })
    .then(response => {
        console.log('✅ Gemini response:', response.data);
    })
    .catch(error => {
        console.error('❌ Gemini API error:', error.response?.data || error.message);
    });

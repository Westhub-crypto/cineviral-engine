require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

app.post('/api/process', async (req, res) => {
    const { file_id, user_id, type } = req.body;
    console.log(`🎬 New Render Request Received!`);
    
    // Tell Bots.Business we got the message
    res.status(200).json({ status: "Processing started" });

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const message = `⚙️ *Engine Update:* Node.js cloud server has successfully received your file. AI processing initiated.`;
    
    try {
        await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            chat_id: user_id,
            text: message,
            parse_mode: "Markdown"
        });
    } catch (error) {
        console.error("Error sending message back:", error.message);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 CineViral Engine running on port ${PORT}`);
});

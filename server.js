require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const FormData = require('form-data');

// Initialize the FFmpeg Engine
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
app.use(express.json());

app.post('/api/process', async (req, res) => {
    const { file_id, user_id, type } = req.body;
    res.status(200).json({ status: "Engine started" }); // Instantly reply to Bots.Business

    if (type !== "Telegram Video File") return; // For now, only process direct video uploads

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const sendMsg = async (text) => {
        await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            chat_id: user_id, text: text, parse_mode: "Markdown"
        }).catch(err => console.error(err.message));
    };

    try {
        await sendMsg("📥 *Phase 1:* Locating media file on Telegram servers...");

        // 1. Get the actual download link from Telegram
        const fileRes = await axios.get(`https://api.telegram.org/bot${botToken}/getFile?file_id=${file_id}`);
        const filePath = fileRes.data.result.file_path;
        const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;

        // 2. Download the video to the cloud server's temporary storage
        const inputPath = path.join(os.tmpdir(), `${file_id}_input.mp4`);
        const outputPath = path.join(os.tmpdir(), `${file_id}_output.mp4`);
        
        const writer = fs.createWriteStream(inputPath);
        const downloadStream = await axios({ url: downloadUrl, method: 'GET', responseType: 'stream' });
        downloadStream.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        await sendMsg("✂️ *Phase 2:* Media secured. Initializing FFmpeg to crop 9:16 vertical ratio...");

        // 3. Process the video (Crop exactly to the center, keeping height, adjusting width)
        await new Promise((resolve, reject) => {
            ffmpeg(inputPath)
                .videoFilters('crop=ih*(9/16):ih') // The magic 9:16 math
                .outputOptions('-c:a copy') // Copy audio without losing quality
                .save(outputPath)
                .on('end', resolve)
                .on('error', reject);
        });

        await sendMsg("📤 *Phase 3:* Render complete. Uploading payload...");

        // 4. Send the new viral video back to the user
        const formData = new FormData();
        formData.append('chat_id', user_id);
        formData.append('video', fs.createReadStream(outputPath));
        formData.append('caption', "🎬 *CineViral Cut Complete*\n⚡ _Ratio:_ 9:16 Optimized\n💎 _Pro Tier removes watermarks._");
        formData.append('parse_mode', 'Markdown');

        await axios.post(`https://api.telegram.org/bot${botToken}/sendVideo`, formData, {
            headers: formData.getHeaders()
        });

        // 5. Clean up the server (Delete the files so we don't run out of memory)
        fs.unlinkSync(inputPath);
        fs.unlinkSync(outputPath);

    } catch (error) {
        console.error(error);
        await sendMsg("⚠️ *Engine Error:* The matrix failed to process this video. Ensure it is a valid MP4 file.");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 CineViral Engine running on port ${PORT}`);
});

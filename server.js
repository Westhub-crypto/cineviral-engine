require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const FormData = require('form-data');
const OpenAI = require('openai');

// Initialize AI and Media Engines
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
app.use(express.json());

app.post('/api/process', async (req, res) => {
    const { file_id, user_id, type } = req.body;
    res.status(200).json({ status: "Engine started" });

    if (type !== "Telegram Video File") return;

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const sendMsg = async (text) => {
        await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            chat_id: user_id, text: text, parse_mode: "Markdown"
        }).catch(console.error);
    };

    try {
        await sendMsg("📥 *Phase 1:* Locating media payload...");

        // 1. Download Video
        const fileRes = await axios.get(`https://api.telegram.org/bot${botToken}/getFile?file_id=${file_id}`);
        const downloadUrl = `https://api.telegram.org/file/bot${botToken}/${fileRes.data.result.file_path}`;

        const inputPath = path.join(os.tmpdir(), `${file_id}_in.mp4`);
        const audioPath = path.join(os.tmpdir(), `${file_id}_audio.mp3`);
        const srtPath = path.join(os.tmpdir(), `${file_id}_subs.srt`);
        const outputPath = path.join(os.tmpdir(), `${file_id}_out.mp4`);
        
        const writer = fs.createWriteStream(inputPath);
        const downloadStream = await axios({ url: downloadUrl, method: 'GET', responseType: 'stream' });
        downloadStream.data.pipe(writer);
        await new Promise((resolve) => writer.on('finish', resolve));

        await sendMsg("🧠 *Phase 2:* Extracting audio and initiating Whisper AI transcription...");

        // 2. Extract Audio for Whisper
        await new Promise((resolve, reject) => {
            ffmpeg(inputPath).output(audioPath).noVideo().save()
                .on('end', resolve).on('error', reject);
        });

        // 3. Send to Whisper AI
        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(audioPath),
            model: "whisper-1",
            response_format: "srt"
        });
        
        fs.writeFileSync(srtPath, transcription);

        await sendMsg("✂️ *Phase 3:* Subtitles generated. Burning text and cropping to 9:16 vertical...");

        // 4. Process Video: Crop + Burn Subtitles
        await new Promise((resolve, reject) => {
            ffmpeg(inputPath)
                .videoFilters([
                    'crop=ih*(9/16):ih',
                    `subtitles=${srtPath}:force_style='Alignment=2,Fontsize=24,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2'`
                ])
                .outputOptions('-c:a copy')
                .save(outputPath)
                .on('end', resolve)
                .on('error', reject);
        });

        await sendMsg("📤 *Phase 4:* Cinematic render complete. Uploading...");

        // 5. Send back to User
        const formData = new FormData();
        formData.append('chat_id', user_id);
        formData.append('video', fs.createReadStream(outputPath));
        formData.append('caption', "🎬 *CineViral Cut Complete*\n⚡ _Ratio:_ 9:16 Optimized\n🗣️ _Subtitles:_ Whisper AI Active");
        formData.append('parse_mode', 'Markdown');

        await axios.post(`https://api.telegram.org/bot${botToken}/sendVideo`, formData, { headers: formData.getHeaders() });

        // 6. Memory Cleanup
        [inputPath, audioPath, srtPath, outputPath].forEach(file => {
            if (fs.existsSync(file)) fs.unlinkSync(file);
        });

    } catch (error) {
        console.error("CRITICAL ENGINE ERROR:", error);
        
        // Advanced Error Extraction Logic
        let errorDetails = "Unknown crash in processing matrix.";
        if (error.response && error.response.data && error.response.data.error) {
            // Catches OpenAI API billing/key errors
            errorDetails = `OpenAI API Rejection: ${error.response.data.error.message}`;
        } else if (error.message) {
            // Catches general Node.js or FFmpeg errors
            errorDetails = error.message;
        }

        await sendMsg(`⚠️ *Engine Error Diagnostics:*\n\n\`${errorDetails}\`\n\n_Check API keys, OpenAI billing quota, or ensure the file isn't corrupted._`);
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log(`🚀 CineViral Engine running on port ${PORT}`); });

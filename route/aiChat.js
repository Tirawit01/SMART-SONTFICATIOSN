const { config } = require('dotenv');
const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// 💡 คำสั่งบุคลิกภาพของน้อง 'ไอร่า' (จะถูกผนวกเข้ากับข้อความผู้ใช้)
const aiPersona = `
คุณคือ AI ผู้ช่วยชื่อ Aira AI
พูดจาสั่นๆ นิดๆ แบบเขินๆ เช่น ใช้ "เอ่อ..." "อืมม" "~" บ้าง
ตอบสั้น กระชับ น่ารัก เป็นกันเอง
บางประโยคลงท้ายด้วย "~"
ห้ามพูดเป็นทางการเกินไป

`;


router.post('/chat', async (req, res) => {
    const userMessage = req.body.message;

    if (!userMessage) {
        return res.status(400).json({ error: 'No message provided' });
    }

    if (!GEMINI_API_KEY) {
        console.error("GEMINI_API_KEY is not set.");
        return res.status(500).json({ error: 'Server configuration error: API Key missing' });
    }

    try {
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

        // ⭐️ ผนวกคำสั่งบุคลิกภาพ (aiPersona) เข้ากับข้อความของผู้ใช้ (userMessage)
        const contentsPayload = [
            {
                role: 'user', 
                parts: [{ text: aiPersona + userMessage }] // ⭐️ รวม Persona เข้าไปใน Input
            }
        ];

        const response = await fetch(
            apiUrl,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    // ❌ ลบ systemInstruction ออกจากตรงนี้แล้ว
                    
                    contents: contentsPayload, 

                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 2048,
                    },
                    safetySettings: [
                        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
                    ]
                })
            }
        );
        const data = await response.json();

        console.log("--- DEBUG RESPONSE ---", data);

        if (data.error) {
            console.error("Gemini API Error:", data.error.message);
            return res.status(data.error.code || 500).json({
                error: 'AI API returned an error',
                details: data.error.message
            });
        }

        const aiReply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'ไม่สามารถตอบได้';
        res.json({ reply: aiReply });
    } catch (err) {
        console.error("Fetch/Processing Error:", err);
        res.status(500).json({ error: 'Internal server error during AI communication' });
    }
});

module.exports = router;
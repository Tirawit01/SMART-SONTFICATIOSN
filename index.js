require('dotenv').config();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const chalk = require('chalk');
const _ = require('lodash');
const { EmbedBuilder } = require('discord.js');

const { log, banner } = require('./logger');
const { saveTemperature } = require('./temperatureStore');

// ===== สร้าง app ก่อน =====
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// ===== require router =====

const aiChat = require('./route/aiChat');
const analysisRoute = require('./route/analysis');

// ===== middleware =====
app.use(express.json());

// ===== routes =====
app.use('/api/ai', aiChat);
app.use('/api/analysis', analysisRoute);


require('./bot');

// =================== ตัวแปร Global ===================
let latestData = { temperature: 0, humidity: 0, smoke: 0, time: new Date() };
let lastAlertTime = 0;
const ALERT_COOLDOWN = 60 * 1000; // 1 minute

// =================== Middleware ===================
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use('/data', express.static(path.join(__dirname, 'data')));

// =================== ฟังก์ชันการจัดการไฟล์ ===================

const loadConfig = () => {
    try {
        const rawConfig = fs.readFileSync('config.json');
        const config = JSON.parse(rawConfig);
        log('โหลด config.json สำเร็จ', 'success');
        return config
    } catch (e) {
        log('ไม่พบ config.json หรืออ่านไม่ได้, ใช้ค่าเริ่มต้น', 'warn');
        return {}; 
    }
}

// =================== Routes หลัก ===================

// Routes ที่ใช้ Express Router Modules
app.use('/api', aiChat);
app.use('/api', analysisRoute);

// API: ดึง config
app.get('/api/config', (req, res) => {
    log('API /api/config ถูกเรียก', 'info');
    const config = loadConfig();
    res.json(config);
});

// API: บันทึก config
app.post('/api/config', (req, res) => {
    const config = req.body; 
    try {
        fs.writeFileSync('config.json', JSON.stringify(config, null, 2));
        log('บันทึก config.json สำเร็จ', 'success');
        res.sendStatus(200);
    } catch (e) {
        log('บันทึก config.json ผิดพลาด: ' + e.message, 'error');
        res.status(500).json({ error: 'บันทึก config ผิดพลาด' });
    }
});

// API: ดึง data.json (ข้อมูลล่าสุด)
app.get('/api/data', (req, res) => {
    try {
        const rawData = fs.readFileSync('data.json', 'utf8');
        const data = JSON.parse(rawData);
        res.json(data);
    } catch (err) {
        console.error('อ่านไฟล์ data.json ผิดพลาด:', err.message);
        if (err.code === 'ENOENT') {
             return res.json({}); 
        }
        res.status(500).json({ error: 'ไม่สามารถโหลดข้อมูลได้' });
    }
});

// API: ดึงข้อมูลอุณหภูมิปัจจุบันจากเส้นทางที่เคย require (แก้ไขเป็น GET route ที่ถูกต้อง)
app.get('/api/current/temperature', (req, res) => {
    try {
        // สมมติว่าไฟล์ที่ต้องการอ่านคือ 'data/current/temperature.json'
        const filePath = path.join(__dirname, 'data', 'current', 'temperature.json');
        const rawData = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(rawData);
        log('API /api/current/temperature ถูกเรียก', 'info');
        res.json(data);
    } catch (err) {
        console.error('อ่านไฟล์ data/current/temperature ผิดพลาด:', err.message);
        // หากไฟล์ไม่มีอยู่ ให้ส่งข้อมูลว่างเปล่าหรือ 0
        if (err.code === 'ENOENT') {
             return res.json({ temperature: 0 }); 
        }
        res.status(500).json({ error: 'ไม่สามารถโหลดข้อมูลอุณหภูมิปัจจุบันได้' });
    }
});


// =================== POST /data (รวมฟังก์ชันการบันทึกและการแจ้งเตือน) ===================
app.post('/data', async (req, res) => {
    const { temperature, humidity, smoke } = req.body;

    // ตรวจสอบข้อมูล
    if (
        typeof temperature !== 'number' ||
        typeof humidity !== 'number' ||
        typeof smoke !== 'number'
    ) {
        log('ข้อมูลอุณหภูมิ ความชื้น หรือควัน ไม่ถูกต้อง', 'error');
        return res.status(400).json({ error: 'ข้อมูลอุณหภูมิ ความชื้น หรือควัน ไม่ถูกต้อง' });
    }

    // อัปเดตข้อมูลล่าสุดและส่ง Realtime
    latestData = { temperature, humidity, smoke, time: new Date() };
    io.emit('sensorData', latestData);
    log(`รับข้อมูล Temperature: ${temperature}°C, Humidity: ${humidity}%, Smoke: ${smoke}`, 'info');

    // บันทึกข้อมูลล่าสุดลง data.json
    try {
        fs.writeFileSync('data.json', JSON.stringify(latestData, null, 2), "utf8");
        log('บันทึกข้อมูลล่าสุดสำเร็จ', 'success');
    } catch (err) {
        log('บันทึกข้อมูลล่าสุดผิดพลาด: ' + err.message, 'error');
    }
    
    // เรียกใช้ฟังก์ชันบันทึก History/Log (ถ้ามี)
    saveTemperature(temperature, humidity, smoke);

    // ตรรกะการแจ้งเตือน
    const config = loadConfig();

    const isHumidityAlert = humidity > (config.humidityThreshold || Infinity);
    const isTemperatureAlert = temperature > (config.temperatureThreshold || Infinity);
    const isSmokeAlert = smoke > (config.smokeThreshold || Infinity);

    const now = Date.now();

    if ((isHumidityAlert || isTemperatureAlert || isSmokeAlert) && (now - lastAlertTime >= ALERT_COOLDOWN)) {
        lastAlertTime = now;
        const discordPayload = formatAlertEmbed(humidity, temperature, smoke, config);

        try {
            if (config.notify && config.notify.discord) {
                await sendDiscord(discordPayload);
                log('ส่งแจ้งเตือน Discord สำเร็จ', 'success');
            }

            if (config.notify && config.notify.telegram) {
                let text = `⚠️ *แจ้งเตือน! ตรวจพบค่าที่เกินกำหนด:*\n`;
                if (isHumidityAlert)
                    text += `💧 ความชื้น: ${humidity}% (เกิน ${config.humidityThreshold}%)\n`;
                if (isTemperatureAlert)
                    text += `🌡️ อุณหภูมิ: ${temperature}°C (เกิน ${config.temperatureThreshold}°C)\n`;
                if (isSmokeAlert)
                    text += `🔥 ควัน: ${smoke} (เกิน ${config.smokeThreshold})\n`;
                text += `\n🕒 เวลา: ${new Date().toLocaleString()}`;
                await sendTelegram(text);
                log('ส่งแจ้งเตือน Telegram สำเร็จ', 'success');
            }

            if (config.notify && config.notify.line) {
                let msg = `⚠️ แจ้งเตือน:\n`;
                if (isHumidityAlert)
                    msg += `💧 ความชื้น: ${humidity}% (เกิน ${config.humidityThreshold}%)\n`;
                if (isTemperatureAlert)
                    msg += `🌡️ อุณหภูมิ: ${temperature}°C (เกิน ${config.temperatureThreshold}°C)\n`;
                if (isSmokeAlert)
                    msg += `🔥 ควัน: ${smoke} (เกิน ${config.smokeThreshold})\n`;
                msg += `🕒 เวลา: ${new Date().toLocaleString()}`;
                await sendLineNotify(msg);
                log('ส่งแจ้งเตือน LINE Notify สำเร็จ', 'success');
            }
        } catch (error) {
            log(`ส่งแจ้งเตือนผิดพลาด: ${error.message}`, 'error');
        }
    } else if (isHumidityAlert || isTemperatureAlert || isSmokeAlert) {
        log('ข้ามการส่งแจ้งเตือน เพราะยังอยู่ในช่วงหน่วงเวลา', 'warn');
    }
    
    // ตอบกลับเพื่อสิ้นสุด Request
    res.sendStatus(200);
});


function formatAlertEmbed(humidity, temperature, smoke, config) {
    const fields = [];

    if (humidity > config.humidityThreshold) {
        fields.push({
            name: "💧 ความชื้น",
            value: `${humidity}% (เกิน ${config.humidityThreshold}%)`,
            inline: true
        });
    }

    if (temperature > config.temperatureThreshold) {
        fields.push({
            name: "🌡️ อุณหภูมิ",
            value: `${temperature}°C (เกิน ${config.temperatureThreshold}°C)`,
            inline: true
        });
    }

    if (smoke > config.smokeThreshold) {
        fields.push({
            name: "🔥 ควัน",
            value: `${smoke} (เกิน ${config.smokeThreshold})`,
            inline: true
        });
    }

    return {
        embeds: [
            new EmbedBuilder()
                .setTitle('⚠️ แจ้งเตือนค่าตรวจจับเกินกำหนด')
                .setDescription('ตรวจพบค่าที่เกินกำหนดจาก **ESP32** ‼️')
                .setColor('#FF3D3D')
                .addFields(fields)
                .setThumbnail('https://cdn-icons-png.flaticon.com/512/564/564619.png')
                .setImage('https://cdn.discordapp.com/attachments/1412351757417185410/1419195520207032331/standard_6.gif?ex=68d0e053&is=68cf8ed3&hm=0cdddd74ff18c545de625336361a91f26637642d766527961de0c41e751b918b&')
                .setFooter({
                    text: `⏱ เวลาที่ตรวจพบ: ${new Date().toLocaleString()} ||@everyone||,`,
                    iconURL: 'https://cdn-icons-png.flaticon.com/512/564/564619.png'
                })
                .setTimestamp()
        ]
    };
}

// =================== การแจ้งเตือน ===================
async function sendDiscord(payload) {
    if (!process.env.DISCORD_WEBHOOK_URL) return;
    try {
        await axios.post(process.env.DISCORD_WEBHOOK_URL, payload, {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        throw new Error('ส่งแจ้งเตือน Discord ผิดพลาด: ' + error.message);
    }
}
async function sendTelegram(message) {
    const botToken = process.env.TELEGRAM_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId) {
        log('ไม่พบค่า TELEGRAM_TOKEN หรือ TELEGRAM_CHAT_ID', 'error');
        return;
    }
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    try {
        await axios.post(url, {
            chat_id: chatId,
            text: message,
        });
    } catch (error) {
        log('ส่งแจ้งเตือน Telegram ผิดพลาด: ' + error.message, 'error');
        if (error.response && error.response.data) {
            log('รายละเอียดจาก Telegram: ' + JSON.stringify(error.response.data), 'error');
        }
    }
}

async function sendLineNotify(message) {
    const lineToken = process.env.LINE_NOTIFY_TOKEN;
    const lineApi = process.env.LINE_NOTIFY_API || 'https://notify-api.line.me/api/notify';
    if (!lineToken) {
        log('ไม่พบค่า LINE_NOTIFY_TOKEN', 'error');
        return;
    }
    try {
        await axios.post(
            lineApi,
            new URLSearchParams({ message }),
            { headers: { Authorization: `Bearer ${lineToken}` } }
        );
    } catch (error) {
        log('ส่งแจ้งเตือน LINE Notify ผิดพลาด: ' + error.message, 'error');
        if (error.response && error.response.data) {
            log('รายละเอียดจาก LINE: ' + JSON.stringify(error.response.data), 'error');
        }
    }
}

// =================== 404 Handler (ต้องอยู่ท้ายสุดของ Routes) ===================
app.use((req, res, next) => {
    log(`คำขอที่ไม่พบ: ${req.method} ${req.url}`, 'warn');
    res.status(404).json({ error: 'ไม่พบเส้นทางนี้' });
});

// =================== Start Server ===================
banner();
log('เซิร์ฟเวอร์กำลังเริ่มต้น...', 'info');
log('เชื่อมต่อฐานข้อมูลสำเร็จ', 'success');

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    log(`✅ Server รันที่ http://localhost:${PORT}`, 'success');
});
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const currentFile = path.join(__dirname, '../data/current/temperature.json');

// ================= Utils =================
function safeNumber(val) {
    if (typeof val === 'string') {
        val = val.replace(/[^\d.-]/g, '');
    }
    const n = parseFloat(val);
    return isNaN(n) ? null : n;
}

function average(arr) {
    if (!arr.length) return null;
    return Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2));
}

function readData() {
    if (!fs.existsSync(currentFile)) return [];
    try {
        const raw = fs.readFileSync(currentFile, 'utf8').trim();
        return raw ? JSON.parse(raw) : [];
    } catch (err) {
        console.error('❌ อ่านไฟล์ JSON ผิดพลาด:', err.message);
        return [];
    }
}

// ================= API: Current (ล่าสุด) =================
router.get('/current/temperature', (req, res) => {
    const data = readData();

    if (!data.length) {
        return res.json({
            temperature: null,
            humidity: null,
            smoke: null
        });
    }

    const last = data[data.length - 1];

    res.json({
        temperature: safeNumber(last.temperature),
        humidity: safeNumber(last.humidity),
        smoke: safeNumber(last.smoke),
        timestamp: last.timestamp || null
    });
});

// ================= API: Analysis (ย้อนหลัง) =================
router.get('/analysis', (req, res) => {
    const data = readData();

    if (!data.length) {
        return res.json({
            status: 'error',
            message: 'ไม่มีข้อมูล'
        });
    }

    const temps   = data.map(d => safeNumber(d.temperature)).filter(v => v !== null);
    const hums    = data.map(d => safeNumber(d.humidity)).filter(v => v !== null);
    const smokes  = data.map(d => safeNumber(d.smoke)).filter(v => v !== null);

    res.json({
        status: 'ok',
        count: data.length,
        data: data,
        avg_temperature: average(temps),
        avg_humidity: average(hums),
        avg_smoke: average(smokes)
    });
});

module.exports = router;

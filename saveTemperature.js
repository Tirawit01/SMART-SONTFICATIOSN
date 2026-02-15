const fs = require('fs');
const path = require('path');
const { log } = require('./logger');

const baseDir = path.join(__dirname, 'DATA');
const currentDir = path.join(baseDir, 'current');
const archiveDir = path.join(baseDir, 'archive', 'temperature');

// สร้างโฟลเดอร์ถ้ายังไม่มี
[currentDir, archiveDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const currentFile = path.join(currentDir, 'temperature.json');

function saveTemperature(temp, humidity, smoke) {
  const entry = {
    timestamp: new Date().toISOString(),
    temperature: temp,
    humidity: humidity,
    smoke: smoke
  };

  // ====== บันทึก current ======
  let records = [];
  if (fs.existsSync(currentFile)) {
    try {
      records = JSON.parse(fs.readFileSync(currentFile, 'utf8'));
    } catch {
      console.error('❌ ไฟล์ temperature.json เสียหาย ล้างใหม่');
      records = [];
    }
  }

  records.push(entry);

  // จำกัดไม่เกิน 1000 records
  if (records.length > 1000) {
    records = records.slice(-1000);
  }

  fs.writeFileSync(currentFile, JSON.stringify(records, null, 2));

  // ====== บันทึก archive ======
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const archiveFile = path.join(archiveDir, `${today}.json`);

  let archiveRecords = [];
  if (fs.existsSync(archiveFile)) {
    try {
      archiveRecords = JSON.parse(fs.readFileSync(archiveFile, 'utf8'));
    } catch {
      console.error('❌ ไฟล์ archive เสียหาย ล้างใหม่');
      archiveRecords = [];
    }
  }

  archiveRecords.push(entry);
  fs.writeFileSync(archiveFile, JSON.stringify(archiveRecords, null, 2));

  log(`✅ บันทึกข้อมูล | Temp: ${temp}°C | Humidity: ${humidity}% | Smoke: ${smoke}%`, 'success');
}

module.exports = { saveTemperature };

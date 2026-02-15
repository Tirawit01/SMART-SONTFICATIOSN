const fs = require('fs');
const path = require('path');
const { log } = require('./logger');

const baseDir = path.join(__dirname, 'DATA');
const currentDir = path.join(baseDir, 'current');
const archiveDir = path.join(baseDir, 'archive', 'temperature');

[currentDir, archiveDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const currentFile = path.join(currentDir, 'temperature.json');

async function safeReadJSON(file) {
  try {
    if (!fs.existsSync(file)) return [];
    return JSON.parse(await fs.promises.readFile(file, 'utf8'));
  } catch {
    log(`⚠️ ${path.basename(file)} เสีย รีเซ็ตใหม่`, 'warn');
    return [];
  }
}

async function saveTemperature(temp, humidity, smoke) {
  const entry = {
    timestamp: new Date().toISOString(),
    temperature: temp,
    humidity,
    smoke
  };

  try {
    // ===== CURRENT =====
    let records = await safeReadJSON(currentFile);

    records.push(entry);
    records = records.slice(-1000);

    await fs.promises.writeFile(currentFile, JSON.stringify(records, null, 2));

    // ===== ARCHIVE =====
    const today = new Date().toISOString().slice(0, 10);
    const archiveFile = path.join(archiveDir, `${today}.json`);

    let archiveRecords = await safeReadJSON(archiveFile);

    archiveRecords.push(entry);

    await fs.promises.writeFile(archiveFile, JSON.stringify(archiveRecords, null, 2));

    log(`✅ Temp:${temp}°C | Hum:${humidity}% | Smoke:${smoke}%`, 'success');

  } catch (err) {
    log(`❌ Save temperature error: ${err.message}`, 'error');
  }
}

module.exports = { saveTemperature };

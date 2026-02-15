// =================== Imports & Config ===================
const { log, banner } = require('./logger'); // import logger
const fs = require('fs');
const os = require('os');
// นำเข้า Fetch API สำหรับเรียกใช้งาน Local API (ใช้ Native Fetch ใน Node.js >= 18)
const fetch = require('node-fetch');

const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    Colors, // <<< สำคัญ: เพิ่ม Colors เข้ามาเพื่อใช้ใน Embed Analyze
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    REST,
    Routes,
    SlashCommandBuilder,
    Events
} = require('discord.js');

// โหลด config
let config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));

// Constants
const TARGET_TEMP = 25.0; // อุณหภูมิเป้าหมายที่สบาย (°C)
const PREDICTION_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 ชั่วโมง
const ANALYSIS_CHANNEL = process.env.ANALYSIS_CHANNEL || process.env.ALERT_CHANNEL; // Channel สำหรับส่งการวิเคราะห์/คาดการณ์

// =================== Client ===================
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// =================== ฟังก์ชันดึง IP ===================
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const net of interfaces[name]) {
            if (net.family === 'IPv4' && !net.internal) return net.address;
        }
    }
    return '127.0.0.1'; // Fallback to localhost
}

/**
 * สร้าง Embed สำหรับการคาดการณ์อุณหภูมิและคำแนะนำปรับแอร์
 * @param {number} currentTemp อุณหภูมิปัจจุบัน
 * @param {number} predictedTemp อุณหภูมิที่คาดการณ์
 * @param {number} acChange คำแนะนำในการปรับแอร์
 */
function createPredictionEmbed(currentTemp, predictedTemp, acChange) {
    // กำหนดสีตามระดับอุณหภูมิ
    const color = predictedTemp > TARGET_TEMP + 2 ? '#ff4757' :
        predictedTemp < TARGET_TEMP - 2 ? '#1e90ff' :
            '#2ed573';

    // สร้างข้อความคำแนะนำ
    let acAdvice;
    if (acChange < -1.0) {
        acAdvice = `📈 อุณหภูมิคาดว่าจะสูงขึ้น **ลดแอร์ลง ${Math.abs(acChange).toFixed(1)}°C**\n➡️ ตั้งไปที่ ${(currentTemp + acChange).toFixed(1)}°C เพื่อความสบาย`;
    } else if (acChange > 1.0) {
        acAdvice = `📉 อุณหภูมิคาดว่าจะเย็นเกินไป **เพิ่มแอร์ขึ้น ${acChange.toFixed(1)}°C**\n➡️ ตั้งไปที่ ${(currentTemp + acChange).toFixed(1)}°C เพื่อประหยัดพลังงาน`;
    } else {
        acAdvice = '👍 อุณหภูมิอยู่ในระดับเหมาะสม **ไม่ต้องปรับแอร์**';
    }

    return new EmbedBuilder()
        .setTitle('🔮 พยากรณ์อุณหภูมิ & คำแนะนำปรับแอร์ (2 ชม.)')
        .setDescription(`**🕒 เวลา ณ ปัจจุบัน:** ${new Date().toLocaleTimeString('th-TH')}\nบอทได้วิเคราะห์แนวโน้มอุณหภูมิและสภาพแวดล้อมเพื่อความสบายของคุณ`)
        .setColor(color)
        .addFields(
            { name: '🌡️ อุณหภูมิปัจจุบัน', value: `\`${currentTemp.toFixed(1)} °C\``, inline: true },
            { name: '➡️ คาดการณ์ใน 2 ชม.', value: `\`${predictedTemp.toFixed(1)} °C\``, inline: true },
            { name: '💡 คำแนะนำปรับแอร์', value: acAdvice, inline: false },
        )
        .setThumbnail('https://cdn-icons-png.flaticon.com/512/564/564619.png') // Icon Weather
        .setImage('https://cdn.discordapp.com/attachments/1412351757417185410/1419195520207032331/standard_6.gif') // GIF สวย
        .setFooter({ text: '⚡ ระบบวิเคราะห์ IoT อัตโนมัติ', iconURL: client.user.displayAvatarURL() })
        .setTimestamp();
}

/**
 * ฟังก์ชันวิเคราะห์และส่ง Embed แจ้งเตือน
 */
async function analyzeAndPredictTemperature() {
    const apiUrl = `http://localhost:3000/api/current/temperature`;
    log(`🔄 ดึงข้อมูลอุณหภูมิจาก: ${apiUrl}`, 'info');

    try {
        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const data = await response.json();
        const currentTemp = Number(data.temperature);
        if (isNaN(currentTemp)) {
            log('❌ ข้อมูลอุณหภูมิไม่ถูกต้อง', 'error');
            return;
        }

        // โมเดลคาดการณ์ง่าย
        let predictedTemp, acChange;
        if (currentTemp > 28) {
            predictedTemp = currentTemp + 0.8;
        } else if (currentTemp >= 25) {
            predictedTemp = currentTemp + 0.2;
        } else {
            predictedTemp = currentTemp - 0.5;
        }
        acChange = TARGET_TEMP - currentTemp;

        // สร้าง Embed
        const embed = createPredictionEmbed(currentTemp, predictedTemp, acChange);

        // ส่งไปยัง Discord
        const channel = await client.channels.fetch(ANALYSIS_CHANNEL);
        if (channel) {
            await channel.send({ embeds: [embed] });
            log(`✅ ส่งรายงานการคาดการณ์ ${currentTemp.toFixed(1)} -> ${predictedTemp.toFixed(1)} °C`, 'success');
        } else {
            log(`❌ ไม่พบ ANALYSIS_CHANNEL (${ANALYSIS_CHANNEL})`, 'error');
        }
    } catch (err) {
        log(`❌ ข้อผิดพลาด: ${err.message}`, 'error');
    }
}


// =================== สลับข้อความสถานะ ===================
const statusMessages = [
    () => {
        let data;
        try {
            data = JSON.parse(fs.readFileSync('./data.json', 'utf8'));
        } catch {
            data = { temperature: '❌ ไม่ทราบ', humidity: '❌ ไม่ทราบ', smoke: '❌ ไม่ทราบ' };
        }
        return `🌡️ ${data.temperature} °C | 💧 ${data.humidity} % | 🔥 ${data.smoke}`;
    },
    () => "💡 กำลังเฝ้าระวังระบบ IoT",
    () => "🔔 ตรวจสอบอุณหภูมิ ความชื้น และควัน",
    () => "💡 สามารถเช็คสถานะบนเว็ปได้โดย /dashboard  ",
    () => "📊 IoT Dashboard พร้อมใช้งาน"
];

let currentIndex = 0;

function updateBotActivity() {
    const activityMessage = statusMessages[currentIndex]();
    if (client.user) {
        client.user.setPresence({
            status: 'online',
            activities: [{ name: activityMessage, type: 3 }] // WATCHING
        });
        log(`อัปเดตสถานะข้อความ: ${activityMessage}`, 'info');
    }
    currentIndex = (currentIndex + 1) % statusMessages.length;
}

client.once('ready', async () => {
    log(`🚀 บอทล็อกอินเป็น ${client.user.tag}`, 'success');
    updateBotActivity();

    // ตั้งเวลาสำหรับสลับข้อความสถานะ (ทุก 30 วินาที)
    setInterval(updateBotActivity, 30 * 1000);

    // ============== [NEW FEATURE] เริ่มระบบวิเคราะห์อุณหภูมิทุก 2 ชั่วโมง ==============
    log(`⏰ เริ่มตั้งเวลาระบบพยากรณ์อุณหภูมิอัตโนมัติ ทุก 2 ชั่วโมง`, 'info');
    // เรียกใช้ทันทีเมื่อบอทออนไลน์
    analyzeAndPredictTemperature();
    // ตั้งเวลาการเรียกใช้ตามช่วงที่กำหนด
    setInterval(analyzeAndPredictTemperature, PREDICTION_INTERVAL_MS);
    // =================================================================================

    const STARTUP_CHANNEL = process.env.STARTUP_CHANNEL;
    if (STARTUP_CHANNEL) {
        try {
            const channel = await client.channels.fetch(STARTUP_CHANNEL);
            await channel.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('Startup Notification')
                        .setDescription('บอทกำลังออนไลน์และพร้อมใช้งานระบบ IoT Dashboard')
                        .setImage('https://cdn.discordapp.com/attachments/1412351757417185410/1418911797930496071/standard_4.gif?ex=68cfd816&is=68ce8696&hm=f15f80bcbe155654122ac491434433cf790d1ca71da9531813bc391fc2bb7216&')
                        .setColor('#ff3d3d')
                        .setThumbnail(client.user.displayAvatarURL())
                        .setTimestamp()
                ]
            });
            log('ส่งข้อความ startup channel เรียบร้อย', 'success');
        } catch (err) {
            log('❌ ไม่สามารถส่งข้อความ startup channel: ' + err, 'error');
        }
    }
});


// =================== Embed Functions ===================
function createConfigEmbed() {
    return new EmbedBuilder()
        .setTitle('🟢 IoT CONFIG PANEL')
        .setDescription(
            '**💡 ข้อมูลการแจ้งเตือนปัจจุบันของระบบ IoT**\n\n' +
            'คุณสามารถแก้ไขค่าต่าง ๆ ได้โดยการกดปุ่มด้านล่าง ⬇️\n\n' +
            '**⚡ ตัวอย่างค่า Threshold:**\n' +
            `- 🌡️ อุณหภูมิ: \`${config.temperatureThreshold} °C\`\n` +
            `- 💧 ความชื้น: \`${config.humidityThreshold} %\`\n` +
            `- 🔥 ควัน: \`${config.smoke}\``
        )
        .setColor('#00b894')
        .setImage('https://cdn.discordapp.com/attachments/1412351757417185410/1418892266201944164/standard_2.gif')
        .setFooter({ text: 'ระบบออนไลน์ | IoT Dashboard', iconURL: client.user.displayAvatarURL() })
        .setTimestamp();
}

// =================== Threshold Buttons ===================
const thresholdButtons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('edit_temperature').setLabel('แก้ไขอุณหภูมิ').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('edit_humidity').setLabel('แก้ไขความชื้น').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('edit_smoke').setLabel('แก้ไขควัน').setStyle(ButtonStyle.Primary),
);

// =================== Notify Toggle Buttons ===================
function createNotifyButtons(cfg) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('toggle_discord')
            .setLabel(`Discord: ${cfg.notify.discord ? '✅ ON' : '❌ OFF'}`)
            .setStyle(cfg.notify.discord ? ButtonStyle.Success : ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('toggle_telegram')
            .setLabel(`Telegram: ${cfg.notify.telegram ? '✅ ON' : '❌ OFF'}`)
            .setStyle(cfg.notify.telegram ? ButtonStyle.Success : ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('toggle_line')
            .setLabel(`LINE Notify: ${cfg.notify.line ? '✅ ON' : '❌ OFF'}`)
            .setStyle(cfg.notify.line ? ButtonStyle.Success : ButtonStyle.Danger)
    );
}

// =================== Modal ===================
function createConfigModal(type) {
    const modal = new ModalBuilder().setCustomId(`config_modal_${type}`).setTitle(`แก้ไข ${type}`);
    let defaultValue = '', label = '';

    switch (type) {
        case 'temperature': defaultValue = config.temperatureThreshold.toString(); label = 'อุณหภูมิ (°C)'; break;
        case 'humidity': defaultValue = config.humidityThreshold.toString(); label = 'ความชื้น (%)'; break;
        case 'smoke': defaultValue = config.smoke.toString(); label = 'ค่าควัน'; break;
    }

    const input = new TextInputBuilder()
        .setCustomId(`input_${type}`)
        .setLabel(label)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('กรอกค่าที่ต้องการแก้ไข')
        .setValue(defaultValue);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return modal;
}

// =================== Slash Commands ===================
const commands = [
    new SlashCommandBuilder().setName('status').setDescription('ดึงข้อมูลจาก data.json'),
    new SlashCommandBuilder().setName('config').setDescription('เปิดห้องคอนฟิก IoT'),
    new SlashCommandBuilder().setName('dashboard').setDescription('เปิด Dashboard พร้อม IP'),
    new SlashCommandBuilder().setName('analyze').setDescription('วิเคราะห์ข้อมูลล่าสุดจาก IoT (แบบ Manual)'),
    new SlashCommandBuilder().setName('weather').setDescription('ดึงข้อมูลสภาพอากาศปัจจุบัน '),
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
(async () => {
    try {
        log('🔄 ลงทะเบียน Slash Commands...', 'info');
        await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands });
        log('✅ ลงทะเบียน Slash Commands เรียบร้อยแล้ว', 'success');
    } catch (err) {
        log('❌ ลงทะเบียนล้มเหลว: ' + err, 'error');
    }
})();


// =================== Interaction ===================
client.on(Events.InteractionCreate, async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            // ===== /status =====
            if (interaction.commandName === 'status') {
                await interaction.deferReply();
                let data;
                try { data = JSON.parse(fs.readFileSync('./data.json', 'utf8')); }
                catch { data = { temperature: '❌ ไม่ทราบ', humidity: '❌ ไม่ทราบ', smoke: '❌ ไม่ทราบ', time: new Date().toISOString() }; }

                const embed = new EmbedBuilder()
                    .setColor(0x00ffd5)
                    .setTitle('🌐 ระบบ IoT รายงานสถานะล่าสุด')
                    .setDescription('นี่คือข้อมูลล่าสุดจากเซ็นเซอร์ของคุณ 📡\nตรวจสอบค่าต่าง ๆ ด้านล่าง 👇')
                    .addFields(
                        { name: '🌡️ อุณหภูมิ', value: `\`\`\`${data.temperature} °C\`\`\``, inline: true },
                        { name: '💧 ความชื้น', value: `\`\`\`${data.humidity} %\`\`\``, inline: true },
                        { name: '🔥 ควัน', value: `\`\`\`${data.smoke}\`\`\``, inline: true }
                    )
                    .setFooter({ text: `อัปเดตเมื่อ`, iconURL: 'https://cdn-icons-png.flaticon.com/512/2921/2921222.png' })
                    .setTimestamp(new Date(data.time))
                    .setAuthor({ name: 'IoT Dashboard', iconURL: 'https://cdn-icons-png.flaticon.com/512/2910/2910761.png' });

                await interaction.editReply({ embeds: [embed] });
                log('ส่งข้อมูล status ให้ผู้ใช้เรียบร้อย', 'success');
            }

            // ===== /config =====
            if (interaction.commandName === 'config') {
                await interaction.reply({ embeds: [createConfigEmbed()], components: [thresholdButtons, createNotifyButtons(config)] });
                log('เปิดหน้า Config ให้ผู้ใช้', 'info');
            }

            // ===== /dashboard =====
            if (interaction.commandName === 'dashboard') {
                const ip = getLocalIP();

                const embed = new EmbedBuilder()
                    .setTitle('📊 IoT Dashboard')
                    .setColor('#ff3b3b')
                    .setDescription('นี่คือสถานะของระบบ IoT ของคุณ คุณสามารถเข้าดูและตรวจสอบค่าต่าง ๆ ได้จากปุ่มด้านล่าง 👇')
                    .setThumbnail('https://cdn-icons-png.flaticon.com/512/2910/2910761.png')
                    .addFields(
                        { name: '🖥️ IP เครื่อง', value: `\`${ip}\``, inline: true },
                        { name: '🔗 URL Dashboard', value: `[คลิกเพื่อเปิด](http://${ip}:3000)`, inline: true },
                        { name: '\u200B', value: 'ตรวจสอบอุณหภูมิ 🌡️ ความชื้น 💧 และค่าควัน 🔥 แบบเรียลไทม์' }
                    )
                    .setImage('https://cdn.discordapp.com/attachments/1412351757417185410/1418906944730566656/standard_3.gif?ex=68cfd391&is=68ce8211&hm=a1aa16f15583c2166dc8409f875d82ebdfe070883e48174fe432d7636dc75419&') // แทน GIF จาก Giphy
                    .setFooter({ text: 'IoT Dashboard | ระบบออนไลน์', iconURL: client.user.displayAvatarURL() })
                    .setTimestamp();

                const button = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setLabel('🌐 เปิด Dashboard')
                        .setStyle(ButtonStyle.Link)
                        .setURL(`http://${ip}:3000`)
                );

                await interaction.reply({ embeds: [embed], components: [button] });
                log('ส่ง /dashboard ให้ผู้ใช้เรียบร้อย', 'success');
            }

            // ===== /analyze  =====
            if (interaction.commandName === 'analyze') {
                await interaction.deferReply();

                // ใช้ config ที่โหลดไว้แต่แรก (แต่ใช้ชื่อ config ใหม่เพื่อป้องกันการทับซ้อนกับ config global)
                let localConfig = {
                    temperatureThreshold: config.temperatureThreshold,
                    humidityThreshold: config.humidityThreshold,
                    smoke: config.smoke
                };

                let data;
                try {

                    const fs = require('fs');
                    data = JSON.parse(fs.readFileSync('./data.json', 'utf8'));
                } catch { // ใช้ Optional Catch Binding
                    return interaction.editReply("❌ ไม่มีข้อมูลที่สามารถวิเคราะห์ได้ หรือไฟล์ data.json เสียหาย");
                }

                // ---สร้าง EMBED วิเคราะห์ ---

                let statusColor = Colors.Green;
                let titleIcon = '✅';
                let summaryText = 'ข้อมูลเซ็นเซอร์ทั้งหมดอยู่ในระดับปกติและปลอดภัย';
                let isCritical = false;

                // ตรวจสอบสถานะความผิดปกติ
                let criticalCount = 0;
                if (data.temperature > localConfig.temperatureThreshold) criticalCount++;
                if (data.humidity > localConfig.humidityThreshold) criticalCount++;
                if (data.smoke > localConfig.smoke) criticalCount++;

                if (criticalCount === 1) {
                    statusColor = Colors.Yellow;
                    titleIcon = '⚠️';
                    summaryText = 'ตรวจพบความผิดปกติบางอย่าง โปรดตรวจสอบข้อมูลเฉพาะ';
                } else if (criticalCount >= 2) {
                    statusColor = Colors.Red;
                    titleIcon = '🚨';
                    summaryText = '⚠️ **มีสถานะผิดปกติหลายจุด! โปรดตรวจสอบทันที** ⚠️';
                    isCritical = true;
                }


                const tempStatus = data.temperature > localConfig.temperatureThreshold
                    ? `🚨 **สูงเกินกำหนด** (Threshold: ${localConfig.temperatureThreshold}°C)`
                    : `✅ **ปกติ**`;

                const humidityStatus = data.humidity > localConfig.humidityThreshold
                    ? `⚠️ **สูงเกินค่าที่กำหนด** (Threshold: ${localConfig.humidityThreshold}%)`
                    : `✅ **ปกติ**`;

                const smokeStatus = data.smoke > localConfig.smoke
                    ? `🔥 **สูงผิดปกติ!** (Threshold: >${localConfig.smoke} PPM)`
                    : `✅ **ปกติ**`;

                // --- สร้าง EMBED ---

                const analysisEmbed = new EmbedBuilder()
                    .setColor(statusColor)
                    .setTitle(`${titleIcon} ผลการวิเคราะห์ข้อมูลล่าสุด`)
                    .setDescription(summaryText)
                    .setTimestamp()
                    .setThumbnail('https://placehold.co/100x100/1e293b/ffffff?text=Analysis')
                    .setFooter({ text: isCritical ? '🚨 การแจ้งเตือนวิกฤตอัตโนมัติ' : 'การวิเคราะห์ข้อมูลตามคำขอ' });
                analysisEmbed.addFields({
                    name: `🌡️ อุณหภูมิ: ${data.temperature}°C`,
                    value: tempStatus,
                    inline: true,
                });

                // เพิ่ม Field ของความชื้น
                analysisEmbed.addFields({
                    name: `💧 ความชื้น: ${data.humidity}%`,
                    value: humidityStatus,
                    inline: true,
                });

                // เพิ่ม Field ของควัน
                analysisEmbed.addFields({
                    name: `🔥 ระดับควัน: ${data.smoke} PPM`,
                    value: smokeStatus,
                    inline: true,
                });

                // เพิ่มคำแนะนำเมื่อวิกฤต
                if (isCritical) {
                    analysisEmbed.addFields({
                        name: '❗ คำแนะนำเร่งด่วน ❗',
                        value: '**โปรดตรวจสอบพื้นที่ติดตั้งเซ็นเซอร์ทันที!**',
                        inline: false,
                    });
                }
                // --- ตอบกลับด้วย Embed แทนข้อความ (msg) ---
                interaction.editReply({ embeds: [analysisEmbed] });
                log('ส่งผลการวิเคราะห์ manual ให้ผู้ใช้', 'info');
            }
        }

        // ===== Button =====
        if (interaction.isButton()) {
            const typeMap = { edit_temperature: 'temperature', edit_humidity: 'humidity', edit_smoke: 'smoke' };
            const type = typeMap[interaction.customId];
            if (type) {
                await interaction.showModal(createConfigModal(type));
                log(`ผู้ใช้กดแก้ไข ${type}`, 'info');
            } else if (interaction.customId.startsWith('toggle_')) {
                const key = interaction.customId.replace('toggle_', '');
                config.notify[key] = !config.notify[key];
                fs.writeFileSync('./config.json', JSON.stringify(config, null, 2), 'utf8');
                await interaction.update({ components: [thresholdButtons, createNotifyButtons(config)] });
                log(`Toggle ${key} เป็น ${config.notify[key]}`, 'success');
            }
        }

        // ===== Modal Submit =====
        if (interaction.isModalSubmit()) {
            const type = interaction.customId.replace('config_modal_', '');
            const inputValue = interaction.fields.getTextInputValue(`input_${type}`);

            switch (type) {
                case 'temperature': config.temperatureThreshold = Number(inputValue); break;
                case 'humidity': config.humidityThreshold = Number(inputValue); break;
                case 'smoke': config.smoke = inputValue; break;
            }

            fs.writeFileSync('./config.json', JSON.stringify(config, null, 2), 'utf8');
            await interaction.reply({ content: `✅ แก้ไข ${type} เรียบร้อยแล้ว`, ephemeral: true });
            log(`อัปเดตค่า ${type} เป็น ${inputValue} เรียบร้อย`, 'success');
        }
    } catch (err) {
        log('เกิดข้อผิดพลาดในการจัดการ Interaction: ' + err, 'error');

    }
    // =================== Open-Meteo Weather ===================
    const OPEN_METEO_LAT = 8.43;   // นครศรีธรรมราช
    const OPEN_METEO_LON = 99.96;

    function weatherCodeToText(code) {
        const map = {
            0: "☀️ ฟ้าใส",
            1: "🌤️ แดดมีเมฆ",
            2: "⛅ เมฆบางส่วน",
            3: "☁️ เมฆมาก",
            45: "🌫️ หมอก",
            48: "🌫️ หมอกจัด",
            51: "🌦️ ฝนปรอย",
            61: "🌧️ ฝน",
            63: "🌧️ ฝนปานกลาง",
            65: "⛈️ ฝนหนัก",
            80: "🌦️ ฝนเป็นช่วง"
        };
        return map[code] || "🌈 สภาพอากาศไม่แน่ใจ";
    }

    async function fetchOpenMeteo() {
        const url =
            "https://api.open-meteo.com/v1/forecast" +
            `?latitude=${OPEN_METEO_LAT}` +
            `&longitude=${OPEN_METEO_LON}` +
            "&current=temperature_2m,relative_humidity_2m,weather_code" +
            "&timezone=Asia/Bangkok";

        const res = await fetch(url);
        if (!res.ok) throw new Error(`Open-Meteo error ${res.status}`);
        const data = await res.json();
        return data.current;
    }
    // ===== /weather (Open-Meteo) =====
    if (interaction.commandName === 'weather') {
        await interaction.deferReply();

        try {
            const w = await fetchOpenMeteo();
            const weatherText = weatherCodeToText(w.weather_code);

            // ไล่สีตามอุณหภูมิ
            const tempColor =
                w.temperature_2m >= 35 ? Colors.Red :
                    w.temperature_2m >= 30 ? Colors.Orange :
                        w.temperature_2m >= 25 ? Colors.Yellow :
                            Colors.Blue;

            const embed = new EmbedBuilder()
                .setTitle('🌍 รายงานสภาพอากาศปัจจุบัน')
                .setDescription(`📍 **จังหวัดนครศรีธรรมราช**\n${weatherText}`)
                .setColor(tempColor)
                .setThumbnail('https://cdn-icons-png.flaticon.com/512/1779/1779940.png')
                .addFields(
                    {
                        name: '🌡️ อุณหภูมิ',
                        value: `\`\`\`${w.temperature_2m} °C\`\`\``,
                        inline: true
                    },
                    {
                        name: '💧 ความชื้น',
                        value: `\`\`\`${w.relative_humidity_2m} %\`\`\``,
                        inline: true
                    },
                    {
                        name: '🕒 เวลาอัปเดต',
                        value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
                        inline: false
                    }
                )
                .setImage('https://cdn.discordapp.com/attachments/1412351757417185410/1419195520207032331/standard_6.gif')
                .setFooter({
                    text: 'Open-Meteo • Free Weather API • No API Key',
                    iconURL: client.user.displayAvatarURL()
                })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            log('🌤️ เรียก Open-Meteo สำเร็จ', 'success');

        } catch (err) {
            log(`❌ Open-Meteo ERROR: ${err.message}`, 'error');
            await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('❌ เกิดข้อผิดพลาด')
                        .setDescription('ไม่สามารถดึงข้อมูลสภาพอากาศได้ในขณะนี้')
                        .setColor(Colors.Red)
                        .setTimestamp()
                ]
            });
        }
    }


});
client.login(process.env.TOKEN);
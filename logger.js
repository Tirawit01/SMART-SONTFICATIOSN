const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

const logFilePath = path.join(__dirname, 'app.log');

function writeLogFile(text) {
  fs.appendFile(logFilePath, text + '\n', err => {
    if (err) {
      console.error(chalk.red('✖ เขียนไฟล์ log ไม่สำเร็จ:'), err);
    }
  });
}

// =================== ไล่สี ===================
function rainbowText(text) {
  const colors = [
    '#e74c3c', 
    '#e67e22', 
    '#f1c40f', 
    '#2ecc71', 
    '#3498db',
    '#9b59b6', 
    '#fd79a8' 
  ];
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const color = colors[i % colors.length];
    result += chalk.hex(color)(text[i]);
  }
  return result;
}

function log(message, level = 'info') {
  const timestamp = new Date().toISOString();
  const cleanMessage = message.toString().trim();
  let icon = 'ℹ️', label = 'INFO', color = chalk.cyan;

  switch (level.toLowerCase()) {
    case 'success': icon = '✅'; label = 'SUCCESS'; color = chalk.greenBright; break;
    case 'warn': case 'warning': icon = '⚠️'; label = 'WARNING'; color = chalk.hex('#FFA500'); break;
    case 'error': icon = '❌'; label = 'ERROR'; color = chalk.redBright; break;
    case 'debug': icon = '🔧'; label = 'DEBUG'; color = chalk.magentaBright; break;
    case 'fatal': icon = '💥'; label = 'FATAL'; color = chalk.bgRed.white.bold; break;
  }

  const logText = `[${timestamp}] ${label} ${cleanMessage}`;

  const consoleLine = `${rainbowText(`[${timestamp}]`)} ${icon} ${color(`${label}:`)} ${chalk.white(cleanMessage)}`;

  console.log(consoleLine);
  writeLogFile(logText);
}

module.exports = { log };


function banner() {
  console.log(chalk.hex('#9b59b6')(`
███████╗███╗   ███╗ █████╗ ██████╗ ████████╗    ███╗   ██╗ ██████╗ ████████╗██╗███████╗██╗ ██████╗ █████╗ ████████╗██╗ ██████╗ ███╗   ██╗███████╗██╗
██╔════╝████╗ ████║██╔══██╗██╔══██╗╚══██╔══╝    ████╗  ██║██╔═══██╗╚══██╔══╝██║██╔════╝██║██╔════╝██╔══██╗╚══██╔══╝██║██╔═══██╗████╗  ██║██╔════╝██║
███████╗██╔████╔██║███████║██████╔╝   ██║       ██╔██╗ ██║██║   ██║   ██║   ██║█████╗  ██║██║     ███████║   ██║   ██║██║   ██║██╔██╗ ██║███████╗██║
╚════██║██║╚██╔╝██║██╔══██║██╔══██╗   ██║       ██║╚██╗██║██║   ██║   ██║   ██║██╔══╝  ██║██║     ██╔══██║   ██║   ██║██║   ██║██║╚██╗██║╚════██║╚═╝
███████║██║ ╚═╝ ██║██║  ██║██║  ██║   ██║       ██║ ╚████║╚██████╔╝   ██║   ██║██║     ██║╚██████╗██║  ██║   ██║   ██║╚██████╔╝██║ ╚████║███████║██╗
╚══════╝╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝       ╚═╝  ╚═══╝ ╚═════╝    ╚═╝   ╚═╝╚═╝     ╚═╝ ╚═════╝╚═╝  ╚═╝   ╚═╝   ╚═╝ ╚═════╝ ╚═╝  ╚═══╝╚══════╝╚═╝
`));
}
module.exports = { log, banner };

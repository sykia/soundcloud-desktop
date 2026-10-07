'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');

function availableCommand(names) {
  for (const name of names) {
    for (const directory of ['/usr/bin', '/bin']) {
      const command = `${directory}/${name}`;
      if (fs.existsSync(command)) return command;
    }
  }
  throw new Error(`Не найден пакетный менеджер (${names.join(', ')}).`);
}

function packageCommand(packageType, file) {
  if (packageType === 'pacman' && file.endsWith('.pkg.tar.zst')) {
    return [availableCommand(['pacman']), ['-U', '--noconfirm', file]];
  }
  if (packageType === 'deb' && file.endsWith('.deb')) {
    return [availableCommand(['apt-get']), ['install', '-y', file]];
  }
  if (packageType === 'rpm' && file.endsWith('.rpm')) {
    if (fs.existsSync('/usr/bin/dnf')) return ['/usr/bin/dnf', ['install', '-y', '--nogpgcheck', file]];
    if (fs.existsSync('/usr/bin/zypper')) return ['/usr/bin/zypper', ['--non-interactive', '--no-refresh', 'install', '--allow-unsigned-rpm', '-f', file]];
    throw new Error('Не найден пакетный менеджер RPM (dnf или zypper).');
  }
  throw new Error('Тип скачанного пакета не совпадает с установленным приложением.');
}

function installLinuxPackage(packageType, file, run = spawn) {
  if (!file || !fs.statSync(file, { throwIfNoEntry: false })?.isFile()) {
    return Promise.reject(new Error('Скачанный пакет не найден. Загрузите обновление заново.'));
  }
  const [command, args] = packageCommand(packageType, file);
  const executable = process.getuid?.() === 0 ? command : availableCommand(['pkexec']);
  const commandArgs = executable === command ? args : [command, ...args];
  return new Promise((resolve, reject) => {
    let output = '';
    const child = run(executable, commandArgs, { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    for (const stream of [child.stdout, child.stderr]) {
      stream?.on('data', chunk => { output = (output + chunk.toString()).slice(-4096); });
    }
    child.once('error', reject);
    child.once('close', code => {
      if (code === 0) resolve();
      else reject(new Error(output.trim() || `Установка завершилась с кодом ${code}.`));
    });
  });
}

module.exports = { installLinuxPackage, packageCommand };

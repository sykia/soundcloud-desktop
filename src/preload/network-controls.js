'use strict';

// Shared behaviour of the network controls: the same fields exist once in the
// cusade panel (over an already loaded SoundCloud page) and once on the local
// network error screen (shown exactly when the site cannot be reached). This
// module only wires events and channels — labels are provided by the markup;
// status lines are generated here in the chosen language.
//
// All channels used here run through dedicated handlers in src/main/ipc.js that
// accept only the main SoundCloud page or the main process's own error screen.

const { ipcRenderer } = require('electron');
const { CHANNEL } = require('../../shared/ipc.js');

// Picks the language the caller resolved (the error screen carries it in
// <html lang>) or the cusade language the panel already knows.
function pickLanguage(language) {
  if (language) return language === 'ru' ? 'ru' : 'en';
  try {
    const { state } = require('./state.js');
    return state.appLanguage === 'ru' ? 'ru' : 'en';
  } catch {
    return 'en';
  }
}

const STRINGS = {
  loaded: {
    ru: 'Настройки загружены. Проверка соединения не выполнялась.',
    en: 'Settings loaded. No connection check has run yet.'
  },
  gapSettings: {
    ru: 'Не удалось получить сетевые настройки',
    en: 'Could not read the network settings'
  },
  invalidConfig: {
    ru: 'Сохранённая конфигурация прокси неполна — сейчас используется режим System.',
    en: 'The saved proxy configuration is incomplete — System mode is active.'
  },
  offline: {
    ru: 'Сеть недоступна для приложения.',
    en: 'The network is unavailable to the app.'
  },
  online: {
    ru: 'Сеть доступна.',
    en: 'The network is available.'
  },
  mode: { ru: 'Режим', en: 'Mode' },
  testing: { ru: 'Проверяю соединение…', en: 'Checking the connection…' },
  testDone: { ru: 'Проверка завершена.', en: 'The check has finished.' },
  testFail: { ru: 'Проверка не удалась.', en: 'The check failed.' },
  applied: { ru: 'Применено.', en: 'Applied.' },
  applyFail: { ru: 'Не удалось применить.', en: 'Could not apply.' },
  applying: { ru: 'Применяю…', en: 'Applying…' },
  restored: {
    ru: 'Восстановлено: режим System, прокси очищен.',
    en: 'Restored: System mode, no proxy.'
  },
  resetFail: { ru: 'Не удалось восстановить настройки.', en: 'Could not restore the settings.' },
  reportSaved: { ru: 'Отчёт сохранён (без личных данных).', en: 'Report saved (no personal data).' },
  reportFail: { ru: 'Отчёт не сохранён.', en: 'The report was not saved.' },
  credentialsBad: {
    ru: 'Имя пользователя и пароль должны быть заполнены вместе.',
    en: 'Username and password must be filled in together.'
  },
  httpRestricted: {
    ru: 'Сеть отвечает, но SoundCloud вернул код с ограничением (HTTP {code}). Сам по себе этот код не доказывает блокировку со стороны провайдера.',
    en: 'The network answers, but SoundCloud returned a restricted status (HTTP {code}). On its own this never proves a provider-level block.'
  },
  stepNames: { dns: 'DNS', html: 'Заглавная страница', api: 'API' },
  stepNamesEn: { dns: 'DNS', html: 'Main page', api: 'API' },
  stepOk: { ru: 'успех', en: 'ok' },
  stepRestricted: { ru: 'отвечает', en: 'responds' },
  stepFail: { ru: 'сбой', en: 'fail' },
  stepHttp: { ru: 'HTTP-статус', en: 'HTTP status' },
  countAddresses: { ru: 'адресов', en: 'resolved addresses' }
};

function lang(key, language) {
  return STRINGS[key][language] || STRINGS[key].en;
}

// Text-only step description: never contains URLs, headers or credentials.
function describeStep(step, language) {
  const names = language === 'ru' ? STRINGS.stepNames : STRINGS.stepNamesEn;
  const name = names[step.name] || step.name;
  if (step.status === 'ok') {
    if (step.name === 'dns') {
      return language === 'ru'
        ? `DNS: успех (${lang('countAddresses', 'ru')}: ${step.addresses ?? 1})`
        : `DNS: ok (${STRINGS.countAddresses.en}: ${step.addresses ?? 1})`;
    }
    const statusLabel = step.kind === 'restricted' ? lang('stepRestricted', language) : lang('stepOk', language);
    return `${name}: ${statusLabel} (HTTP ${step.httpStatus})`;
  }
  return `${name}: ${lang('stepFail', language)} — ${step.type || 'unknown'}`;
}

function describeDiag(diag, language) {
  if (!diag) return '';
  const lines = [];
  for (const step of diag.steps) {
    if (step.kind === 'restricted') {
      lines.push(lang('httpRestricted', language).replace('{code}', String(step.httpStatus)));
      continue;
    }
    lines.push(describeStep(step, language));
  }
  return lines.join('\n');
}

// Wires every control found under `root` (the cusade shadow root or the error
// screen document). Returns the initial snapshot-loading promise.
function wireNetworkControls(root, { language, onApplySuccess } = {}) {
  const languageTag = pickLanguage(language);
  const query = selector => root.querySelector(selector);
  const mode = query('#net-mode');
  const type = query('#net-type');
  const host = query('#net-host');
  const port = query('#net-port');
  const authUsername = query('#net-username');
  const authPassword = query('#net-password');
  const testButton = query('#net-test');
  const applyButton = query('#net-apply');
  const resetButton = query('#net-reset');
  const reportButton = query('#net-report');
  const status = query('#net-status');
  if (!mode || !testButton || !status) return Promise.resolve(null);

  const setStatus = (text, ok = false) => {
    status.textContent = text;
    status.classList.toggle('ok', ok);
  };
  const toPatch = () => ({
    networkMode: mode.value,
    proxyType: type.value,
    proxyHost: host.value.trim(),
    proxyPort: port.value.trim()
  });

  async function refresh() {
    try {
      const snapshot = await ipcRenderer.invoke(CHANNEL.networkGet);
      mode.value = snapshot.networkMode;
      type.value = snapshot.proxyType;
      host.value = snapshot.proxyHost || '';
      port.value = snapshot.proxyPort ? String(snapshot.proxyPort) : '';
      if (authUsername) authUsername.value = '';
      if (authPassword) authPassword.value = '';
      if (snapshot.configNote === 'invalid') setStatus(lang('invalidConfig', languageTag));
      else setStatus([`${lang('mode', languageTag)}: ${snapshot.networkMode}`,
        snapshot.online ? lang('online', languageTag) : lang('offline', languageTag)].join(' · '));
      return snapshot;
    } catch (error) {
      setStatus(`${lang('gapSettings', languageTag)}.`);
      console.error('Could not read network settings:', error);
      return null;
    }
  }

  testButton.addEventListener('click', async () => {
    const controls = [mode, type, host, port, testButton, applyButton, resetButton, reportButton]
      .filter(Boolean);
    controls.forEach(control => { control.disabled = true; });
    setStatus(lang('testing', languageTag));
    try {
      const diagnostics = await ipcRenderer.invoke(CHANNEL.networkTest);
      setStatus(describeDiag(diagnostics, languageTag) || lang('testDone', languageTag), true);
    } catch (error) {
      setStatus(lang('testFail', languageTag));
      console.error('Network check failed:', error);
    } finally {
      controls.forEach(control => { control.disabled = false; });
    }
  });

  applyButton.addEventListener('click', async () => {
    const patch = toPatch();
    const username = authUsername ? authUsername.value.trim() : '';
    const password = authPassword ? authPassword.value : '';
    if ((username && !password) || (!username && password)) {
      setStatus(lang('credentialsBad', languageTag));
      return;
    }
    if (username || password) {
      patch.username = username;
      patch.password = password;
    }
    const controls = [mode, type, host, port, testButton, applyButton, resetButton, reportButton]
      .filter(Boolean);
    controls.forEach(control => { control.disabled = true; });
    setStatus(lang('applying', languageTag));
    try {
      const result = await ipcRenderer.invoke(CHANNEL.networkApply, patch);
      if (result?.ok) {
        setStatus(lang('applied', languageTag), true);
        onApplySuccess?.();
      } else {
        const message = result?.message
          ? (languageTag === 'ru' ? result.message.ru : result.message.en)
          : `${lang('applyFail', languageTag)} ${result?.error || ''}`.trim();
        setStatus(message);
      }
    } catch (error) {
      setStatus(lang('applyFail', languageTag));
      console.error('Could not apply network settings:', error);
    } finally {
      controls.forEach(control => { control.disabled = false; });
    }
  });

  resetButton?.addEventListener('click', async () => {
    const controls = [mode, type, host, port, testButton, applyButton, resetButton, reportButton]
      .filter(Boolean);
    controls.forEach(control => { control.disabled = true; });
    try {
      const result = await ipcRenderer.invoke(CHANNEL.networkReset);
      if (result?.ok) {
        await refresh();
        setStatus(lang('restored', languageTag), true);
        onApplySuccess?.();
      } else {
        setStatus(lang('resetFail', languageTag));
      }
    } catch (error) {
      setStatus(lang('resetFail', languageTag));
      console.error('Could not restore network settings:', error);
    } finally {
      controls.forEach(control => { control.disabled = false; });
    }
  });

  reportButton?.addEventListener('click', async () => {
    try {
      const result = await ipcRenderer.invoke(CHANNEL.networkReport);
      setStatus(result?.saved ? lang('reportSaved', languageTag) : lang('reportFail', languageTag), result?.saved);
    } catch (error) {
      setStatus(lang('reportFail', languageTag));
      console.error('Could not save the network report:', error);
    }
  });

  return refresh();
}

module.exports = { wireNetworkControls, describeDiag, describeStep };

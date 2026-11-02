'use strict';

const { EventEmitter } = require('node:events');
const { STRATEGIES } = require('./connection-engine.js');
const { createProxy, proxyConfig, isServiceHost } = require('./connection-proxy.js');

const MODES = ['auto', 'bypass', 'direct'];
function serviceUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && isServiceHost(url.hostname); }
  catch { return false; }
}

class ConnectionManager extends EventEmitter {
  constructor({ ses, engineFactory, loadStrategy = () => '', saveStrategy = () => {}, rotateDns = () => {},
    proxyFactory = createProxy, random = Math.random }) {
    super();
    Object.assign(this, { ses, engineFactory, loadStrategy, saveStrategy, rotateDns, proxyFactory, random });
    this.mode = 'auto';
    this.strategy = 0;
    this.attempt = 0;
    this.generation = 0;
    this.stopped = false;
    this.work = Promise.resolve();
    this.failedUrls = new Map();
    this.needsReload = false;
    this.status = { state: 'starting', mode: 'auto', message: 'Подключаемся…', attempt: 0 };
  }

  getStatus() { return { ...this.status }; }

  publish(state, message) {
    this.status = { state, mode: this.mode, strategy: STRATEGIES[this.strategy], attempt: this.attempt, message };
    this.emit('status', this.getStatus());
  }

  enqueue(action) {
    this.work = this.work.catch(() => {}).then(action);
    return this.work;
  }

  async releaseRoute() {
    const engine = this.engine;
    this.engine = null;
    this.proxy?.close();
    this.proxy = null;
    engine?.stop();
  }

  async configureRoute(generation) {
    await this.releaseRoute();
    if (this.stopped || generation !== this.generation) return;
    if (this.mode === 'direct') {
      // Restore the user's system proxy, rather than overwriting OS settings.
      await this.ses.setProxy({ mode: 'system' });
    } else {
      const engine = await this.engineFactory(STRATEGIES[this.strategy], () => {
        if (!this.stopped && generation === this.generation) this.reportFailure('https://soundcloud.com/');
      });
      if (this.stopped || generation !== this.generation) { engine.stop(); return; }
      this.engine = engine;
      this.proxy = await this.proxyFactory({
        resolveHost: host => this.ses.resolveHost(host, { queryType: 'A' }),
        getEnginePort: () => this.engine?.port
      });
      if (this.stopped || generation !== this.generation) { await this.releaseRoute(); return; }
      await this.ses.setProxy(proxyConfig(this.proxy.port));
    }
    await this.ses.closeAllConnections();
  }

  setMode(mode) {
    if (!MODES.includes(mode)) return Promise.reject(new Error('Некорректный режим подключения.'));
    this.mode = mode;
    const generation = ++this.generation;
    clearTimeout(this.timer);
    this.probeController?.abort();
    this.attempt = 0;
    this.failedUrls.clear();
    const saved = STRATEGIES.indexOf(this.loadStrategy());
    this.strategy = mode === 'bypass' ? 1 : saved >= 0 ? saved : 0;
    this.publish('starting', 'Настраиваем подключение…');
    return this.enqueue(async () => {
      try {
        await this.configureRoute(generation);
        if (this.stopped || generation !== this.generation) return this.getStatus();
        this.publish('checking', 'Проверяем подключение к SoundCloud…');
      } catch (error) {
        await this.releaseRoute();
        // A missing/blocked binary must not prevent the window from opening.
        await this.ses.setProxy({ mode: 'system' });
        if (!this.stopped && generation === this.generation) {
          this.publish('retrying', `Обход недоступен: ${error.message} Повторим автоматически.`);
        }
      }
      if (!this.stopped && generation === this.generation) this.schedule(1000);
      return this.getStatus();
    });
  }

  reportFailure(url, { mainFrame = false } = {}) {
    if (this.stopped || !serviceUrl(url)) return;
    // Signed playback URLs remain in memory only and expire after five minutes.
    if (this.failedUrls.size < 3 || this.failedUrls.has(url)) this.failedUrls.set(url, Date.now());
    this.needsReload ||= mainFrame;
    if (!this.timer && !this.probing) {
      this.publish('retrying', 'Соединение прервалось. Восстанавливаем…');
      this.schedule(1500);
    }
  }

  schedule(delay) {
    if (this.stopped) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.enqueue(() => this.recover()).catch(error => {
        if (this.stopped) return;
        this.publish('retrying', `Не удалось восстановить подключение: ${error.message}`);
        this.schedule(15000);
      });
    }, delay);
    this.timer.unref?.();
  }

  async checkUrl(url, signal) {
    try {
      const response = await this.ses.fetch(url, { signal, cache: 'no-store',
        headers: url.includes('soundcloud.com/') ? {} : { Range: 'bytes=0-0' } });
      await response.body?.cancel();
      // The public home page must actually open. Auth/signed-media errors on
      // other endpoints indicate a reachable server, not broken networking.
      const homepage = new URL(url).hostname === 'soundcloud.com' && new URL(url).pathname === '/';
      return response.status >= 200 && response.status < (homepage ? 400 : 500);
    } catch { return false; }
  }

  async recover() {
    if (this.stopped) return;
    const generation = this.generation;
    this.probing = true;
    const hadFailures = this.failedUrls.size > 0;
    try {
      if (this.attempt > 0 || (this.mode !== 'direct' && !this.engine)) {
        if (this.attempt > 0 && this.mode !== 'direct') this.strategy = (this.strategy + 1) % STRATEGIES.length;
        this.rotateDns();
        await this.ses.clearHostResolverCache();
        await this.configureRoute(generation);
      }
      if (this.stopped || generation !== this.generation) return;
      const controller = new AbortController();
      this.probeController = controller;
      const timeout = setTimeout(() => controller.abort(), 14000);
      for (const [url, time] of this.failedUrls) if (Date.now() - time > 300000) this.failedUrls.delete(url);
      const urls = [...new Set(['https://soundcloud.com/', ...this.failedUrls.keys()])];
      let healthy;
      try {
        const results = await Promise.all(urls.map(url => this.checkUrl(url, controller.signal)));
        if (!results[0]) this.needsReload = true;
        healthy = results.every(Boolean);
      }
      finally { clearTimeout(timeout); this.probeController = null; }
      if (this.stopped || generation !== this.generation) return;
      if (!healthy) throw new Error('Серверы SoundCloud пока недоступны.');
      this.attempt = 0;
      if (this.mode !== 'direct') this.saveStrategy(STRATEGIES[this.strategy]);
      const reload = this.needsReload;
      this.needsReload = false;
      this.failedUrls.clear();
      this.publish('ready', this.mode === 'direct' ? 'Подключено напрямую.' : 'Подключено. Автоматическое восстановление включено.');
      if (reload || hadFailures) this.emit('recovered', { reload });
    } catch (error) {
      if (this.stopped || generation !== this.generation) return;
      this.attempt++;
      const delay = Math.min(45000, 2000 * 2 ** Math.min(this.attempt - 1, 5)) + Math.floor(this.random() * 1000);
      this.publish('retrying', `${error.message} Попытка ${this.attempt}. Повтор через ${Math.ceil(delay / 1000)} с.`);
      this.schedule(delay);
    } finally { this.probing = false; }
  }

  stop() {
    this.stopped = true;
    this.generation++;
    clearTimeout(this.timer);
    this.probeController?.abort();
    this.proxy?.close();
    this.proxy = null;
    this.engine?.stop();
    this.engine = null;
  }
}

module.exports = { ConnectionManager, MODES, serviceUrl };

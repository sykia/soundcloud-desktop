'use strict';

// HTTPS CONNECT -> local ByeDPI SOCKS5. Chromium resolves names through its
// configured secure resolver, rather than ByeDPI using the OS's poisoned DNS.
const http = require('node:http');
const net = require('node:net');

function isServiceHost(host) {
  return ['soundcloud.com', 'sndcdn.com', 'soundcloud.cloud'].some(root =>
    host === root || host.endsWith(`.${root}`));
}

function openSocksTunnel(port, address, destinationPort = 443) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    let stage = 0;
    let buffered = Buffer.alloc(0);
    const fail = error => { socket.destroy(); reject(error); };
    socket.setTimeout(10000, () => fail(new Error('SOCKS timeout')));
    socket.on('error', fail);
    socket.once('connect', () => socket.write(Buffer.from([5, 1, 0])));
    function receive(data) {
      buffered = Buffer.concat([buffered, data]);
      if (stage === 0) {
        if (buffered.length < 2) return;
        if (buffered[0] !== 5 || buffered[1] !== 0) return fail(new Error('SOCKS authentication failed'));
        buffered = buffered.subarray(2);
        stage = 1;
        const request = Buffer.alloc(10);
        request.set([5, 1, 0, 1]);
        request.set(address.split('.').map(Number), 4);
        request.writeUInt16BE(destinationPort, 8);
        socket.write(request);
      }
      if (stage !== 1 || buffered.length < 5) return;
      if (buffered[0] !== 5 || buffered[1] !== 0) return fail(new Error('SOCKS connection failed'));
      const size = buffered[3] === 1 ? 10 : buffered[3] === 4 ? 22 : buffered[3] === 3 ? 7 + buffered[4] : 0;
      if (!size) return fail(new Error('Invalid SOCKS address'));
      if (buffered.length < size) return;
      socket.removeListener('data', receive);
      socket.removeListener('error', fail);
      socket.setTimeout(0);
      if (buffered.length > size) socket.unshift(buffered.subarray(size));
      stage = 2;
      resolve(socket);
    }
    socket.on('data', receive);
    socket.once('end', () => { if (stage < 2) fail(new Error('SOCKS closed')); });
    socket.once('close', () => { if (stage < 2) reject(new Error('SOCKS closed')); });
  });
}

async function createProxy({ resolveHost, getEnginePort }) {
  const sockets = new Set();
  const server = http.createServer((_request, response) => { response.writeHead(403); response.end(); });
  server.on('connection', socket => {
    sockets.add(socket);
    socket.on('error', () => {});
    socket.once('close', () => sockets.delete(socket));
  });
  server.on('connect', async (request, client, head) => {
    let upstream;
    client.pause();
    client.setTimeout(15000, () => client.destroy());
    try {
      const match = /^([a-z0-9.-]+):443$/i.exec(request.url || '');
      const host = match?.[1].toLowerCase();
      if (!host || !isServiceHost(host)) throw new Error('Unsupported host');
      const result = await resolveHost(host);
      if (client.destroyed) return;
      const address = result.endpoints.find(endpoint => net.isIP(endpoint.address) === 4)?.address;
      if (!address) throw new Error('No IPv4 address');
      const port = getEnginePort();
      if (!port) throw new Error('Engine unavailable');
      upstream = await openSocksTunnel(port, address);
      upstream.on('error', () => client.destroy());
      if (client.destroyed) { upstream.destroy(); return; }
      sockets.add(upstream);
      upstream.once('close', () => { sockets.delete(upstream); client.destroy(); });
      client.once('close', () => upstream.destroy());
      client.setTimeout(0);
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      client.pipe(upstream).pipe(client);
      client.resume();
    } catch {
      upstream?.destroy();
      if (!client.destroyed) client.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    port: server.address().port,
    close() { for (const socket of sockets) socket.destroy(); server.close(); }
  };
}

function proxyConfig(port) {
  // Everything outside SoundCloud keeps a direct route. No TLS interception.
  const script = `function FindProxyForURL(url, host) {
    host = host.toLowerCase();
    if (host === 'soundcloud.com' || dnsDomainIs(host, '.soundcloud.com') ||
        host === 'sndcdn.com' || dnsDomainIs(host, '.sndcdn.com') ||
        host === 'soundcloud.cloud' || dnsDomainIs(host, '.soundcloud.cloud'))
      return 'PROXY 127.0.0.1:${port}';
    return 'DIRECT';
  }`;
  return { mode: 'pac_script', pacScript: `data:application/x-ns-proxy-autoconfig;base64,${Buffer.from(script).toString('base64')}` };
}

module.exports = { isServiceHost, openSocksTunnel, createProxy, proxyConfig };

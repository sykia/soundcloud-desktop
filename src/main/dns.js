'use strict';

// DoH resolver configuration. The window rotates through these servers when a
// load fails with a DNS error code; the index keeps the active server index
// here so a rotation can never race a navigation.

const { app } = require('electron');

const DNS_SERVERS = [
  { name: 'Google', url: 'https://dns.google/dns-query' },
  { name: 'Cloudflare', url: 'https://cloudflare-dns.com/dns-query' },
  { name: 'Quad9', url: 'https://dns.quad9.net/dns-query' }
];
const DNS_ERROR_CODES = new Set([-105, -137, -800, -801, -802, -803, -808]);

let dnsServerIndex = 0;

function configureDnsServer(index) {
  app.configureHostResolver({
    secureDnsMode: 'secure',
    secureDnsServers: [DNS_SERVERS[index].url]
  });
  dnsServerIndex = index;
}

function getDnsServerName() {
  return DNS_SERVERS[dnsServerIndex].name;
}

function isDnsError(code) {
  return DNS_ERROR_CODES.has(code);
}

function hasDnsFallback() {
  return dnsServerIndex < DNS_SERVERS.length - 1;
}

function nextDnsServerIndex() {
  return dnsServerIndex + 1;
}

module.exports = {
  configureDnsServer,
  getDnsServerName,
  isDnsError,
  hasDnsFallback,
  nextDnsServerIndex
};
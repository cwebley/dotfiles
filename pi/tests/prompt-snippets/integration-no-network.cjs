// Loaded before the installed CLI. Block Node network APIs rather than trusting --offline.
const fs = require('node:fs');
function block(api) {
  return function() {
    fs.appendFileSync(process.env.SPIKE_NETWORK_LOG, JSON.stringify({time:Date.now(),api})+'\n');
    throw new Error('OFFLINE SPIKE: network API blocked: '+api);
  };
}
globalThis.fetch = block('fetch');
for (const name of ['http','https']) {
  const m = require('node:'+name);
  m.request = block(name+'.request');
  m.get = block(name+'.get');
}
const net = require('node:net');
net.Socket.prototype.connect = block('net.Socket.connect');
require('node:tls').connect = block('tls.connect');
for (const name of ['lookup','resolve','resolve4','resolve6','resolveAny']) {
  require('node:dns')[name] = block('dns.'+name);
  require('node:dns').promises[name] = block('dns.promises.'+name);
}
require('node:module').syncBuiltinESMExports();

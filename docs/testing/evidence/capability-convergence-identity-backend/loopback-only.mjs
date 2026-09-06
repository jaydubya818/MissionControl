import net from 'node:net';
import { syncBuiltinESMExports } from 'node:module';

const allowed = host => ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host);
const originalFetch = globalThis.fetch;
globalThis.fetch = function(input, init) {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (!allowed(url.hostname)) throw new Error('Qualification forbids non-loopback fetch: ' + url.hostname);
  return originalFetch(input, init);
};
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function(...args) {
  let options = args[0];
  if (Array.isArray(options)) options = options[0];
  if (typeof options === 'object' && options !== null) {
    if (options.host !== undefined && !allowed(options.host)) throw new Error('Qualification forbids non-loopback socket: ' + options.host);
  } else if (typeof options === 'number') {
    const host = typeof args[1] === 'string' ? args[1] : 'localhost';
    if (!allowed(host)) throw new Error('Qualification forbids non-loopback socket: ' + host);
  }
  return originalConnect.apply(this, args);
};
syncBuiltinESMExports();

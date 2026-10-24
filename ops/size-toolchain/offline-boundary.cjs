'use strict';
// Validation-only preload. Never imported by a Production release controller.
// Every network connection is rejected before DNS/socket creation.
const denied = () => {throw new Error('OFFLINE_VALIDATION: network access forbidden');};
globalThis.fetch = denied;
for (const name of ['node:http', 'node:https']) {
  const mod = require(name); mod.request = denied; mod.get = denied;
}
const net = require('node:net'); net.connect = denied; net.createConnection = denied;
net.Socket.prototype.connect = denied;
require('node:tls').connect = denied;
require('node:dgram').createSocket = denied;

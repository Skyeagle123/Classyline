// Fixed read-only Cloudflare API collector. Importing performs no I/O.
import https from 'node:https';
import http from 'node:http';
import {QUALIFICATION} from './pages-r2-fixed-transport.mjs';
const HOST = 'api.cloudflare.com';
const MAX_BYTES = 65536, MAX_TIMEOUT = 10000;
const fail = () => {throw new Error('Qualification configuration unavailable or invalid; no retry');};
function paths(accessKeyId) {
  const base = `/client/v4/accounts/${QUALIFICATION.account}`;
  const bucket = `${base}/r2/buckets/${QUALIFICATION.bucket}`;
  return new Set([bucket, bucket + '/lock', bucket + '/lifecycle',
    `${base}/tokens/${accessKeyId}`, `${base}/tokens/permission_groups`]);
}
function collector({apiToken, accessKeyId, timeoutMs = MAX_TIMEOUT}, offlinePort) {
  if (typeof apiToken !== 'string' || !/^[A-Za-z0-9_-]{20,256}$/.test(apiToken) ||
    typeof accessKeyId !== 'string' || !/^[A-Za-z0-9]{16,128}$/.test(accessKeyId) ||
    !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT) fail();
  const allowed = paths(accessKeyId); let calls = 0, blocked = false;
  const collect = async ({method, path, jurisdiction, signal}) => {
    if (blocked || method !== 'GET' || jurisdiction !== 'default' ||
      typeof path !== 'string' || !allowed.has('/client/v4' + path) || calls >= 10 || signal?.aborted) {
      blocked = true; fail();
    }
    calls++;
    try {
      const body = await new Promise((resolve, reject) => {
        let request, timer, settled = false;
        const cleanup = () => {clearTimeout(timer); signal?.removeEventListener('abort', stop);};
        const stop = () => {if (settled) return; settled = true; cleanup(); request?.destroy();
          reject(new Error('Configuration request uncertain'));};
        signal?.addEventListener('abort', stop, {once: true});
        if (signal?.aborted) {stop(); return;}
        try {
          request = (offlinePort ? http : https).request({hostname: offlinePort ? '127.0.0.1' : HOST,
            port: offlinePort, path: '/client/v4' + path, method: 'GET', agent: false,
            rejectUnauthorized: true, maxHeaderSize: 8192,
            headers: {host: HOST, authorization: `Bearer ${apiToken}`, accept: 'application/json'}}, response => {
            const types = response.rawHeaders.filter((_, i) => i % 2 === 0).filter(n => n.toLowerCase() === 'content-type');
            if (response.statusCode !== 200 || types.length !== 1 ||
              !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(response.headers['content-type'] ?? '')) {stop(); return;}
            let size = 0; const chunks = [];
            response.on('error', stop); response.on('aborted', stop);
            response.on('data', chunk => {size += chunk.length; if (size > MAX_BYTES) stop(); else chunks.push(chunk);});
            response.on('end', () => {if (settled) return; if (!response.complete) {stop(); return;}
              settled = true; cleanup(); resolve(Buffer.concat(chunks));});
          });
          request.on('error', stop); timer = setTimeout(stop, timeoutMs); request.end();
        } catch {stop();}
      });
      const value = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(body));
      if (!value || Object.getPrototypeOf(value) !== Object.prototype || value.success !== true ||
        !Object.hasOwn(value, 'result') || !Array.isArray(value.errors) || value.errors.length ||
        !Array.isArray(value.messages) || value.messages.length ||
        Object.keys(value).some(k => !['success', 'errors', 'messages', 'result', 'result_info'].includes(k)) ||
        (value.result_info !== undefined && (!value.result_info ||
          Object.getPrototypeOf(value.result_info) !== Object.prototype || value.result_info.total_pages !== 1))) fail();
      const plain = item => item && Object.getPrototypeOf(item) === Object.prototype;
      if (path.endsWith('/permission_groups') ? !Array.isArray(value.result) ||
        !value.result.every(item => plain(item) && typeof item.id === 'string' && /^[a-f0-9]{32}$/.test(item.id) &&
          typeof item.name === 'string' && item.name.length > 0) : !plain(value.result)) fail();
      return {status: 200, body: value};
    } catch {blocked = true; fail();}
  };
  return Object.freeze({collect, evidence: () => Object.freeze({requests: calls, blocked, host: HOST,
    automatic_retries: 0, redirects: 0})});
}
export function createConfigurationCollector(options) {
  if (!options || Object.keys(options).some(k => !['apiToken', 'accessKeyId', 'timeoutMs'].includes(k))) fail();
  return collector(options);
}
export function createOfflineConfigurationCollector(options, port) {
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !options ||
    Object.keys(options).some(k => !['apiToken', 'accessKeyId', 'timeoutMs'].includes(k))) fail();
  return collector(options, port);
}

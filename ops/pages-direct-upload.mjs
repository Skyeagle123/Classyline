// Fixed-release Pages transport. No SDK, retry helper, CLI or credential logging.
// Importable for offline tests; live use stays behind the workflow's two blocks.
import https from 'node:https';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {openSync, closeSync, writeFileSync, fsyncSync, lstatSync, readFileSync,
  readdirSync, mkdirSync} from 'node:fs';
import {join, extname} from 'node:path';

export const RELEASE = Object.freeze({
  account: '4bfa1a9c849c3da50520f7a4bcccccab', project: 'classyline2',
  projectID: '25d5c0d3-f248-4d69-b5a3-feacfcb66dec', branch: 'main',
  sha: 'b64e078ee6ecfc5f4e124fe6d68129164f521b8a',
  tree: '123889f9fd27b3f0b2138ea057efa2e762a231b1',
  database: '10c800b1-ddf7-427b-8354-9cf8529782b6',
  bucket: 'classyline-storefront-production-images', date: '2025-11-13'
});
export const ROOT = `/accounts/${RELEASE.account}/pages/projects/${RELEASE.project}`;
const MAX_FILE = 25 * 1024 * 1024, MAX_TOTAL = 128 * 1024 * 1024;
const MAX_JSON = 36 * 1024 * 1024, MAX_BODY = 64 * 1024 * 1024;
export function check(ok, message) { if (!ok) throw new Error(message); }
export function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function json(bytes) {
  try { return JSON.parse(bytes.toString('utf8')); }
  catch { throw new Error('Invalid JSON response'); } // never echo response snippets
}
export function fixedIdentity(identity) {
  check(identity && Object.keys(identity).length === Object.keys(RELEASE).length &&
    Object.entries(RELEASE).every(([k, v]) => identity[k] === v), 'Unapproved release identity');
}
function pathOK(path) {
  return typeof path === 'string' && path.length <= 512 &&
    /^[A-Za-z0-9_./@+ -]+$/.test(path) && !path.startsWith('/') &&
    path.split('/').every(p => p && p !== '.' && p !== '..' && !p.startsWith('.'));
}
const MIME = Object.freeze({'.html':'text/html', '.css':'text/css', '.js':'application/javascript',
  '.mjs':'application/javascript', '.json':'application/json', '.txt':'text/plain',
  '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg',
  '.webp':'image/webp', '.ico':'image/x-icon', '.woff':'font/woff', '.woff2':'font/woff2'});
const SPECIAL = Object.freeze(['_headers', '_redirects', '_routes.json']);
const JAVASCRIPT = Object.freeze(['application/javascript+module', 'text/javascript+module',
  'application/javascript', 'text/javascript']);
function ordinaryMIME(path) {
  check(!path.split('/').some(p => ['functions','node_modules','_worker.js','_worker.bundle'].includes(p)),
    'Unexpected build override');
  const type = MIME[extname(path).toLowerCase()];
  check(type, 'Unreviewed asset MIME type');
  return type;
}
export function pagesKey(bytes, path, blake3) {
  check(pathOK(path), 'Unsafe asset path');
  const hash = blake3(Buffer.from(bytes).toString('base64') + extname(path).slice(1));
  return Buffer.from(hash).toString('hex').slice(0, 32);
}
export function inventory(directory) {
  const files = [], folded = new Set(); let total = 0;
  function walk(dir, prefix = '') {
    check(lstatSync(dir).isDirectory() && !lstatSync(dir).isSymbolicLink(), 'Unsafe output directory');
    for (const name of readdirSync(dir).sort()) {
      const path = prefix + name, full = join(dir, name), stat = lstatSync(full);
      check(pathOK(path) && !stat.isSymbolicLink(), 'Unsafe output path/type');
      check(!folded.has(path.toLowerCase()), 'Output path collision'); folded.add(path.toLowerCase());
      if (stat.isDirectory()) walk(full, path + '/');
      else {
        check(stat.isFile() && stat.size <= MAX_FILE, 'Output file limit/type');
        const bytes = readFileSync(full); total += bytes.length;
        check(total <= MAX_TOTAL && files.length < 20000, 'Output inventory limit');
        files.push({path, bytes});
      }
    }
  }
  walk(directory); return files;
}
export function assertInventory(actual, recorded) {
  const summary = a => a.map(f => ({path:f.path, sha256:sha256(f.bytes)}));
  check(JSON.stringify(summary(actual)) === JSON.stringify(recorded), 'Output inventory changed');
}
export function multipart(parts) {
  // Deterministic boundary tied to content. Reject a boundary collision in bytes.
  const boundary = 'classyline-' + sha256(Buffer.concat(parts.map(p => Buffer.from(p.bytes))));
  const output = [];
  for (const p of parts) {
    check(/^[A-Za-z0-9_.-]+$/.test(p.name) && !String(p.type).includes('\r') &&
      !String(p.type).includes('\n'), 'Invalid multipart field');
    const bytes = Buffer.from(p.bytes);
    check(!bytes.includes(Buffer.from(boundary)), 'Multipart collision');
    const filename = p.file ? `; filename="${p.name}"` : '';
    output.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${p.name}"${filename}\r\nContent-Type: ${p.type}\r\n\r\n`), bytes, Buffer.from('\r\n'));
  }
  output.push(Buffer.from(`--${boundary}--\r\n`));
  const body = Buffer.concat(output);
  check(body.length <= MAX_BODY, 'Deployment payload limit');
  return {body, contentType:`multipart/form-data; boundary=${boundary}`};
}
export async function verifyFunctions(bundle, routing, routes) {
  check(bundle.length > 0 && bundle.length <= MAX_FILE, 'Functions bundle size');
  // Wrangler serializes a multipart body without a separate Content-Type file.
  const first = bundle.subarray(0, Math.min(bundle.length, 256)).toString('latin1').split('\r\n')[0];
  check(/^--[A-Za-z0-9_-]{1,200}$/.test(first), 'Functions multipart boundary');
  let form;
  try { form = await new Response(bundle, {headers:{'Content-Type':`multipart/form-data; boundary=${first.slice(2)}`}}).formData(); }
  catch { throw new Error('Invalid Functions multipart'); }
  const names = [...form.keys()];
  check(new Set(names).size === names.length && names.includes('metadata'), 'Duplicate/missing Functions field');
  const rawMetadata = form.get('metadata');
  const metadata = json(Buffer.from(typeof rawMetadata === 'string' ? rawMetadata : await rawMetadata.arrayBuffer()));
  // Current no-config compiler emits only main_module (optional empty flags/date
  // accepted only at the exact approved runtime). No binding/resource overrides.
  check(metadata && typeof metadata === 'object' && !Array.isArray(metadata) &&
    Object.keys(metadata).every(k => ['main_module','compatibility_date','compatibility_flags'].includes(k)),
    'Functions metadata override');
  check(pathOK(metadata.main_module) && metadata.main_module !== 'metadata' &&
    names.includes(metadata.main_module), 'Functions main module missing');
  const entry = form.get(metadata.main_module);
  check(typeof entry !== 'string' && JAVASCRIPT.includes(entry.type) && entry.size > 0,
    'Functions main module is not executable JavaScript');
  check(metadata.compatibility_date === undefined || metadata.compatibility_date === RELEASE.date, 'Functions date mismatch');
  check(metadata.compatibility_flags === undefined || (Array.isArray(metadata.compatibility_flags) && !metadata.compatibility_flags.length), 'Functions flags mismatch');
  const modules = [];
  for (const name of names.filter(n => n !== 'metadata').sort()) {
    const part = form.get(name);
    check(pathOK(name) && typeof part !== 'string' &&
      [...JAVASCRIPT,'application/wasm','application/octet-stream','text/plain'].includes(part.type),
      'Unexpected Functions module');
    const bytes = Buffer.from(await part.arrayBuffer());
    modules.push({name, type:part.type, size:bytes.length, sha256:sha256(bytes)});
  }
  const r = json(routes), config = json(routing);
  check(r.version === 1 && JSON.stringify(r.include) === '["/api/*"]' &&
    Array.isArray(r.exclude) && r.exclude.length === 0, 'Functions routes mismatch');
  check(config && config.baseURL === '/' && Array.isArray(config.routes) && config.routes.length === 1 &&
    config.routes[0].routePath === '/api/:path*' && config.routes[0].mountPath === '/api' &&
    config.routes[0].method === '' && JSON.stringify(config.routes[0].module) === '["api/[[path]].js:onRequest"]',
    'Functions filepath routing mismatch');
  return {metadata, modules, bundle_sha256:sha256(bundle), routing_sha256:sha256(routing), routes_sha256:sha256(routes)};
}
export async function prepare({identity, files, bundle, routing, blake3}) {
  fixedIdentity(identity);
  check(Array.isArray(files) && files.length > 0 && files.length <= 20000, 'Invalid static inventory');
  const paths = new Set(), folded = new Set(), manifest = Object.create(null), assets = [], keys = new Map(), special = {};
  let total = bundle.length + routing.length;
  for (const f of files) {
    check(pathOK(f.path) && Buffer.isBuffer(f.bytes) && f.bytes.length <= MAX_FILE &&
      !paths.has(f.path) && !folded.has(f.path.toLowerCase()), 'Invalid/duplicate static asset');
    paths.add(f.path); folded.add(f.path.toLowerCase()); total += f.bytes.length;
    check(total <= MAX_TOTAL, 'Artifact total limit');
    if (SPECIAL.includes(f.path)) {special[f.path]=Buffer.from(f.bytes); continue;}
    const contentType = ordinaryMIME(f.path);
    const bytes = Buffer.from(f.bytes), key = pagesKey(bytes, f.path, blake3);
    const item = {path:f.path, key, sha256:sha256(bytes), contentType, bytes};
    const previous = keys.get(key);
    check(!previous || (previous.sha256 === item.sha256 && previous.contentType === contentType), 'Asset content-key collision');
    if (!previous) {keys.set(key,item); assets.push(item);}
    manifest['/' + f.path] = key;
  }
  check(paths.has('index.html') && special['_routes.json'], 'Missing index/routes');
  const functions = await verifyFunctions(bundle, routing, special['_routes.json']);
  const parts = [{name:'manifest',type:'application/json',bytes:Buffer.from(JSON.stringify(manifest))},
    ...[['branch',RELEASE.branch],['commit_hash',RELEASE.sha],['commit_dirty','false']].map(([name,value])=>({name,type:'text/plain',bytes:Buffer.from(value)})),
    {name:'_worker.bundle',type:'multipart/form-data',bytes:Buffer.from(bundle),file:true},
    {name:'functions-filepath-routing-config.json',type:'application/json',bytes:Buffer.from(routing),file:true},
    ...Object.entries(special).map(([name,bytes])=>({name,type:name==='_routes.json'?'application/json':'text/plain',bytes,file:true}))];
  const payload = multipart(parts);
  const evidence = {identity:{...RELEASE}, functions, manifest,
    parts:parts.map(p=>({name:p.name,type:p.type,file:Boolean(p.file),sha256:sha256(p.bytes)})),
    files:files.map(f=>({path:f.path,size:f.bytes.length,sha256:sha256(f.bytes)})),
    assets:assets.map(({path,key,sha256,contentType})=>({path,key,sha256,contentType})),
    body_sha256:sha256(payload.body), body_bytes:payload.body.length, content_type:payload.contentType};
  return {identity:{...RELEASE}, assets, manifest, parts, payload, evidence, planHash:sha256(JSON.stringify(evidence))};
}
export function verifyPlan(plan, blake3) {
  fixedIdentity(plan.identity);
  fixedIdentity(plan.evidence.identity);
  check(sha256(JSON.stringify(plan.evidence)) === plan.planHash &&
    Buffer.isBuffer(plan.payload.body) && plan.payload.body.length === plan.evidence.body_bytes &&
    sha256(plan.payload.body) === plan.evidence.body_sha256 &&
    plan.payload.contentType === plan.evidence.content_type &&
    JSON.stringify(plan.manifest) === JSON.stringify(plan.evidence.manifest), 'Payload/manifest provenance mismatch');
  check(Array.isArray(plan.evidence.files) && plan.evidence.files.length > 0 &&
    plan.evidence.files.length <= 20000, 'Invalid recorded file inventory');
  const files = new Map(), folded = new Set(); let total = 0;
  for (const f of plan.evidence.files) {
    check(f && pathOK(f.path) && !files.has(f.path) && !folded.has(f.path.toLowerCase()) &&
      Number.isInteger(f.size) && f.size >= 0 && f.size <= MAX_FILE &&
      typeof f.sha256 === 'string' && /^[a-f0-9]{64}$/.test(f.sha256), 'Invalid/duplicate recorded file');
    files.set(f.path, f); folded.add(f.path.toLowerCase()); total += f.size;
    if (!SPECIAL.includes(f.path)) ordinaryMIME(f.path);
  }
  check(files.has('index.html') && files.has('_routes.json'), 'Missing index/routes');
  check(plan.manifest && typeof plan.manifest === 'object' && !Array.isArray(plan.manifest),
    'Invalid static manifest');
  check(Array.isArray(plan.assets) && Array.isArray(plan.evidence.assets) &&
    plan.assets.length === plan.evidence.assets.length, 'Asset inventory mismatch');
  check(Array.isArray(plan.parts) && plan.parts.length===plan.evidence.parts.length &&
    new Set(plan.parts.map(p=>p.name)).size===plan.parts.length, 'Payload part inventory mismatch');
  for(const [i,p] of plan.parts.entries()) {
    const r=plan.evidence.parts[i];
    check(p.name===r.name && p.type===r.type && Boolean(p.file)===r.file &&
      sha256(p.bytes)===r.sha256,'Payload part provenance mismatch');
  }
  const rebuilt=multipart(plan.parts);
  check(rebuilt.body.equals(plan.payload.body) && rebuilt.contentType===plan.payload.contentType,'Payload serialization mismatch');
  const part=name=>{const p=plan.parts.find(p=>p.name===name);check(p,'Required payload part missing');return p.bytes;};
  // Canonical bytes reject duplicate JSON member names, not just duplicate keys
  // surviving JSON.parse(). The preparer always emits this exact serialization.
  check(part('manifest').equals(Buffer.from(JSON.stringify(plan.manifest))) &&
    part('branch').toString()==='main' && part('commit_hash').toString()===RELEASE.sha &&
    part('commit_dirty').toString()==='false', 'Payload release/manifest mismatch');
  check(sha256(part('_worker.bundle'))===plan.evidence.functions.bundle_sha256 &&
    sha256(part('functions-filepath-routing-config.json'))===plan.evidence.functions.routing_sha256 &&
    sha256(part('_routes.json'))===plan.evidence.functions.routes_sha256,'Functions payload mismatch');
  const expectedParts = new Map([
    ['manifest', ['application/json', false]], ['branch', ['text/plain', false]],
    ['commit_hash', ['text/plain', false]], ['commit_dirty', ['text/plain', false]],
    ['_worker.bundle', ['multipart/form-data', true]],
    ['functions-filepath-routing-config.json', ['application/json', true]],
    ...SPECIAL.filter(name => files.has(name)).map(name =>
      [name, [name === '_routes.json' ? 'application/json' : 'text/plain', true]])
  ]);
  check(plan.parts.length === expectedParts.size && plan.parts.every(p =>
    expectedParts.has(p.name) && p.type === expectedParts.get(p.name)[0] &&
    Boolean(p.file) === expectedParts.get(p.name)[1]), 'Unexpected payload part inventory');
  for (const name of SPECIAL.filter(name => files.has(name))) {
    const bytes = part(name), recorded = files.get(name);
    check(bytes.length === recorded.size && sha256(bytes) === recorded.sha256,
      'Special file provenance mismatch');
  }
  total += part('_worker.bundle').length + part('functions-filepath-routing-config.json').length;
  check(total <= MAX_TOTAL && part('_worker.bundle').length > 0 &&
    part('_worker.bundle').length <= MAX_FILE, 'Artifact total/bundle limit');
  const assetKeys = new Set(), assetPaths = new Set();
  for (const [i,a] of plan.assets.entries()) {
    const recorded = plan.evidence.assets[i];
    check(Buffer.isBuffer(a.bytes) && a.bytes.length <= MAX_FILE && pathOK(a.path) &&
      files.has(a.path) && !SPECIAL.includes(a.path) &&
      !assetKeys.has(a.key) && !assetPaths.has(a.path) &&
      a.contentType === ordinaryMIME(a.path) &&
      plan.manifest['/' + a.path] === a.key &&
      pagesKey(a.bytes,a.path,blake3) === a.key && sha256(a.bytes) === a.sha256 &&
      ['path','key','sha256','contentType'].every(k=>a[k]===recorded[k]), 'Asset hash mismatch');
    assetKeys.add(a.key); assetPaths.add(a.path);
  }
  // Require exact ordinary-file coverage, not merely self-consistent recorded hashes.
  const ordinaryFiles = plan.evidence.files.filter(f =>
    !SPECIAL.includes(f.path));
  const expectedPaths = ordinaryFiles.map(f => '/' + f.path);
  check(new Set(expectedPaths).size === expectedPaths.length &&
    Object.keys(plan.manifest).length === expectedPaths.length &&
    expectedPaths.every(path => Object.hasOwn(plan.manifest, path)),
    'Incomplete static manifest coverage');
  const keys = new Set(plan.assets.map(a=>a.key));
  check(Object.values(plan.manifest).every(k=>keys.has(k)) &&
    [...keys].every(k=>Object.values(plan.manifest).includes(k)), 'Manifest key mismatch');
  for(const [path,key] of Object.entries(plan.manifest)) {
    const file=plan.evidence.files.find(f=>'/'+f.path===path),asset=plan.assets.find(a=>a.key===key);
    check(file && asset && file.sha256===asset.sha256 && file.size===asset.bytes.length &&
      ordinaryMIME(file.path)===asset.contentType && pagesKey(asset.bytes,file.path,blake3)===key,
      'Manifest file provenance mismatch');
  }
}

// One ClientRequest, fresh connection, no redirect or retry path. Loopback HTTP
// is allowed solely for local fault servers; production caller fixes HTTPS host.
export function requestOnce({hostname='api.cloudflare.com',port,secure=true,path,method='GET',token,
  body=Buffer.alloc(0),contentType='application/json',timeoutMs=20000,maxResponse=4*1024*1024}) {
  check((secure && hostname === 'api.cloudflare.com' && port === undefined) ||
    (!secure && hostname === '127.0.0.1' && Number.isInteger(port)), 'Unsupported transport endpoint');
  check(['GET','POST'].includes(method) && path.startsWith('/') && !/[\r\n#]/.test(path) &&
    Buffer.isBuffer(body) && body.length <= MAX_BODY, 'Invalid transport request');
  return new Promise((resolve,reject)=>{
    let req, timer, settled=false;
    const fail=()=>{if(settled)return; settled=true; clearTimeout(timer); req?.destroy(); reject(new Error('HTTP outcome uncertain; no retry'));};
    try {
      req=(secure?https:http).request({hostname,port,path,method,agent:false,
        headers:{Authorization:`Bearer ${token}`, 'Content-Type':contentType,'Content-Length':body.length,
          'User-Agent':'classyline-fixed-release/1'}},res=>{
        const chunks=[];let size=0;
        res.on('aborted',fail);res.on('error',fail);
        res.on('data',chunk=>{size+=chunk.length;if(size>maxResponse)fail();else chunks.push(chunk);});
        res.on('end',()=>{if(settled)return; settled=true;clearTimeout(timer);
          if(res.statusCode!==200){reject(new Error('HTTP non-success; no retry'));return;}
          try {const data=json(Buffer.concat(chunks));check(data.success===true,'API rejected request');resolve(data);}
          catch{reject(new Error('Invalid API response; no retry'));}
        });
      });
      req.on('error',fail);timer=setTimeout(fail,timeoutMs);req.end(body);
    } catch {fail();}
  });
}
function syncDirectory(directory) { const fd=openSync(directory,'r');try{fsyncSync(fd);}finally{closeSync(fd);} }
// Local process-crash safety only. No assertion that an ephemeral Actions disk
// survives runner loss. A separately verified remote checkpoint is mandatory.
export class AttemptJournal {
  constructor(directory) {
    mkdirSync(directory,{recursive:true,mode:0o700});
    check(lstatSync(directory).isDirectory() && !lstatSync(directory).isSymbolicLink(), 'Unsafe journal directory');
    this.directory=directory;
  }
  claim(plan, controlSHA) {
    check(/^[a-f0-9]{40}$/.test(controlSHA), 'Invalid control identity');
    const intent={schema:1,release:RELEASE.sha,control_sha:controlSHA,plan_sha256:plan.planHash,
      body_sha256:sha256(plan.payload.body),consumed:true,retry_permitted:false};
    const path=join(this.directory,`${RELEASE.sha}.consumed.json`);
    let fd;
    try {fd=openSync(path,'wx',0o600);}catch{throw new Error('Attempt consumed or journal unavailable; no retry');}
    try {writeFileSync(fd,JSON.stringify(intent));fsyncSync(fd);}finally{closeSync(fd);}
    syncDirectory(this.directory);
    return intent;
  }
}
export function deploymentIdentity(d) {
  check(d?.project_id===RELEASE.projectID && d.project_name===RELEASE.project &&
    d.environment==='production' && d.deployment_trigger?.metadata?.branch===RELEASE.branch &&
    d.deployment_trigger.metadata.commit_hash===RELEASE.sha && d.deployment_trigger.metadata.commit_dirty===false &&
    d.latest_stage?.name==='deploy' && d.latest_stage.status==='success' && !d.is_skipped &&
    d.uses_functions===true && d.compatibility_date===RELEASE.date &&
    Array.isArray(d.compatibility_flags) && d.compatibility_flags.length===0 &&
    typeof d.id==='string' && /^[a-f0-9-]{36}$/.test(d.id) &&
    d.url===`https://${d.id.slice(0,8)}.classyline2.pages.dev`, 'Deployment identity/status mismatch');
  function binding(map,key,field,value) {
    check(map && !Array.isArray(map) && Object.keys(map).length===1 && Object.hasOwn(map,key) &&
      map[key] && !Array.isArray(map[key]) && Object.hasOwn(map[key],field) && map[key][field]===value,
      'Deployment binding mismatch');
  }
  binding(d.d1_databases,'DB','id',RELEASE.database);
  binding(d.r2_buckets,'PRODUCT_IMAGES','name',RELEASE.bucket);
}
export class DirectUpload {
  #request; #token; #started=false;
  constructor({request=requestOnce,token}) {this.#request=request;this.#token=token;}
  async stageAndCreate({plan,blake3,journal,controlSHA,checkpoint,preflight}) {
    check(!this.#started,'Release instance already consumed');this.#started=true;
    check(process.versions.node==='24.19.0','Unreviewed transport runtime');
    verifyPlan(plan,blake3);
    const verifiedPlanHash = plan.planHash;
    // Reloaded/self-consistent plans must pass semantic bundle validation too.
    // This happens before consuming a journal or making any network request.
    const part = name => plan.parts.find(p => p.name === name).bytes;
    const functions = await verifyFunctions(part('_worker.bundle'),
      part('functions-filepath-routing-config.json'), part('_routes.json'));
    check(JSON.stringify(functions) === JSON.stringify(plan.evidence.functions),
      'Functions module evidence mismatch');
    // The multipart parser yields. Reject changes during that await before
    // copying the final immutable network bytes or recording the attempt.
    verifyPlan(plan,blake3);
    check(plan.planHash === verifiedPlanHash, 'Plan changed during Functions validation');
    // Copy all network bytes before calling any caller-supplied read/checkpoint.
    const payload=Buffer.from(plan.payload.body), contentType=plan.payload.contentType;
    const assets=plan.assets.map(a=>({...a,bytes:Buffer.from(a.bytes)}));
    const evidence={plan_sha256:plan.planHash,body_sha256:sha256(payload),accepted:false,uncertain:false,creation_requests:0};
    const intent=journal.claim(plan,controlSHA);
    // Callback must durably commit intent outside the runner BEFORE any Pages API
    // mutation. R2Checkpoint.claim binds this interface to the permanent R2 key;
    // the Production workflow still supplies an unconditional false callback.
    check(await checkpoint(intent)===true,'Durable checkpoint unavailable; stop before upload');
    const known=await preflight();
    const once=async(path,method='GET',body=Buffer.alloc(0),token=this.#token,type='application/json')=>
      this.#request({path:'/client/v4'+path,method,body,token,contentType:type});
    const tokenReply=await once(ROOT+'/upload-token');
    const jwt=tokenReply.result?.jwt;
    check(typeof jwt==='string' && jwt.length>0 && jwt.length<16384,'Missing upload token');
    // JWT claims only narrow limits; TLS/API authentication remains authoritative.
    let claims;try{claims=json(Buffer.from(jwt.split('.')[1],'base64url'));}catch{throw new Error('Invalid upload token');}
    const fileLimit=claims.max_file_count_allowed??20000;
    check(Number.isInteger(fileLimit) && fileLimit>0 && Number.isFinite(claims.exp) && claims.exp*1000>Date.now()+60000 &&
      Object.keys(plan.manifest).length<=Math.min(20000,fileLimit),'Upload token expired/limits');
    const hashes=assets.map(a=>a.key);
    const missing=(await once('/pages/assets/check-missing','POST',Buffer.from(JSON.stringify({hashes})),jwt)).result;
    check(Array.isArray(missing) && new Set(missing).size===missing.length &&
      missing.every(k=>hashes.includes(k)),'Unexpected missing-asset set');
    let batch=[],size=2;
    async function send() {if(!batch.length)return;await once('/pages/assets/upload','POST',Buffer.from('['+batch.join(',')+']'),jwt);batch=[];size=2;}
    for(const a of assets.filter(a=>missing.includes(a.key))) {
      const entry=JSON.stringify({key:a.key,value:a.bytes.toString('base64'),metadata:{contentType:a.contentType},base64:true});
      check(Buffer.byteLength(entry)+2<=MAX_JSON,'Asset batch limit');
      if(size+Buffer.byteLength(entry)+1>MAX_JSON)await send();
      batch.push(entry);size+=Buffer.byteLength(entry)+1;
    }
    await send();
    await once('/pages/assets/upsert-hashes','POST',Buffer.from(JSON.stringify({hashes})),jwt);
    await preflight(known); // source, inventory, baseline, config, main and history
    let returned;
    evidence.creation_requests=1;
    try {
      const response=await once(ROOT+'/deployments','POST',payload,this.#token,contentType);
      returned=response.result?.id;
      check(typeof returned==='string' && /^[a-f0-9-]{36}$/.test(returned),'Ambiguous creation response');
    } catch {evidence.uncertain=true;}
    // Only GET operations are supplied to reconciliation after the consumed POST.
    const read=path=>{
      check(path===ROOT || path===ROOT+'/deployments' ||
        (path.startsWith(ROOT+'/deployments/') && /^[a-f0-9-]{36}$/.test(path.slice((ROOT+'/deployments/').length))),
        'Unapproved reconciliation path');
      return once(path);
    };
    return {evidence,known,returned,read};
  }
  async execute(options) {
    const {evidence,known,returned,read}=await this.stageAndCreate(options);
    const {reconcile}=options;
    const observed=await reconcile({read,known,returned,uncertain:evidence.uncertain});
    deploymentIdentity(observed);
    evidence.observed_id=observed.id;
    if(returned)check(returned===observed.id,'Creation response differs from observed deployment');
    check(!evidence.uncertain,'Deployment observed after uncertainty; manual review required, no retry');
    evidence.accepted=true;return evidence;
  }
}

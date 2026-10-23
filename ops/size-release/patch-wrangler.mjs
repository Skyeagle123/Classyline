import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
export const ORIGINAL_SHA256='71da1f9bcf69a9f56c4ff4f68e71315365d03db8ea11207577b47a8e1a0a1064';
const hash=b=>createHash('sha256').update(b).digest('hex');
const marker='  return await (0, import_undici.fetch)(\n    `${getCloudflareApiBaseUrl(complianceConfig)}${resource}${queryString}`,\n    {\n      method,\n      ...init4,\n      headers,\n      signal: abortSignal\n    }\n  );';
export function patched(original,gatePath) {
 assert.equal(hash(original),ORIGINAL_SHA256,'Pinned Wrangler implementation drift');
 let text=original.toString();assert.equal(text.split(marker).length,2,'Ambiguous transport insertion');
 const replacement=`  const sizeCreate = resource === "/accounts/4bfa1a9c849c3da50520f7a4bcccccab/pages/projects/classyline2/deployments" && method === "POST";
  if (sizeCreate && (queryString || getCloudflareApiBaseUrl(complianceConfig) !== "https://api.cloudflare.com/client/v4")) throw new Error("Unexpected create endpoint");
  const sizeOptions = sizeCreate ? {
    redirect: "error",
    dispatcher: require(${JSON.stringify(gatePath)}).createDispatcher(import_undici.getGlobalDispatcher(), process.env.CLASSYLINE_CREATE_JOURNAL),
    signal: AbortSignal.any([...(abortSignal ? [abortSignal] : []), AbortSignal.timeout(60000)])
  } : {};
  return await (0, import_undici.fetch)(
    \`\${getCloudflareApiBaseUrl(complianceConfig)}\${resource}\${queryString}\`,
    {method, ...init4, headers, signal: abortSignal, ...sizeOptions}
  );`;
 text=text.replace(marker,replacement);
 assert.equal(text.split('MAX_DEPLOYMENT_ATTEMPTS = 3;').length,2);
 text=text.replace('MAX_DEPLOYMENT_ATTEMPTS = 3;','MAX_DEPLOYMENT_ATTEMPTS = 1;');
 return text;
}
export function apply(cli,originalCopy,verify=false) {
 const gate=resolve(fileURLToPath(new URL('./create-gate.cjs',import.meta.url)));
 const original=readFileSync(verify?originalCopy:cli),expected=patched(original,gate);
 if(verify)assert.equal(hash(readFileSync(cli)),hash(expected),'Patched CLI changed');
 else {writeFileSync(originalCopy,original,{flag:'wx',mode:0o600});writeFileSync(cli,expected);}
 return {original_sha256:hash(original),patched_sha256:hash(expected),gate_sha256:hash(readFileSync(gate)),max_create_dispatches:1};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 assert.equal(process.argv.length,5);console.log(JSON.stringify(apply(resolve(process.argv[2]),resolve(process.argv[3]),process.argv[4]==='verify')));
}

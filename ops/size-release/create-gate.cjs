'use strict';
// No network or credential access. Claimed before handing a POST to the transport.
const fs=require('node:fs');
const path=require('node:path');
const TARGET='/accounts/4bfa1a9c849c3da50520f7a4bcccccab/pages/projects/classyline2/deployments';
function claim(journal) {
 if(!path.isAbsolute(journal||''))throw Error('Missing absolute deployment-create journal');
 const parent=fs.realpathSync(path.dirname(journal));
 if(parent!==path.dirname(journal))throw Error('Journal directory must be canonical');
 const fd=fs.openSync(journal,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);
 try {fs.writeFileSync(fd,JSON.stringify({version:1,consumed:true,pid:process.pid,max_create_dispatches:1}));fs.fsyncSync(fd);}
 finally {fs.closeSync(fd);}
 // Durably claim the directory entry too. Any failure remains consumed.
 const dir=fs.openSync(parent,fs.constants.O_RDONLY);try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}
}
function createDispatcher(delegate,journal) {
 if(typeof delegate?.dispatch!=='function')throw Error('Missing pinned dispatcher');
 return {
  dispatch(options,handler) {
   if(String(options.origin)!=='https://api.cloudflare.com'||options.path!==`/client/v4${TARGET}`||options.method!=='POST')
    throw Error('Unexpected deployment-create transport target');
   claim(journal);
   // Disable transport-level replay of a non-idempotent POST. Fetch redirects
   // are separately forbidden at the call site. A fetch-level replay re-enters
   // this dispatcher and fails the exclusive journal before reaching delegate.
   return delegate.dispatch({...options,idempotent:false,maxRedirections:0,blocking:true},handler);
  },
  close(...args){return delegate.close(...args);},
  destroy(...args){return delegate.destroy(...args);},
 };
}
module.exports={TARGET,claim,createDispatcher};

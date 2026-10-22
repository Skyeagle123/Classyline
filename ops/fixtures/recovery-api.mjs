// Offline-only API boundary. Never import into the release workflow.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const fixture = JSON.parse(readFileSync(new URL('./recovery-history.json', import.meta.url)));
const log = readFileSync(new URL('./recovery-39814798811.log', import.meta.url));
export function createRecoveryAPI(e, scenario, includeApplicationCI = false) {
  let inventories = 0;
  const counts = {reads: 0, inventories: 0};
  function respond(url, options) {
    assert.equal(options.redirect, 'error'); assert(options.signal);
    assert(!options.method || options.method === 'GET', 'Offline API permits GET only');
    const path = url.replace('https://api.github.com/repos/Skyeagle123/Classyline', '');
    let s = scenario;
    if (s.startsWith('late-recovery-') && (inventories >= 2 ||
      (inventories === 1 && path.startsWith('/actions/workflows/')))) s = s.replace('late-', '');
    if(s==='recovery-api-denied') return {ok:false,status:403,json:async()=>({})};
    if(s==='recovery-api-timeout') throw new Error('Mocked read deadline exceeded');
    const previous = structuredClone(fixture.previous), failed = structuredClone(fixture.failed);
    const current = {...structuredClone(fixture.failed), id: Number(e.GITHUB_RUN_ID), run_number: 3,
      head_sha: e.GITHUB_SHA, head_commit: {id:e.GITHUB_SHA,tree_id:'d'.repeat(40)},
      status:'in_progress',conclusion:null};
    const runs = [previous, failed, current];
    const mutation = /^(previous|failed|current)-(.+)$/.exec(s.replace(/^recovery-/, ''));
    if (mutation) {
      const r = {previous,failed,current}[mutation[1]], property = mutation[2];
      const values = {sha:['head_sha','0'.repeat(40)], tree:['head_commit',{id:r.head_sha,tree_id:'0'.repeat(40)}],
        branch:['head_branch','feature'],path:['path','other.yml'],event:['event','push'],
        rerun:['run_attempt',2],active:['status','queued'],failed:['conclusion','failure'],
        success:['conclusion','success'],conclusion:['conclusion',null],number:['run_number',4],
        workflow:['workflow_id',99],repo:['repository',{id:1,full_name:'other/repo'}]};
      if (values[property]) r[values[property][0]]=values[property][1];
      if (mutation[1]==='current' && property==='conclusion') r.conclusion='success';
      if (property==='actor') r.actor={login:'other',id:1};
      if (property==='trigger') r.triggering_actor={login:'other',id:1};
    }
    if(path.startsWith('/actions/workflows/')) {
      inventories++; counts.inventories++;
      if (['prior-dispatch','recovery-extra-dispatch'].includes(s)) runs.push({...current,id:39820000001,run_number:4});
      if (['missing-previous','recovery-missing-previous'].includes(s)) runs.shift();
      if (['unknown-previous'].includes(s)) previous.id=999;
      if (s==='recovery-missing-failed') runs.splice(1,1);
      if (s==='duplicate-dispatch'||s==='recovery-duplicate') runs[1]=structuredClone(previous);
      if (s==='wrong-dispatch-id') current.id=999;
      if (s==='wrong-dispatch-sha') current.head_sha='other';
      if(s==='recovery-inventory-malformed') return reply({total_count:3});
      if(s==='recovery-inventory-string-count') return reply({total_count:'3',workflow_runs:runs});
      return reply({total_count:runs.length+(s==='truncated-dispatch'?1:0),workflow_runs:runs});
    }
    if(path==='/git/commits/'+e.GITHUB_SHA) return reply({sha:e.GITHUB_SHA,tree:{sha:'d'.repeat(40)},
      parents:[{sha:s==='recovery-controller-parent'?'0'.repeat(40):fixture.failed.head_sha}]});
    if(path==='/git/commits/'+fixture.failed.head_sha) return reply({sha:fixture.failed.head_sha,
      tree:{sha:s==='recovery-original-tree'?'0'.repeat(40):fixture.failed.head_commit.tree_id}});
    for(const r of runs) if(path==='/actions/runs/'+r.id) {
      if(s==='recovery-detail-failed-success' && r.id===39814798811) r.conclusion='success';
      if(s==='recovery-detail-failed-rerun' && r.id===39814798811) r.run_attempt=2;
      return reply(r);
    }
    if(path==='/actions/runs/39814798811/attempts/1/jobs?per_page=100') {
      const body=structuredClone(fixture.jobs), job=body.jobs[0];
      if(s==='recovery-missing-jobs') {body.total_count=0;body.jobs=[];}
      if(s==='recovery-extra-job') {body.total_count=2;body.jobs.push({...job,id:99});}
      if(s==='recovery-truncated-jobs') body.total_count=2;
      if(s==='recovery-wrong-job') job.id=1;
      if(s==='recovery-job-attempt') job.run_attempt=2;
      if(s==='recovery-job-source') job.head_sha='other';
      if(s==='recovery-missing-step') job.steps.splice(4,1);
      if(s==='recovery-extra-step') job.steps.push({...job.steps[0],number:14});
      if(s==='recovery-reordered-steps') job.steps.reverse();
      if(s==='recovery-step-number') job.steps[4].number=99;
      if(s==='recovery-step-status') job.steps[4].status='in_progress';
      if(s==='recovery-arm-succeeded') job.steps[1].conclusion='success';
      const executed=/^recovery-executed-(\d+)$/.exec(s);
      if(executed) job.steps[Number(executed[1])].conclusion='success';
      return reply(body);
    }
    if(path.endsWith('/approvals')) {
      const body=structuredClone(fixture.approvals);
      if(s==='recovery-no-approval') return reply([]);
      if(s==='recovery-approval-actor') body[0].user={login:'other',id:1};
      if(s==='recovery-approval-bypass') body[0].environments[0].can_admins_bypass=true;
      if(s==='recovery-approval-environment') body[0].environments[0].id=99;
      if(s==='recovery-approval-rejected') body[0].state='rejected';
      if(s==='recovery-current-approval-bypass' && path.includes('/'+current.id+'/'))
        body[0].environments[0].can_admins_bypass=true;
      return reply(body);
    }
    if(path.startsWith('/git/blobs/')) {
      const body={sha:'071fce850fcf330ef2efd4c9e969793f67852872',encoding:'base64',
        size:log.length,content:log.toString('base64')};
      if(s==='recovery-log-tampered') body.content=Buffer.alloc(log.length,65).toString('base64');
      if(s==='recovery-log-missing') return {ok:false,status:404,json:async()=>({})};
      if(s==='recovery-log-size') body.size++;
      if(s==='recovery-log-encoding') body.content+='!';
      return reply(body);
    }
    if(includeApplicationCI) {
      const source='45ac09182cca5cc989fbae1c967c6e7e849e63c3',tree='6457416153e4aba803424d13a75db7d9e418adbc';
      if(path==='/actions/runs/39725797281') return reply({id:39725797281,repository:{full_name:'Skyeagle123/Classyline'},
        head_sha:source,head_branch:'feat/storefront-v2-option2',path:'.github/workflows/storefront.yml',event:'pull_request',
        head_commit:{tree_id:tree},run_attempt:1,status:'completed',conclusion:'success'});
      if(path==='/actions/runs/39725797281/attempts/1/jobs?per_page=100') return reply({total_count:1,jobs:[{name:'check',
        status:'completed',conclusion:'success',run_id:39725797281,run_attempt:1,head_sha:source}]});
      const ids=[source,'3a18df71e4f0e7808389f739b0c7081b7f89e464','35f0f8b69b168d363dba15646c220d64e5606454'];
      for(const sha of ids) if(path==='/git/commits/'+sha) return reply({sha,tree:{sha:tree},
        parents:[{sha:'492fb4a963f9a0c9a8a24cf783a47cbe44ae7586'},...(sha.startsWith('3a18')?[{sha:source}]:[])]});
    }
    return null;
    function reply(body) { counts.reads++; return {ok:true,status:200,json:async()=>body}; }
  }
  return {respond,counts};
}

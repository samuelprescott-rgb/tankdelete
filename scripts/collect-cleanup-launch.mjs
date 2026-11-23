import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,realpathSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const out=realpathSync(process.argv[2]);assert(out.includes('/tankdelete/tmp/production-qa/local-mac-'));
const r=JSON.parse(readFileSync(path.join(out,'native-menu.json')));
assert(Number.isInteger(r.pid)&&r.pid>1&&/^local\.tankdelete\.workshop\.[a-z0-9]+$/.test(r.id));
const one=(predicate)=>execFileSync('/usr/bin/log',['show','--last','12m','--style','compact','--predicate',predicate],{encoding:'utf8',timeout:30000,maxBuffer:2e6})
  .split('\n').filter(s=>/^\d{4}-\d\d-\d\d/.test(s)).map(s=>s.replace(/0x[\da-f]{6,}/gi,'<address>'));
const webkit=one(`processID == ${r.pid} AND (eventMessage CONTAINS[c] "web process failed to launch" OR eventMessage CONTAINS[c] "gpuProcessExited" OR eventMessage CONTAINS[c] "processDidTerminateOrFailedToLaunch")`);
const denial=one(`(process == "sandboxd" OR process == "amfid" OR process == "taskgated-helper") AND eventMessage CONTAINS[c] "${r.id}" AND (eventMessage CONTAINS[c] "denied" OR eventMessage CONTAINS[c] "deny(" OR eventMessage CONTAINS[c] "invalid signature")`)
 .filter(x=>x.includes(r.id)&&/(?:\bdenied\b|deny\(|invalid signature)/i.test(x)).map(x=>({time:x.slice(0,23),term:x.match(/(?:\bdenied\b|deny\(|invalid signature)/i)?.[0]}));
writeFileSync(path.join(out,'limited-launch-record.json'),JSON.stringify({id:r.id,pid:r.pid,webkit:webkit.filter(x=>x.includes('['+r.pid+':')).slice(0,16),matchingExplicitDenials:denial},null,2));
console.log(JSON.stringify({records:webkit.length,visibleExplicitDenials:denial.length,first:webkit[0]}));

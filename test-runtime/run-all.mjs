import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const trialBadges=spawnSync(process.execPath,['test-runtime/verify-trial-badges.mjs'],{cwd:root,stdio:'inherit'});
if(trialBadges.status!==0)process.exit(trialBadges.status??1);
const deletionApi=spawnSync(process.execPath,['test-runtime/verify-submission-deletion-api.mjs'],{cwd:root,stdio:'inherit'});
if(deletionApi.status!==0)process.exit(deletionApi.status??1);
const levelSave=spawnSync(process.execPath,['test-runtime/verify-trial-level-save.mjs'],{cwd:root,stdio:'inherit'});
if(levelSave.status!==0)process.exit(levelSave.status??1);
const freeMockApi=spawnSync(process.execPath,['test-runtime/verify-free-mock-api.mjs'],{cwd:root,stdio:'inherit'});
if(freeMockApi.status!==0)process.exit(freeMockApi.status??1);
for(const file of ['test-runtime/verify-database.mjs','test-runtime/verify-leads.mjs','test-runtime/verify-trial-ui.mjs','test-runtime/verify-hooks.mjs','test-runtime/verify-learnworlds.mjs','test-runtime/verify-components.mjs','test-runtime/verify-server.mjs','test-runtime/verify-account-creation.mjs','test-runtime/verify-auth.mjs','test-runtime/verify-password-recovery.mjs','test-runtime/verify-password-recovery-security.mjs','test-runtime/verify-student-ui.mjs','test-runtime/verify-management-pages.mjs','test-runtime/verify-levels-reports.mjs','scripts/verify-phase3.mjs']){
  const args=[file];if(file==='scripts/verify-phase3.mjs'&&process.argv[2])args.push(process.argv[2]);
  const result=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit'});
  if(result.status!==0)process.exit(result.status??1);
}
console.log('PASS: all local regression suites');

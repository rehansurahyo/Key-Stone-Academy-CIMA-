import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
for(const file of ['test-runtime/verify-database.mjs','test-runtime/verify-hooks.mjs','test-runtime/verify-learnworlds.mjs','test-runtime/verify-components.mjs','test-runtime/verify-server.mjs','test-runtime/verify-account-creation.mjs','test-runtime/verify-auth.mjs','test-runtime/verify-password-recovery.mjs','test-runtime/verify-password-recovery-security.mjs','test-runtime/verify-student-ui.mjs','test-runtime/verify-management-pages.mjs','test-runtime/verify-levels-reports.mjs','scripts/verify-phase3.mjs']){
  const args=[file];if(file==='scripts/verify-phase3.mjs'&&process.argv[2])args.push(process.argv[2]);
  const result=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit'});
  if(result.status!==0)process.exit(result.status??1);
}
console.log('PASS: all local regression suites');

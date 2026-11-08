import assert from 'node:assert/strict';
import {loader} from './component-loader.mjs';

const load=loader({'server-only':{}});
const {renderEmail}=load('lib/email/templates.ts'),{STUDENT_RESOURCES}=load('lib/student-resources.ts');
const {sealLink,openLink}=load('lib/email/crypto.ts'),{dispatchEmails}=load('lib/email/dispatch.ts');
const {invitationProof,invitationPasswordSetter}=load('lib/enrolled-password.ts');
const uid='00000000-0000-4000-8000-000000001108',jobId='00000000-0000-4000-8000-000000001109';
const config={apiKey:'synthetic-brevo-key',sender:'info@example.invalid',replyTo:'info@example.invalid',origin:'https://student.example.test',encryptionKey:'ab'.repeat(32)};
for(const level of ['OCS','MCS','SCS'])for(const kind of ['trial_welcome','trial_submission','trial_feedback','enrolled_invitation']){
  const message=renderEmail({level,kind,fullName:'<script>alert(1)</script> Learner',examName:'Mock <b>1</b>',portalOrigin:config.origin,passwordLink:config.origin+'/set-password#synthetic'});
  assert.ok(message.subject.includes(level));assert.ok(!message.html.includes('<script>'));assert.ok(!message.html.includes('<b>1</b>'));
  assert.ok(message.html.includes('&lt;script&gt;'));assert.ok(!message.text.includes('{{'));
  if(kind==='trial_welcome')assert.ok(message.text.includes(STUDENT_RESOURCES[level].course)&&message.text.includes(STUDENT_RESOURCES[level].whatsapp));
  if(kind==='enrolled_invitation')assert.ok(!message.text.includes('WhatsApp')&&!message.text.includes('mini-course')&&!message.text.includes('three mock'));
}
const secret='https://student.example.test/set-password#token_hash='+('a'.repeat(64));
const encrypted=await sealLink(secret,config.encryptionKey,'bound-job');assert.ok(!encrypted.includes('token_hash'));
assert.equal(await openLink(encrypted,config.encryptionKey,'bound-job'),secret);
await assert.rejects(()=>openLink(encrypted,config.encryptionKey,'other-job'));
await assert.rejects(()=>openLink(encrypted,'cd'.repeat(32),'bound-job'));
for(const fragment of ['','#code=ordinary-login','#token_hash=short&user_id='+uid])assert.throws(()=>invitationProof(fragment));
const proof=invitationProof('#token_hash='+('a'.repeat(64))+'&user_id='+uid);
let verify=0,updates=0;
const auth={verifyOtp:async args=>{verify++;assert.deepEqual(args,{type:'recovery',token_hash:'a'.repeat(64)});return{data:{user:{id:uid},session:{user:{id:uid}}},error:null};},updateUser:async()=>{updates++;return{data:{user:{id:uid}},error:null};},signOut:async()=>({error:null})};
const set=invitationPasswordSetter({auth},proof);
assert.equal(verify,0,'Reading the invitation never consumes it or auto-signs in');
await assert.rejects(()=>set('short'));assert.equal(verify,0);
await set('SecurePassword123!');assert.equal(verify,1);assert.equal(updates,1);await assert.rejects(()=>set('SecurePassword234!'));
const wrong=invitationPasswordSetter({auth:{...auth,verifyOtp:async()=>({data:{user:{id:'other'},session:{user:{id:'other'}}},error:null})}},proof);
await assert.rejects(()=>wrong('SecurePassword123!'));assert.equal(updates,1,'Another account session must never receive the password mutation');
const expired=invitationPasswordSetter({auth:{...auth,verifyOtp:async()=>({data:{user:null,session:null},error:{message:'expired'}})}},proof);
await assert.rejects(()=>expired('SecurePassword123!'));assert.equal(updates,1);
let failUpdate=true;
const retry=invitationPasswordSetter({auth:{...auth,updateUser:async()=>failUpdate?{error:{message:'network'}}:{data:{user:{id:uid}},error:null}}},proof);
await assert.rejects(()=>retry('SecurePassword123!'));const beforeRetry=verify;failUpdate=false;await retry('SecurePassword123!');assert.equal(verify,beforeRetry,'A transient update failure reuses the already verified private session');
console.log('PASS: all 12 branded level/type variants escape content; invitation encryption is job-bound; ordinary sessions, expired tokens and wrong identities cannot set passwords');

function fixture(kind='trial_submission'){
  const row={id:jobId,kind,user_id:uid,submission_id:'submission',recipient:'learner@example.invalid',full_name:'Synthetic Learner',level:'OCS',exam_name:'Mock 1',generation:1,claim_token:'claim',encrypted_link:null,state:'pending'};
  let generated=0,profileAccess=kind==='enrolled_invitation'?'enrolled':'trial',published=true,ackFailures=0;
  const admin={rpc:async(name,args)=>{
    if(name==='claim_portal_email'){if(row.state!=='pending')return{data:[],error:null};row.state='sending';return{data:[{...row}],error:null};}
    if(name==='prepare_portal_email'){assert.equal(args.p_claim,row.claim_token);row.encrypted_link=args.p_encrypted_link;return{data:true,error:null};}
    if(name==='finish_portal_email'){if(ackFailures>0&&args.p_state==='sent'){ackFailures--;return{data:null,error:{message:'lost ack'}};}row.state=args.p_state;row.error_code=args.p_error_code;if(args.p_state==='sent')row.encrypted_link=null;return{data:true,error:null};}
    throw new Error('Unexpected RPC '+name);
  },from(table){return{select(){return this;},eq(){return this;},maybeSingle:async()=>({error:null,data:table==='profiles'?{id:uid,role:'student',is_active:true,access_type:profileAccess,email:row.recipient}:{status:published?'published':'draft'}})};},auth:{admin:{getUserById:async()=>({data:{user:{id:uid,email:row.recipient}},error:null}),generateLink:async args=>{generated++;assert.equal(args.type,'recovery');return{data:{user:{id:uid},properties:{hashed_token:'a'.repeat(64)}},error:null};}}}};
  return{row,admin,get generated(){return generated;},set access(value){profileAccess=value;},set published(value){published=value;},set ackFailures(value){ackFailures=value;}};
}
const accepted=fixture();let sent=0;
await dispatchEmails(accepted.admin,config,async(url,options)=>{sent++;assert.equal(url,'https://api.brevo.com/v3/smtp/email');const data=JSON.parse(options.body);assert.equal(data.to.length,1);assert.equal(data.to[0].email,accepted.row.recipient);assert.equal(data.replyTo.email,config.replyTo);assert.equal(data.headers.idempotencyKey,options.headers.idempotencyKey);return Response.json({messageId:'synthetic-provider-id'},{status:201});});assert.equal(sent,1);assert.equal(accepted.row.state,'sent');
const duplicate=fixture();await dispatchEmails(duplicate.admin,config,async()=>Response.json({code:'duplicate_parameter'},{status:400}));assert.equal(duplicate.row.state,'sent');
const rejected=fixture();await dispatchEmails(rejected.admin,config,async()=>Response.json({message:'bad config'},{status:403}));assert.equal(rejected.row.state,'failed');
const draft=fixture('trial_feedback');draft.published=false;await dispatchEmails(draft.admin,config,async()=>{throw new Error('Draft feedback must never send');});assert.equal(draft.row.state,'cancelled');
const upgraded=fixture();upgraded.access='enrolled';await dispatchEmails(upgraded.admin,config,async()=>{throw new Error('Trial audience changed');});assert.equal(upgraded.row.state,'cancelled');
const invite=fixture('enrolled_invitation'),bodies=[];
let loseResponse=true;
await dispatchEmails(invite.admin,config,async(_url,options)=>{bodies.push(JSON.parse(options.body));if(loseResponse){loseResponse=false;throw new Error('Response lost after provider accepted');}return Response.json({messageId:'recovered'},{status:201});});
assert.equal(invite.row.state,'sent');assert.equal(invite.generated,1);assert.equal(bodies.length,2);assert.deepEqual(bodies[0],bodies[1],'Uncertain retries must use the same password link and provider dedupe key');
const lostAck=fixture();lostAck.ackFailures=1;let keys=[];await dispatchEmails(lostAck.admin,config,async(_url,options)=>{keys.push(options.headers.idempotencyKey);return keys.length===1?Response.json({messageId:'accepted'},{status:201}):Response.json({code:'duplicate_parameter'},{status:400});});assert.equal(lostAck.row.state,'sent');assert.equal(new Set(keys).size,1);
console.log('PASS: mocked Brevo acceptance, rejected settings, duplicate responses, unpublished feedback, audience changes, lost responses and failed acknowledgements preserve one recipient and stable encrypted invitation links');

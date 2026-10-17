import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import JSZip from '../node_modules/jszip/lib/index.js';
import React from '../node_modules/react/index.js';
import { renderToStaticMarkup } from '../node_modules/react-dom/server.node.js';
import { loader } from './component-loader.mjs';

const load=loader({'server-only':{}});
const {buildAnswerDocx}=load('lib/answer-docx.ts');
const {buildAnswerPdf}=load('lib/answer-pdf.ts');
const {buildAnswerModel,ANSWER_STYLE}=load('lib/answer-export-model.ts');
const {answerDownloadFilename}=load('lib/answer-download-filename.ts');
const {AnswerDownloads}=load('components/dashboard/answer-downloads.tsx');
const question={id:'q1',exam_id:'mock',question_id:'section-1',position:1,duration_seconds:3600,content:{subject:'Funding & strategic risk',taskPrompt:'Prepare briefing papers for the Finance Director.',subtasks:[{description:'Evaluate the funding alternatives',weightage:55},{description:'Assess the strategic risks',weightage:45}],weightageUnit:'percent'}};
const rows=Array.from({length:32},(_,i)=>`<tr><td>Investment option ${i+1}</td><td>£${1200+i*50}</td><td>Review cash flow and risk before approval.</td></tr>`).join('');
const input={examName:'Strategic Case Study - Mock 3',level:'SCS',candidate:'Zoë Ahmed',submittedAt:'2026-10-15T09:30:00Z',questions:[question,{...question,id:'q2',question_id:'section-2',position:2,content:{...question.content,subject:'Governance review'}}],answers:{
  'section-1':`<p><strong>From:</strong> Senior Finance Manager</p><p><strong>To:</strong> Agata Paluch, CFO</p><p><strong>Subject:</strong> Funding &amp; strategic risk</p><h2>Recommendation</h2><p>First explicit line<br>Second explicit line<br><br>Fourth explicit line</p><p>Preserve <strong>bold</strong>, <em>italic</em>, <u>underline</u>, <s>strike</s> and symbols £1,200 / €400.</p><p style="text-align:center">Centred conclusion</p><p style="text-align:right">Right aligned sign-off</p><ol start="3"><li><p>Assess the financing options.</p><ul><li><p>Consider liquidity and covenant headroom.</p></li><li><p>Review the downside scenario.</p></li></ul></li><li><p>Present a balanced recommendation.</p></li></ol><table><thead><tr><th colspan="2"><p>Financial outlook</p></th><th><p>Judgement</p></th></tr></thead><tbody><tr><td rowspan="2"><p>Group total</p></td><td><p>£1,200</p></td><td><p>Approve with conditions</p></td></tr><tr><td><p>£900</p></td><td><p>Monitor cash headroom</p></td></tr></tbody></table><h2>Detailed options</h2><table><thead><tr><th><p>Option</p></th><th><p>NPV</p></th><th><p>Assessment</p></th></tr></thead><tbody>${rows}</tbody></table><script>DO_NOT_EXPORT_SCRIPT</script><img src="https://untrusted.example/never-fetch.png" />`,
  'section-2':'<p>Governance must support clear accountability.</p><p></p><p>End of second response.</p>',
  'historic-id':'<p>Historical response retained.</p>',
}};
const model=buildAnswerModel(input);
function paragraphs(blocks){return blocks.flatMap(block=>block.kind==='paragraph'?[block]:block.kind==='list'?block.items.flatMap(paragraphs):block.rows.flatMap(row=>row.flatMap(cell=>paragraphs(cell.blocks))));}
const text=paragraphs(model).map(block=>block.runs.map(run=>run.text).join('')).join('\n');
assert.ok(text.includes('First explicit line\nSecond explicit line\n\nFourth explicit line'));
assert.ok(text.includes('55%'));assert.ok(text.includes('45%'));assert.ok(text.includes('Historical response retained.'));
assert.ok(!text.includes('DO_NOT_EXPORT_SCRIPT'));assert.ok(!text.includes('untrusted.example'));
const docx=await buildAnswerDocx(input);const zip=await JSZip.loadAsync(docx);const xml=await zip.file('word/document.xml').async('string');
for(const token of ['Zoë Ahmed','2026-10-15T09:30:00.000Z','55%','45%','Historical response retained.','Governance must support clear accountability.'])assert.ok(xml.includes(token),token);
assert.ok(xml.includes('<w:br'));assert.ok(xml.includes('<w:tbl'));assert.ok(xml.includes('w:gridSpan'));assert.ok(xml.includes('w:vMerge'));
assert.ok((await zip.file('word/styles.xml').async('string')).includes(ANSWER_STYLE.font));
assert.ok(Object.keys(zip.files).some(name=>name.includes('/fonts/')&&name.endsWith('.odttf')),'Word embeds the same regular font used by PDF');
const pdf=await buildAnswerPdf(input);assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert.ok(pdf.length>10000);
assert.equal(answerDownloadFilename(input.candidate,input.examName,input.submittedAt),'ZoeAhmed_Mock3_2026-10-15_1430.docx');
assert.equal(answerDownloadFilename(input.candidate,input.examName,input.submittedAt,'pdf'),'ZoeAhmed_Mock3_2026-10-15_1430.pdf');
const html=renderToStaticMarkup(React.createElement(AnswerDownloads,{submissionId:'test-submission'}));
assert.ok(html.includes('Download as Word (.docx)'));assert.ok(html.includes('Download as PDF (.pdf)'));
assert.ok(html.includes('/answers?format=docx'));assert.ok(html.includes('/answers?format=pdf'));
const output=new URL('./tmp/pdfs/',import.meta.url);await mkdir(output,{recursive:true});
await writeFile(new URL('answer-export.pdf',output),pdf);await writeFile(new URL('answer-export.docx',output),docx);
await writeFile(new URL('expected-text.json',output),JSON.stringify({text,candidate:input.candidate}));
console.log('PASS: both real export formats preserve metadata, rich formatting, explicit breaks, nested lists, merged tables, legacy responses, naming and distinct staff download actions');
console.log('QA PDF: test-runtime/tmp/pdfs/answer-export.pdf');

import assert from 'node:assert/strict';
import {loader} from './component-loader.mjs';
const {validateExamMaterial,isReferenceImage,MAX_MATERIAL_BYTES}=loader()('lib/exam-material-files.ts');
const png=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13]);
const jpeg=new Uint8Array([255,216,255,224,0,16]);
for(const [name,bytes,type,extension] of [['ref.pdf','%PDF-1.7','application/pdf','pdf'],['ref.PNG',png,'image/png','png'],['ref.JPG',jpeg,'image/jpeg','jpg'],['ref.jpeg',jpeg,'image/jpeg','jpg']]){
  assert.deepEqual(await validateExamMaterial(new File([bytes],name),'reference'),{contentType:type,extension});
}
for(const [name,bytes] of [['script.svg','<svg/>'],['fake.png','<html>'],['fake.jpg',png],['fake.pdf',png],['image.webp','RIFFfake']]){
  await assert.rejects(()=>validateExamMaterial(new File([bytes],name),'reference'),/valid PDF, PNG or JPG/);
}
for(const kind of ['preseen','solution'])await assert.rejects(()=>validateExamMaterial(new File([png],'ref.png'),kind),/not a valid PDF/);
await assert.rejects(()=>validateExamMaterial(new File([],'empty.pdf'),'reference'),/between 1 byte and 20 MB/);
await assert.rejects(()=>validateExamMaterial(new File([new Uint8Array(MAX_MATERIAL_BYTES+1)],'large.png'),'reference'),/between 1 byte and 20 MB/);
assert.equal(isReferenceImage('tutor/ref.PNG'),true);assert.equal(isReferenceImage('tutor/ref.jpeg'),true);assert.equal(isReferenceImage('tutor/ref.pdf'),false);
console.log('PASS: PDF/PNG/JPEG signatures and extensions, size bounds, mismatches and unsupported files; pre-seen and solutions stay PDF-only');

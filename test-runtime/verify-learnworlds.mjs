import assert from 'node:assert/strict';
import React from '../node_modules/react/index.js';
import {renderToStaticMarkup} from '../node_modules/react-dom/server.node.js';
import {loader} from './component-loader.mjs';

const key='NEXT_PUBLIC_LEARNWORLDS_SCHOOL_URL';
const previous=process.env[key];
try {
  delete process.env[key];
  let load=loader();
  const {resolveLearnWorldsSchoolUrl,DEFAULT_LEARNWORLDS_SCHOOL_URL,LEARNWORLDS_SCHOOL_URL}=load('lib/learnworlds.ts');
  assert.equal(LEARNWORLDS_SCHOOL_URL,'https://learn.keystoneacademia.com/');
  for(const invalid of [undefined,'','  ','not-a-url','javascript:alert(1)','http://learn.keystoneacademia.com','https://user:secret@example.com','//example.com']) {
    assert.equal(resolveLearnWorldsSchoolUrl(invalid),DEFAULT_LEARNWORLDS_SCHOOL_URL);
  }
  assert.equal(resolveLearnWorldsSchoolUrl(' https://Learn.keystoneacademia.com '),DEFAULT_LEARNWORLDS_SCHOOL_URL);
  assert.equal(resolveLearnWorldsSchoolUrl('https://school.example.com/courses'),'https://school.example.com/courses');
  console.log('PASS: LearnWorlds defaults, URL normalization and unsafe configuration fallback');

  process.env[key]='https://school.example.com/courses';
  load=loader();
  const {LearnWorldsLink}=load('components/learnworlds-link.tsx');
  const markup=renderToStaticMarkup(React.createElement(LearnWorldsLink));
  assert.match(markup,/href="https:\/\/school\.example\.com\/courses"/);
  assert.match(markup,/target="_blank" rel="noopener noreferrer"/);
  assert.match(markup,/opens in a new tab/);
  assert.ok(markup.includes('Learning portal'));
  console.log('PASS: environment-configured accessible LearnWorlds link opens a protected new tab');
} finally {
  if(previous===undefined)delete process.env[key];else process.env[key]=previous;
}

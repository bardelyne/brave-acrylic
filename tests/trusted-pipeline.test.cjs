'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {proofFor, REPOSITORY_ID, artifactName} = require('../tools/trusted-pipeline.cjs');
const context = {runId:123, headSha:'a'.repeat(40), sha256:'b'.repeat(64), size:1411,key:'A'.repeat(32)+'1'};
function artifact() { return {id:456,name:artifactName(context.key),digest:'sha256:' + context.sha256,size_in_bytes:1411,
  workflow_run:{id:123,head_sha:context.headSha,head_branch:'main',repository_id:REPOSITORY_ID,
    head_repository_id:REPOSITORY_ID}}; }
test('published locator binds the raw cache to GitHub artifact metadata', () => {
  assert.deepEqual(proofFor(artifact(),context),{schema:1,artifactId:456,artifactName:artifactName(context.key),runId:123,sha256:context.sha256});
});
test('another PDB identity cannot borrow a valid artifact digest',()=>{
  assert.throws(()=>proofFor(artifact(),{...context,key:'B'.repeat(32)+'1'}));
  for(const key of ['', '../file', 'a'.repeat(33),'A'.repeat(32)+'0'])assert.throws(()=>artifactName(key));
});
test('wrong bytes, repository, fork, branch, run, revision or artifact type cannot be published', () => {
  for(const mutate of [a=>a.id=-1,a=>a.digest='sha256:'+'c'.repeat(64),a=>a.name='other.txt',
    a=>a.size_in_bytes++,a=>a.workflow_run.id++,a=>a.workflow_run.head_sha='c'.repeat(40),
    a=>a.workflow_run.head_branch='other',a=>a.workflow_run.repository_id++,
    a=>a.workflow_run.head_repository_id++]) {
    const value=artifact();mutate(value);assert.throws(()=>proofFor(value,context));
  }
});

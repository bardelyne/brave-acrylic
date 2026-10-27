// MIT. GitHub owns artifact digests/run identity; branch JSON is only a locator.
'use strict';
const REPOSITORY_ID = 1428612836;
const ARTIFACT_NAME = 'cache.txt'; // upload-artifact v7, archive:false uses the filename.
function check(ok, message) { if (!ok) throw Error(message); }
function positive(value) { return Number.isSafeInteger(value) && value > 0; }
function proofFor(artifact, {runId, headSha, sha256, size}) {
  check(positive(runId) && /^[a-f0-9]{40}$/.test(headSha) && /^[a-f0-9]{64}$/.test(sha256),
    'Invalid trusted generation context');
  check(positive(artifact?.id) && artifact.name === ARTIFACT_NAME &&
    artifact.digest === 'sha256:' + sha256 && artifact.size_in_bytes === size &&
    artifact.workflow_run?.id === runId && artifact.workflow_run.head_sha === headSha &&
    artifact.workflow_run.head_branch === 'main' &&
    artifact.workflow_run.repository_id === REPOSITORY_ID &&
    artifact.workflow_run.head_repository_id === REPOSITORY_ID,
  'GitHub artifact does not match this generation run and cache digest');
  return {schema:1, artifactId:artifact.id, runId, sha256};
}
module.exports = {REPOSITORY_ID, ARTIFACT_NAME, proofFor};

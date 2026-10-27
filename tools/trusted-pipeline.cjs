// MIT. GitHub owns artifact digests/run identity; branch JSON is only a locator.
'use strict';
const REPOSITORY_ID = 1428612836;
function artifactName(key) {
  check(typeof key === 'string' && /^[A-F0-9]{32}[1-9A-F][A-F0-9]{0,7}$/.test(key), 'Invalid PDB identity');
  return `pdb_${key}.txt`; // Raw artifact metadata binds these bytes to this PDB.
}
function check(ok, message) { if (!ok) throw Error(message); }
function positive(value) { return Number.isSafeInteger(value) && value > 0; }
function proofFor(artifact, {runId, headSha, sha256, size, key}) {
  check(positive(runId) && /^[a-f0-9]{40}$/.test(headSha) && /^[a-f0-9]{64}$/.test(sha256),
    'Invalid trusted generation context');
  const name = artifactName(key);
  check(positive(artifact?.id) && artifact.name === name &&
    artifact.digest === 'sha256:' + sha256 && artifact.size_in_bytes === size &&
    artifact.workflow_run?.id === runId && artifact.workflow_run.head_sha === headSha &&
    artifact.workflow_run.head_branch === 'main' &&
    artifact.workflow_run.repository_id === REPOSITORY_ID &&
    artifact.workflow_run.head_repository_id === REPOSITORY_ID,
  'GitHub artifact does not match this generation run and cache digest');
  return {schema:1, artifactId:artifact.id, artifactName:name, runId, sha256};
}
module.exports = {REPOSITORY_ID, artifactName, proofFor};

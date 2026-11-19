'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  FORMAT, EXTRACTOR, ABI_REVISION, CLIENT_VERSION, releaseIdentity,
} = require('../tools/compatibility-release.cjs');

const worker = import('../tools/release-poller/worker.mjs');
const tag = 'v1.100.58';
const name = 'brave-' + tag + '-win32-x64.zip';
const asset = { name, id: 10, size: 200000000, updated_at: '2026-11-19T00:00:00Z' };
const release = {
  tag_name: tag, draft: false, prerelease: false,
  assets: [asset, { ...asset, name: name + '.sha256', id: 11, size: 100 }],
};
const current = {
  tag, format: FORMAT, extractor: EXTRACTOR, abiRevision: ABI_REVISION, clientVersion: CLIENT_VERSION,
  sha256: '0'.repeat(64), assets: releaseIdentity(release).assets,
};

function fakeFetch(...responses) {
  const calls = [];
  return {
    calls,
    async request(url, init) {
      calls.push({ url, ...init });
      assert.ok(responses.length, 'Unexpected network request');
      return responses.shift();
    },
  };
}

test('a current cache only uses public reads', async () => {
  const { pollRelease } = await worker;
  const { calls, request } = fakeFetch(Response.json(release), Response.json(current));
  assert.deepEqual(await pollRelease('test-token', request), { tag, dispatched: false });
  assert.deepEqual(calls.map(call => call.url), [
    'https://api.github.com/repos/brave/brave-browser/releases/latest',
    'https://raw.githubusercontent.com/bardelyne/brave-acrylic/symbol-cache/feature-releases-v' +
      ABI_REVISION + '/' + tag + '.json',
  ]);
  assert.ok(calls.every(call => call.headers?.Authorization === undefined));
});

test('missing, malformed and stale records dispatch the exact stable tag', async () => {
  const { pollRelease } = await worker;
  const changedArchive = { ...current.assets.archive, id: 9 };
  for (const record of [
    new Response(null, { status: 404 }),
    new Response('invalid JSON'),
    Response.json({ ...current, abiRevision: ABI_REVISION - 1 }),
    Response.json({ ...current, assets: { ...current.assets, archive: changedArchive } }),
  ]) {
    const { calls, request } = fakeFetch(Response.json(release), record, new Response(null, { status: 204 }));
    assert.deepEqual(await pollRelease('test-token', request), { tag, dispatched: true });
    assert.equal(calls.length, 3);
    const dispatch = calls[2];
    assert.equal(dispatch.url,
      'https://api.github.com/repos/bardelyne/brave-acrylic/actions/workflows/compatibility.yml/dispatches');
    assert.equal(dispatch.method, 'POST');
    assert.equal(dispatch.headers.Authorization, 'Bearer test-token');
    assert.equal(dispatch.redirect, 'manual');
    assert.deepEqual(JSON.parse(dispatch.body), { ref: 'main', inputs: { tag } });
  }
});

test('temporary HTTP failures and unfit upstream releases do not trigger builds', async () => {
  const { pollRelease } = await worker;
  for (const [responses, reason] of [
    [[new Response(null, { status: 429 })], /release check failed.*429/],
    [[Response.json({ ...release, prerelease: true })], /stable Brave releases/],
    [[Response.json({ ...release, assets: [] })], /Missing or ambiguous official asset/],
    [[Response.json(release), new Response(null, { status: 503 })], /cache check failed.*503/],
  ]) {
    const total = responses.length;
    const { calls, request } = fakeFetch(...responses);
    await assert.rejects(pollRelease('test-token', request), reason);
    assert.equal(calls.length, total);
    assert.ok(calls.every(call => call.method === undefined));
  }
});

test('missing credentials and rejected dispatch are reported', async () => {
  const { pollRelease } = await worker;
  const missing = fakeFetch(Response.json(release), new Response(null, { status: 404 }));
  await assert.rejects(pollRelease('', missing.request), /Missing GITHUB_DISPATCH_TOKEN/);
  assert.equal(missing.calls.length, 2);
  for (const status of [302, 403]) {
    const rejected = fakeFetch(Response.json(release), new Response(null, { status: 404 }),
      new Response(null, { status }));
    await assert.rejects(pollRelease('test-token', rejected.request), new RegExp('dispatch failed.*' + status));
    assert.equal(rejected.calls.length, 3);
  }
});

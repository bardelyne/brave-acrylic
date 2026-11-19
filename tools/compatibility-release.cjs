// MIT. Shared Brave release and cache identity.
'use strict';
const REPOSITORY = 'bardelyne/brave-acrylic';
const BRANCH = 'symbol-cache';
const FORMAT = 'windhawk-feature-cache-v1', EXTRACTOR = 1, ABI_REVISION = 9;
const CLIENT_VERSION = '4.0';
const CACHE_ROOT = 'brave-acrylic-features-v' + ABI_REVISION;
const RELEASE_ROOT = 'feature-releases-v' + ABI_REVISION;

function check(ok, message) { if (!ok) throw Error(message); }
function tagName(value) {
  check(/^v\d{1,3}\.\d{1,3}\.\d{1,5}$/.test(value), 'Expected a stable Brave tag such as v1.98.60');
  return value;
}
function assetIdentity(asset, name, limit) {
  check(asset && asset.name === name && Number.isSafeInteger(asset.id) && asset.id > 0 &&
    Number.isSafeInteger(asset.size) && asset.size > 0 && asset.size <= limit &&
    typeof asset.updated_at === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(asset.updated_at) &&
    Number.isFinite(Date.parse(asset.updated_at)) &&
    (asset.digest == null || /^sha256:[a-f0-9]{64}$/.test(asset.digest)), 'Invalid official release asset');
  return {id:asset.id, name, size:asset.size, updated_at:asset.updated_at, digest:asset.digest ?? null};
}
function releaseIdentity(release) {
  const tag = tagName(release.tag_name), name = `brave-${tag}-win32-x64.zip`;
  check(release.draft === false && release.prerelease === false && Array.isArray(release.assets),
    'Only stable Brave releases are generated automatically');
  const find = filename => {
    const matches = release.assets.filter(a => a.name === filename);
    check(matches.length === 1, 'Missing or ambiguous official asset'); return matches[0];
  };
  return {tag, name, assets:{archive:assetIdentity(find(name), name, 1024 ** 3),
    checksum:assetIdentity(find(name + '.sha256'), name + '.sha256', 4096)}};
}

module.exports = {REPOSITORY, BRANCH, FORMAT, EXTRACTOR, ABI_REVISION, CLIENT_VERSION, CACHE_ROOT, RELEASE_ROOT,
  tagName, assetIdentity, releaseIdentity};

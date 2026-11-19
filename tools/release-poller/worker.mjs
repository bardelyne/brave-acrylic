// MIT. Check for an unpublished Brave release without starting a GitHub runner.
import compatibility from '../compatibility-release.cjs';

const {
  REPOSITORY, BRANCH, FORMAT, EXTRACTOR, ABI_REVISION, CLIENT_VERSION,
  RELEASE_ROOT, releaseIdentity,
} = compatibility;
const api = 'https://api.github.com';
const apiHeaders = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'brave-acrylic-release-poller',
  'X-GitHub-Api-Version': '2026-03-10',
};

function hasCurrentRecord(record, release) {
  return record?.tag === release.tag && record.format === FORMAT &&
    record.extractor === EXTRACTOR && record.abiRevision === ABI_REVISION &&
    record.clientVersion === CLIENT_VERSION &&
    typeof record.sha256 === 'string' && /^[a-f0-9]{64}$/.test(record.sha256) &&
    Object.entries(release.assets).every(([kind, asset]) =>
      Object.entries(asset).every(([key, value]) => record.assets?.[kind]?.[key] === value));
}

export async function pollRelease(dispatchToken, request = fetch) {
  const requestOptions = () => ({ redirect: 'manual', signal: AbortSignal.timeout(15000) });
  const latest = await request(api + '/repos/brave/brave-browser/releases/latest', {
    ...requestOptions(), headers: apiHeaders,
  });
  if (!latest.ok) throw new Error('Brave release check failed (HTTP ' + latest.status + ')');
  const release = releaseIdentity(await latest.json());

  const recordUrl = 'https://raw.githubusercontent.com/' + REPOSITORY + '/' +
    BRANCH + '/' + RELEASE_ROOT + '/' + release.tag + '.json';
  const published = await request(recordUrl, requestOptions());
  if (published.ok) {
    let record;
    // Read outside the JSON catch so a failed transfer is retried on the next tick.
    const body = await published.text();
    try { record = JSON.parse(body); } catch { /* A malformed record needs regeneration. */ }
    if (hasCurrentRecord(record, release)) return { tag: release.tag, dispatched: false };
  } else if (published.status !== 404) {
    throw new Error('Published cache check failed (HTTP ' + published.status + ')');
  }

  if (!dispatchToken) throw new Error('Missing GITHUB_DISPATCH_TOKEN');
  const trigger = await request(api + '/repos/' + REPOSITORY +
    '/actions/workflows/compatibility.yml/dispatches', {
    ...requestOptions(),
    method: 'POST',
    headers: { ...apiHeaders, Authorization: 'Bearer ' + dispatchToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: 'main', inputs: { tag: release.tag } }),
  });
  if (!trigger.ok) throw new Error('Compatibility dispatch failed (HTTP ' + trigger.status + ')');
  return { tag: release.tag, dispatched: true };
}

export default {
  async scheduled(_event, env) {
    const { tag, dispatched } = await pollRelease(env.GITHUB_DISPATCH_TOKEN);
    console.log(tag + (dispatched ? ' dispatched' : ' already published'));
  },
};

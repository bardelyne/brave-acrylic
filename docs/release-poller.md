# Brave release poller

The Cloudflare Worker runs at 17 and 47 minutes past each hour in UTC. It reads the latest stable Brave release and the corresponding record on `symbol-cache`. If the record is missing or its release assets have changed, the Worker dispatches the compatibility workflow with the exact stable tag it checked. Temporary upstream failures are retried on the next scheduled check.

GitHub Actions verifies the release and generates and publishes the symbol cache. Manual dispatch remains available to backfill an older stable release or regenerate the cache after extractor changes that leave the shared cache version unchanged.

## Activate the poller

1. In GitHub, create a fine-grained token restricted to `bardelyne/brave-acrylic` with **Actions: Read and write**. Note its expiration date so you can rotate it in Cloudflare before it expires.
2. Open [Workers & Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages). Complete the account's `workers.dev` setup if prompted. Cloudflare requires it to turn on the schedule. The Worker has no public route.
3. From the repository root, sign in to the Cloudflare account with Wrangler. Use the operating system keyring to store the Cloudflare login. Deploy the Worker and store the GitHub token as a Worker secret. Wrangler prompts for the secret value. You can also enter the secret directly under the Worker's **Settings → Variables and Secrets**.

   ```sh
   npx wrangler@4 login --use-keyring --scopes account:read user:read workers_scripts:write
   npx wrangler@4 deploy --config tools/release-poller/wrangler.jsonc
   npx wrangler@4 secret put GITHUB_DISPATCH_TOKEN --config tools/release-poller/wrangler.jsonc
   ```

4. Check Cloudflare's Worker logs after a scheduled tick. A current release logs `already published`. A missing cache logs `dispatched` and starts the workflow. If the cache is already current, verify the token can dispatch a normal run for that tag with `force` left off before switching off GitHub's schedule. Merge the dispatch-only workflow configuration after these checks pass.

Redeploy the Worker when `tools/compatibility-release.cjs` changes. GitHub's **Run workflow** button is available for manual recovery if the Worker is unavailable.

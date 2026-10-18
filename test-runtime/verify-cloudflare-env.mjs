import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const wranglerRequire = createRequire(require.resolve('wrangler'));
const { Miniflare } = wranglerRequire('miniflare');
const config = JSON.parse(await readFile(new URL('../wrangler.json', import.meta.url), 'utf8'));
assert.ok(config.compatibility_flags.includes('nodejs_compat'));
assert.ok(config.compatibility_flags.includes('nodejs_compat_populate_process_env'));

// Real local Workers runtime, dummy binding only. No Supabase requests,
// credentials, student accounts, or deployed configuration are touched.
const script = `import process from 'node:process';
export default { fetch(request, bindings) {
  return Response.json({
    bindingPresent: Boolean(bindings.SUPABASE_SERVICE_ROLE_KEY),
    processEnvPresent: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
  });
}};`;
for (const enabled of [false, true]) {
  const flags = config.compatibility_flags.filter(flag => enabled || flag !== 'nodejs_compat_populate_process_env');
  const runtime = new Miniflare({ modules: true, script,
    compatibilityDate: config.compatibility_date,
    compatibilityFlags: flags,
    bindings: { SUPABASE_SERVICE_ROLE_KEY: 'dummy-local-regression-value' },
  });
  try {
    const response = await runtime.dispatchFetch('http://localhost/env-check');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { bindingPresent: true, processEnvPresent: enabled });
  } finally { await runtime.dispose(); }
}
console.log('PASS: old configuration reproduces unavailable process.env; configured compatibility flag exposes the dummy Worker secret');

// End-to-end smoke test: starts the real server offline on a free port and walks the whole workflow
// through the HTTP API, including the failure paths. Run with `npm test`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let child;
let base;

before(async () => {
  const env = { ...process.env, SLACK_BOT_TOKEN: '', SLACK_APP_TOKEN: '', MERIDIAN_HOST: '127.0.0.1' };
  child = spawn(process.execPath, ['src/index.js', '--offline', '--port', '0', '--no-slack'], { cwd: appDir, env });
  base = await new Promise((resolve, reject) => {
    let out = '';
    const timer = setTimeout(() => reject(new Error(`server did not start: ${out}`)), 15000);
    child.stdout.on('data', d => {
      out += d;
      const m = out.match(/at (http:\/\/[^\s]+)/);
      if (m) { clearTimeout(timer); resolve(m[1]); }
    });
    child.stderr.on('data', d => { out += d; });
    child.on('exit', code => reject(new Error(`server exited early (${code}): ${out}`)));
  });
});

after(() => { if (child) child.kill('SIGTERM'); });

async function call(method, p, body) {
  const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, body: await res.json() };
}

test('health reports offline mode and the pinned demo date', async () => {
  const r = await call('GET', '/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.body.mode, 'offline');
  assert.equal(r.body.demo_today, '2026-11-04');
});

test('catalog search ranks by the job described', async () => {
  const r = await call('GET', '/api/listings?q=research%20accounts%20sales%20calls');
  assert.equal(r.status, 200);
  assert.equal(r.body[0].listing_id, 'orbit');
  const all = await call('GET', '/api/listings');
  assert.equal(all.body.find(l => l.listing_id === 'fieldnote').is_stale, true);
  assert.equal(all.body.find(l => l.listing_id === 'icpscout').soc2, 'Not provided');
});

test('bad input gets a 4xx with a clear message', async () => {
  assert.equal((await call('POST', '/api/run', {})).status, 400);
  assert.equal((await call('POST', '/api/run', { workspaceId: 'nw-freight', listingId: 'orbit', promptId: 'orbit-brief', userId: 'jordan', surface: 'fax' })).status, 400);
  assert.equal((await call('GET', '/api/listings/nope')).status, 404);
  assert.equal((await call('GET', '/api/nothing-here')).status, 404);
  const bad = await fetch(`${base}/api/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{not json' });
  assert.equal(bad.status, 400);
});

test('hero run: buy, set policy, deploy, then a cited brief with a stale-data warning', async () => {
  const early = await call('POST', '/api/run', { workspaceId: 'nw-freight', listingId: 'orbit', promptId: 'orbit-brief', userId: 'jordan' });
  assert.equal(early.status, 409);
  assert.equal(early.body.error, 'not_deployed');

  assert.equal((await call('POST', '/api/workspaces/nw-freight/installs/orbit/approve', { userId: 'priya' })).status, 409, 'cannot deploy before purchase');
  assert.equal((await call('POST', '/api/workspaces/nw-freight/installs/orbit/purchase', { userId: 'marcus', plan: 'gold', payVia: 'commitment' })).status, 400);
  const buy = await call('POST', '/api/workspaces/nw-freight/installs/orbit/purchase', { userId: 'marcus', plan: 'annual', payVia: 'commitment' });
  assert.equal(buy.status, 200);
  assert.equal(buy.body.install.status, 'purchased');
  const again = await call('POST', '/api/workspaces/nw-freight/installs/orbit/purchase', { userId: 'marcus', plan: 'annual', payVia: 'commitment' });
  assert.equal(again.body.alreadyPurchased, true, 'purchase is idempotent');

  assert.equal((await call('POST', '/api/workspaces/nw-freight/installs/orbit/approve', { userId: 'jordan' })).status, 403, 'only IT admins approve');
  const pol = await call('PUT', '/api/workspaces/nw-freight/installs/orbit/policy', { userId: 'priya', tools: { sync_to_crm: true }, spendCap: 2000 });
  assert.equal(pol.status, 200);
  assert.equal(pol.body.install.policy_version, 2);
  assert.equal((await call('PUT', '/api/workspaces/nw-freight/installs/orbit/policy', { userId: 'priya', tools: { teleport: true } })).status, 400);
  assert.equal((await call('POST', '/api/workspaces/nw-freight/installs/orbit/approve', { userId: 'priya' })).status, 200);

  const run = await call('POST', '/api/run', { workspaceId: 'nw-freight', listingId: 'orbit', promptId: 'orbit-brief', userId: 'jordan', surface: 'slack', idempotencyKey: 'hero-1' });
  assert.equal(run.status, 200);
  assert.equal(run.body.status, 'answered');
  assert.ok(run.body.answer.claims.every(c => c.evidence_id && c.source), 'every claim is cited');
  assert.ok(run.body.answer.claims.some(c => c.stale), 'Fieldnote claims are flagged stale');
  assert.equal(run.body.warnings.length, 1);
  assert.deepEqual(run.body.usage, { calls: 2, cost_usd: 0.08 });

  const replay = await call('POST', '/api/run', { workspaceId: 'nw-freight', listingId: 'orbit', promptId: 'orbit-brief', userId: 'jordan', surface: 'slack', idempotencyKey: 'hero-1' });
  assert.equal(replay.body.replayed, true);
  assert.equal(replay.body.run_id, run.body.run_id);
  const usage = await call('GET', '/api/workspaces/nw-freight/usage');
  assert.equal(usage.body.total_usd, 0.08, 'a replay is not billed twice');
});

test('policy blocks a group IT did not enable', async () => {
  const r = await call('POST', '/api/run', { workspaceId: 'nw-freight', listingId: 'orbit', promptId: 'orbit-brief', userId: 'riley' });
  assert.equal(r.status, 403);
  assert.equal(r.body.error, 'group_not_allowed');
});

test('validator catches an uncited claim, retries, and keeps unknowns as unknown', async () => {
  const r = await call('POST', '/api/run', { workspaceId: 'nw-capital', listingId: 'conviction', promptId: 'conviction-memo', userId: 'avery' });
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'answered');
  assert.ok(r.body.trace.some(t => t.state === 'reject' && t.detail.includes('profitable by 2027')));
  assert.ok(!r.body.answer.claims.some(c => c.text.includes('profitable')));
  assert.ok(r.body.answer.claims.some(c => c.kind === 'unknown'));
});

test('writes wait for the owner; nobody else can approve; approval only records', async () => {
  const r = await call('POST', '/api/run', { workspaceId: 'nw-capital', listingId: 'conviction', promptId: 'conviction-export', userId: 'avery', idempotencyKey: 'exp-1' });
  assert.equal(r.body.status, 'pending_approval');
  const id = r.body.approval.approval_id;
  const r2 = await call('POST', '/api/run', { workspaceId: 'nw-capital', listingId: 'conviction', promptId: 'conviction-export', userId: 'avery', idempotencyKey: 'exp-1' });
  assert.equal(r2.body.approval.approval_id, id, 'same key, same approval');

  assert.equal((await call('POST', `/api/approvals/${id}/decide`, { userId: 'noor', decision: 'approve' })).status, 403);
  assert.equal((await call('POST', `/api/approvals/${id}/decide`, { userId: 'avery', decision: 'maybe' })).status, 400);
  const ok = await call('POST', `/api/approvals/${id}/decide`, { userId: 'avery', decision: 'approve' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.result.status, 'done');
  assert.match(ok.body.result.note, /does not change any outside system/);
  assert.equal((await call('POST', `/api/approvals/${id}/decide`, { userId: 'avery', decision: 'approve' })).status, 409);
});

test('consumer listing: personal chat only, payment links out', async () => {
  assert.equal((await call('POST', '/api/run', { workspaceId: 'personal-jordan', listingId: 'readaroo', promptId: 'readaroo-find', userId: 'jordan', surface: 'slack' })).status, 400);
  const find = await call('POST', '/api/run', { workspaceId: 'personal-jordan', listingId: 'readaroo', promptId: 'readaroo-find', userId: 'jordan' });
  assert.equal(find.body.status, 'answered');
  assert.equal(find.body.usage.cost_usd, 0);
  const fine = await call('POST', '/api/run', { workspaceId: 'personal-jordan', listingId: 'readaroo', promptId: 'readaroo-fine', userId: 'jordan' });
  assert.equal(fine.body.status, 'link_out');
  assert.match(fine.body.link.url, /readaroo\.example/);
});

test('spend cap stops calls once reached', async () => {
  assert.equal((await call('PUT', '/api/workspaces/nw-software/installs/credits/policy', { userId: 'kai', spendCap: 0.1 })).status, 200);
  const first = await call('POST', '/api/run', { workspaceId: 'nw-software', listingId: 'credits', promptId: 'credits-solve', userId: 'sam' });
  assert.equal(first.status, 200);
  const second = await call('POST', '/api/run', { workspaceId: 'nw-software', listingId: 'credits', promptId: 'credits-solve', userId: 'sam' });
  assert.equal(second.status, 409);
  assert.equal(second.body.error, 'spend_cap_reached');
});

test('review queue blocks failed checks and adds conditions', async () => {
  const q = await call('GET', '/api/review');
  assert.equal(q.body.length, 5);
  assert.equal((await call('POST', '/api/review/S-503/decide', { decision: 'approved', reviewer: 'ops' })).status, 409, 'injection failure blocks approval');
  const orbit = await call('POST', '/api/review/S-501/decide', { decision: 'approved', reviewer: 'ops' });
  assert.match(orbit.body.condition, /re-consent/);
  const slow = await call('POST', '/api/review/S-505/decide', { decision: 'approved', reviewer: 'ops' });
  assert.match(slow.body.condition, /background-only/);
});

test('operator health and the audit log reflect the run', async () => {
  const h = await call('GET', '/api/operator/health');
  assert.equal(h.body.kpis.purchase_to_weekly_active_pct, 53.7);
  assert.equal(h.body.stale_listings[0].listing_id, 'fieldnote');
  const audit = await call('GET', '/api/audit?limit=200');
  const actions = audit.body.map(e => e.action);
  for (const a of ['purchase', 'policy_update', 'deploy_approved', 'run', 'run_blocked', 'approval_requested', 'write_approved', 'link_out', 'review_decision']) {
    assert.ok(actions.includes(a), `audit has ${a}`);
  }
});

test('reset puts the demo back to the start', async () => {
  assert.equal((await call('POST', '/api/demo/reset')).status, 200);
  const st = await call('GET', '/api/workspaces/nw-freight');
  assert.equal(st.body.installs.find(i => i.listing_id === 'orbit').status, 'not_purchased');
});

test('Slack commands share the engine and keep approvals owner-only', async () => {
  const { Engine } = await import('../src/engine.js');
  const { OfflineStore } = await import('../src/store/offline.js');
  const { handleCommand, decideFromSlack } = await import('../src/slack.js');
  const engine = new Engine(new OfflineStore());
  assert.match((await handleCommand(engine, 'help', 'U1')).text, /\/meridian run/);
  assert.match((await handleCommand(engine, 'listings', 'U1')).text, /Credit Simulator/);
  const memo = await handleCommand(engine, 'run conviction-memo', 'U1');
  assert.match(memo.text, /EV-CONVICTION-MEMO-01/);
  assert.match(memo.text, /Validator rejected 1 uncited claim/);
  const exp = await handleCommand(engine, 'run conviction-export', 'U1');
  assert.ok(exp.blocks, 'write shows Approve and Decline buttons');
  const approvalId = exp.blocks[1].elements[0].value;
  await assert.rejects(decideFromSlack(engine, approvalId, 'U2', 'approve'), /Only the person who asked/);
  assert.match(await decideFromSlack(engine, approvalId, 'U1', 'approve'), /Approved/);
  await assert.rejects(handleCommand(engine, 'run orbit-brief', 'U1'), /IT has not approved/);
});

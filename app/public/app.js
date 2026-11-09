// Meridian web console. Talks only to the local API; works the same in offline and live mode.
const view = document.getElementById('view');
const S = { tab: 'catalog', q: '', category: '', listing: null, ws: 'nw-freight', runListing: 'orbit', runUser: 'jordan', runPrompt: '', surface: 'chat', results: [], review: {} };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => `$${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const DEFAULTS = { orbit: ['nw-freight', 'jordan'], conviction: ['nw-capital', 'avery'], credits: ['nw-software', 'sam'], fieldwise: ['nw-service', 'ana'], readaroo: ['personal-jordan', 'jordan'] };

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3200);
}
async function api(method, path, body) {
  const res = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.message || `Request failed (${res.status})`); e.status = res.status; e.code = data.error; throw e; }
  return data;
}
const safe = fn => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message); } };

// ---------------------------------------------------------------- catalog
async function vCatalog() {
  if (S.listing) return vListing();
  const list = await api('GET', `/api/listings?q=${encodeURIComponent(S.q)}&category=${encodeURIComponent(S.category)}`);
  const cats = [...new Set((await api('GET', '/api/listings')).map(l => l.category))].sort();
  const card = l => `<button class="card ${Number(l.featured) ? 'featured' : ''}" data-open="${esc(l.listing_id)}">
    <h3>${esc(l.name)}</h3><span class="muted" style="font-size:12.5px">${esc(l.publisher)} · ${esc(l.category)}</span>
    <p>${esc(l.description)}</p>
    <div class="row" style="gap:6px"><span class="pill">${Number(l.installs).toLocaleString('en-US')} ${Number(l.consumer) ? 'people' : 'workspaces'}</span>
    <span class="pill">${l.weekly_active_pct}% weekly active</span>${l.is_stale ? `<span class="pill warn">Data ${l.data_age_days} days old</span>` : ''}
    ${l.soc2 === 'Not provided' ? '<span class="pill">SOC 2: Not provided</span>' : ''}</div></button>`;
  const featured = list.filter(l => Number(l.featured)), rest = list.filter(l => !Number(l.featured));
  view.innerHTML = `
    <div><h1>Catalog</h1><p class="muted">Search by the job you need done. Featured listings have working agents; the rest are sample listings.</p></div>
    <div class="row"><input id="q" type="search" placeholder="research accounts before sales calls" value="${esc(S.q)}" style="flex:1 1 280px" aria-label="Search">
      <select id="cat" aria-label="Category"><option value="">All categories</option>${cats.map(c => `<option ${c === S.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
    ${S.q || S.category ? `<div class="cards">${list.map(card).join('') || '<p class="note">No listing fits that yet. It would show up in the operator\'s supply-gap report.</p>'}</div>`
      : `<h2>Featured</h2><div class="cards">${featured.map(card).join('')}</div><h2>All listings</h2><div class="cards">${rest.map(card).join('')}</div>`}`;
  const q = document.getElementById('q');
  q.addEventListener('change', safe(async () => { S.q = q.value; await render(); }));
  document.getElementById('cat').addEventListener('change', safe(async e => { S.category = e.target.value; await render(); }));
  view.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', safe(async () => { S.listing = b.dataset.open; await render(); })));
}

async function vListing() {
  const d = await api('GET', `/api/listings/${encodeURIComponent(S.listing)}`);
  const l = d.listing;
  view.innerHTML = `
    <div class="row"><button class="btn small" id="back">← Catalog</button></div>
    <div><h1>${esc(l.name)}</h1><p class="muted">${esc(l.publisher)} · ${esc(l.category)} · ${esc(l.price_model)}</p></div>
    <div class="grid2">
      <div class="panel"><p>${esc(l.description)}</p>
        ${d.tools.length ? `<div class="tablebox"><table><thead><tr><th>Tool</th><th>Access</th><th>What it does</th></tr></thead><tbody>
        ${d.tools.map(t => `<tr><td class="mono">${esc(t.tool_name)}</td><td><span class="pill ${t.access === 'write' ? 'warn' : t.access === 'link' ? 'acc' : ''}">${esc(t.access)}</span></td><td>${esc(t.description)}</td></tr>`).join('')}
        </tbody></table></div>` : '<p class="note">Sample listing: no working tools in this demo.</p>'}
        ${d.defaults ? `<button class="btn primary" id="try">Run it</button>` : ''}
      </div>
      <div class="panel"><table><tbody>
        <tr><td class="muted">Used by</td><td>${Number(l.installs).toLocaleString('en-US')}</td></tr>
        <tr><td class="muted">Weekly active</td><td>${l.weekly_active_pct}%</td></tr>
        <tr><td class="muted">Task eval</td><td>${l.eval_pct}%</td></tr>
        <tr><td class="muted">p95 latency</td><td>${(Number(l.p95_ms) / 1000).toFixed(1)}s</td></tr>
        <tr><td class="muted">SOC 2</td><td>${esc(l.soc2)}</td></tr>
        ${l.freshness_rule_days !== '' && l.freshness_rule_days != null ? `<tr><td class="muted">Data age</td><td>${l.data_age_days} days (rule: ${l.freshness_rule_days}) ${l.is_stale ? '<span class="pill warn">Stale</span>' : ''}</td></tr>` : ''}
      </tbody></table></div>
    </div>`;
  document.getElementById('back').onclick = safe(async () => { S.listing = null; await render(); });
  const t = document.getElementById('try');
  if (t) t.onclick = () => { S.runListing = l.listing_id; [, S.runUser] = DEFAULTS[l.listing_id]; S.runPrompt = ''; location.hash = 'run'; };
}

// ---------------------------------------------------------------- buy and deploy
async function vWorkspace() {
  const wss = await api('GET', '/api/workspaces');
  const st = await api('GET', `/api/workspaces/${S.ws}`);
  const admin = st.members.find(m => Number(m.is_admin));
  const buyer = st.members.find(m => m.group_name === 'Procurement') || st.members[0];
  const inst = st.installs.map(i => `
    <div class="panel">
      <div class="row"><h2>${esc(i.listing_id)}</h2><span class="pill ${i.status === 'approved' ? 'good' : i.status === 'purchased' ? 'acc' : 'warn'}">${esc(i.status.replace('_', ' '))}</span>
      <span class="muted mono">policy v${i.policy_version}</span></div>
      ${i.status === 'not_purchased' ? `<div class="row">
        <label class="inline">Plan <select id="plan-${i.listing_id}"><option value="annual">Private offer (annual)</option><option value="team">Team</option><option value="usage">Usage</option></select></label>
        <label class="inline">Pay via <select id="pay-${i.listing_id}"><option value="commitment">Platform commitment</option><option value="invoice">Monthly invoice</option></select></label>
        <button class="btn primary" data-buy="${i.listing_id}">Buy as ${esc(buyer.display_name)}</button></div>` : `<p class="muted">Plan: ${esc(i.plan)} · paid via ${esc(i.pay_via)}${i.approved_by ? ` · approved by ${esc(i.approved_by)} on ${esc(i.approved_on)}` : ''}</p>`}
      <h3>Policy (set by ${esc(admin.display_name)}, IT)</h3>
      <div class="row">${i.groups.map(g => `<label class="inline"><input type="checkbox" data-group="${esc(g.group_name)}" data-l="${i.listing_id}" ${Number(g.enabled) ? 'checked' : ''}>${esc(g.group_name)}</label>`).join('')}</div>
      <div class="row">${i.tools.map(t => `<label class="inline"><input type="checkbox" data-tool="${esc(t.tool_name)}" data-l="${i.listing_id}" ${Number(t.enabled) ? 'checked' : ''}><span class="mono">${esc(t.tool_name)}</span></label>`).join('')}</div>
      <div class="row"><label class="inline"><input type="checkbox" id="hw-${i.listing_id}" ${Number(i.human_write) ? 'checked' : ''}>Writes need a person's approval</label>
        <label class="inline"><input type="checkbox" id="pii-${i.listing_id}" ${Number(i.pii_mask) ? 'checked' : ''}>Mask PII</label>
        <label class="inline">Spend cap $<input id="cap-${i.listing_id}" type="number" min="0" max="100000" value="${Number(i.spend_cap_usd)}" style="width:110px"></label></div>
      <div class="row"><button class="btn" data-policy="${i.listing_id}">Save policy</button>
        <button class="btn primary" data-approve="${i.listing_id}" ${i.status !== 'purchased' ? 'disabled' : ''}>${i.status === 'approved' ? 'Approved' : 'Approve deployment'}</button></div>
    </div>`).join('');
  const usage = await api('GET', `/api/workspaces/${S.ws}/usage`);
  view.innerHTML = `
    <div><h1>Buy and deploy</h1><p class="muted">Procurement buys; IT sets who can use which tools and approves once for every surface.</p></div>
    <label class="inline">Workspace <select id="ws">${wss.map(w => `<option value="${w.workspace_id}" ${w.workspace_id === S.ws ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}</select></label>
    <div class="grid2"><div style="display:grid;gap:16px">${inst}</div>
      <div class="panel"><h3>Usage this month</h3><p><b>${money(usage.total_usd)}</b> · partners earn ${money(usage.partner_earnings_usd)} after a ${usage.fee_pct}% fee</p>
      ${usage.rows.map(r => `<p class="muted">${esc(r.listing_id)}: ${r.calls} calls, ${money(r.cost_usd)}</p>`).join('')}
      <p class="muted">Commitment remaining: ${money(st.workspace.commitment_remaining_usd)}</p></div></div>`;
  document.getElementById('ws').onchange = safe(async e => { S.ws = e.target.value; await render(); });
  view.querySelectorAll('[data-buy]').forEach(b => b.onclick = safe(async () => {
    const l = b.dataset.buy;
    await api('POST', `/api/workspaces/${S.ws}/installs/${l}/purchase`, { userId: buyer.user_id, plan: document.getElementById(`plan-${l}`).value, payVia: document.getElementById(`pay-${l}`).value });
    toast('Purchased. IT can now approve the deployment.'); await render();
  }));
  view.querySelectorAll('[data-policy]').forEach(b => b.onclick = safe(async () => {
    const l = b.dataset.policy, groups = {}, tools = {};
    view.querySelectorAll(`[data-group][data-l="${l}"]`).forEach(c => { groups[c.dataset.group] = c.checked; });
    view.querySelectorAll(`[data-tool][data-l="${l}"]`).forEach(c => { tools[c.dataset.tool] = c.checked; });
    const out = await api('PUT', `/api/workspaces/${S.ws}/installs/${l}/policy`, {
      userId: admin.user_id, groups, tools, humanWrite: document.getElementById(`hw-${l}`).checked,
      piiMask: document.getElementById(`pii-${l}`).checked, spendCap: Number(document.getElementById(`cap-${l}`).value),
    });
    toast(`Policy v${out.install.policy_version} saved.`); await render();
  }));
  view.querySelectorAll('[data-approve]').forEach(b => b.onclick = safe(async () => {
    await api('POST', `/api/workspaces/${S.ws}/installs/${b.dataset.approve}/approve`, { userId: admin.user_id });
    toast('Deployment approved. It is live on every surface.'); await render();
  }));
}

// ---------------------------------------------------------------- run
function renderResult(r) {
  const trace = `<div class="trace">${r.trace.map(t => `<div class="s-${t.state}">${esc(t.stage)} · ${esc(t.detail)}</div>`).join('')}</div>`;
  let body = '';
  if (r.status === 'answered') body = `<ul class="claims">${r.answer.claims.map(c => `<li>${c.kind === 'unknown' ? '<b>Unknown:</b> ' : ''}${esc(c.text)} ${c.stale ? '<span class="pill warn">stale source</span>' : ''}<br><span class="ev">${esc(c.evidence_id)} · ${esc(c.source || 'no source')} · ${esc(c.as_of || '')}</span></li>`).join('')}</ul>
    ${r.warnings.map(w => `<p class="note">${esc(w)}</p>`).join('')}<p class="muted">${r.usage.calls} tool calls · ${money(r.usage.cost_usd)}</p>`;
  if (r.status === 'pending_approval') body = r.decided ? `<p class="note">${esc(r.decided)}</p>` : `<div class="note"><b>${esc(r.tool)}</b> writes a record, so it waits for ${esc(r.user_id)}.
    <div class="row" style="margin-top:8px"><button class="btn primary" data-dec="approve" data-id="${r.approval.approval_id}" data-u="${esc(r.user_id)}">Approve as ${esc(r.user_id)}</button>
    <button class="btn" data-dec="decline" data-id="${r.approval.approval_id}" data-u="${esc(r.user_id)}">Decline</button>
    <button class="btn small" data-dec="approve" data-id="${r.approval.approval_id}" data-u="someone-else">Try approving as someone else</button></div></div>`;
  if (r.status === 'link_out') body = `<p class="note">${esc(r.link.label)}<br><span class="mono">${esc(r.link.url)}</span><br>The marketplace never handles card data.</p>`;
  if (r.status === 'escalated') body = `<p class="note"><b>Escalated to a person.</b> ${esc(r.reason)}</p>`;
  return `<div class="panel"><div class="row"><h3>${esc(r.listing_name)}</h3><span class="pill">${esc(r.surface)}</span><span class="pill ${r.status === 'answered' ? 'good' : 'warn'}">${esc(r.status.replace('_', ' '))}</span>${r.replayed ? '<span class="pill">replayed</span>' : ''}</div>
    <p><b>${esc(r.prompt)}</b></p>${trace}${body}</div>`;
}

async function vRun() {
  const featured = (await api('GET', '/api/listings')).filter(l => Number(l.featured));
  const d = await api('GET', `/api/listings/${S.runListing}`);
  const ws = d.defaults.workspaceId;
  const st = await api('GET', `/api/workspaces/${ws}`);
  if (!st.members.some(m => m.user_id === S.runUser)) S.runUser = d.defaults.userId;
  if (!d.prompts.some(p => p.prompt_id === S.runPrompt)) S.runPrompt = d.prompts[0].prompt_id;
  view.innerHTML = `
    <div><h1>Run an agent</h1><p class="muted">Every run goes through the policy gateway: Discover, Research, Compose, Validate, then metering.</p></div>
    <div class="panel"><div class="row">
      <label class="inline">Agent <select id="rl">${featured.map(l => `<option value="${l.listing_id}" ${l.listing_id === S.runListing ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label>
      <label class="inline">Act as <select id="ru">${st.members.map(m => `<option value="${m.user_id}" ${m.user_id === S.runUser ? 'selected' : ''}>${esc(m.display_name)} (${esc(m.group_name)})</option>`).join('')}</select></label>
      <label class="inline">Surface <select id="rs">${['chat', 'data', 'slack'].map(s => `<option ${s === S.surface ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
    </div>
    <div class="row">${d.prompts.map(p => `<button class="btn ${p.prompt_id === S.runPrompt ? 'primary' : ''}" data-p="${p.prompt_id}">${esc(p.text)}</button>`).join('')}</div>
    <p class="muted">Workspace: ${esc(st.workspace.name)}</p></div>
    <div id="results" style="display:grid;gap:12px">${S.results.slice().reverse().map(renderResult).join('') || '<p class="muted">Pick a prompt to run it.</p>'}</div>`;
  document.getElementById('rl').onchange = safe(async e => { S.runListing = e.target.value; [, S.runUser] = DEFAULTS[S.runListing]; S.runPrompt = ''; await render(); });
  document.getElementById('ru').onchange = e => { S.runUser = e.target.value; };
  document.getElementById('rs').onchange = e => { S.surface = e.target.value; };
  view.querySelectorAll('[data-p]').forEach(b => b.onclick = safe(async () => {
    S.runPrompt = b.dataset.p;
    const r = await api('POST', '/api/run', { workspaceId: ws, listingId: S.runListing, promptId: S.runPrompt, userId: S.runUser, surface: S.surface, idempotencyKey: `web-${Date.now()}` });
    S.results.push(r); await render();
  }));
  view.querySelectorAll('[data-dec]').forEach(b => b.onclick = safe(async () => {
    const out = await api('POST', `/api/approvals/${b.dataset.id}/decide`, { userId: b.dataset.u, decision: b.dataset.dec });
    const r = S.results.find(x => x.approval?.approval_id === b.dataset.id);
    if (r) r.decided = out.result.status === 'done' ? `Approved. ${out.result.claims.map(c => c.text).join(' ')} ${out.result.note}` : 'Declined. Nothing was written.';
    await render();
  }));
}

// ---------------------------------------------------------------- approvals, review, health, audit
async function vApprovals() {
  const list = await api('GET', '/api/approvals');
  view.innerHTML = `<div><h1>Approvals</h1><p class="muted">Writes wait here. Only the person who asked can approve, and approving only records the action.</p></div>
    <div class="panel tablebox"><table><thead><tr><th>Approval</th><th>Tool</th><th>Workspace</th><th>Asked by</th><th>Status</th></tr></thead><tbody>
    ${list.map(a => `<tr><td class="mono">${esc(a.approval_id)}</td><td class="mono">${esc(a.tool_name)}</td><td>${esc(a.workspace_id)}</td><td>${esc(a.requested_by)}</td><td><span class="pill ${a.status === 'approved' ? 'good' : a.status === 'pending' ? 'warn' : ''}">${esc(a.status)}</span></td></tr>`).join('') || '<tr><td colspan="5" class="muted">No approvals yet. Run a write prompt such as "Export the Halden memo".</td></tr>'}
    </tbody></table></div>`;
}

async function vReview() {
  const subs = await api('GET', '/api/review');
  const checks = ['manifest', 'scopes', 'privacy', 'evals', 'latency', 'injection'];
  view.innerHTML = `<div><h1>Review queue</h1><p class="muted">Automated checks run on submit. Failed evals, injection or privacy checks block approval.</p></div>
    ${subs.map(s => `<div class="panel"><div class="row"><h2>${esc(s.listing_name)}</h2><span class="muted">${esc(s.partner)} · ${esc(s.type)}</span><span class="pill ${s.status === 'approved' ? 'good' : s.status === 'pending' ? '' : 'warn'}">${esc(s.status.replace('_', ' '))}</span></div>
      <div class="row">${checks.map(k => `<span class="pill ${Number(s[k]) ? 'good' : 'bad'}">${Number(s[k]) ? '✓' : '✗'} ${k}</span>`).join('')}</div>
      <p><b>${esc(s.risk)}.</b> ${esc(s.note)}</p>${S.review[s.submission_id] ? `<p class="note">${esc(S.review[s.submission_id])}</p>` : ''}
      <div class="row"><button class="btn primary" data-r="approved" data-id="${s.submission_id}">Approve</button><button class="btn" data-r="changes_requested" data-id="${s.submission_id}">Request changes</button><button class="btn" data-r="rejected" data-id="${s.submission_id}">Reject</button></div></div>`).join('')}`;
  view.querySelectorAll('[data-r]').forEach(b => b.onclick = async () => {
    try { const out = await api('POST', `/api/review/${b.dataset.id}/decide`, { decision: b.dataset.r, reviewer: 'ops-reviewer' }); S.review[b.dataset.id] = out.condition || `Marked ${b.dataset.r.replace('_', ' ')}.`; }
    catch (e) { S.review[b.dataset.id] = e.message; }
    await render();
  });
}

async function vHealth() {
  const h = await api('GET', '/api/operator/health');
  const k = h.kpis, max = h.funnel[0].count;
  view.innerHTML = `<div><h1>Is buying turning into use?</h1><p class="muted">As of ${esc(h.as_of)}. The north star is purchase-to-weekly-active.</p></div>
    <div class="kpis">
      <div class="panel kpi"><span class="muted">Bookings, last 4 weeks</span><b>${money(k.bookings_4w_usd)}</b><span class="muted">${k.bookings_change_pct > 0 ? '▲' : '▼'} ${Math.abs(k.bookings_change_pct)}% vs prior 4</span></div>
      <div class="panel kpi"><span class="muted">Purchase → weekly active</span><b>${k.purchase_to_weekly_active_pct}%</b><span class="muted">north star</span></div>
      <div class="panel kpi"><span class="muted">Deployed but not used weekly</span><b>${k.deployed_not_weekly_pct}%</b></div>
      <div class="panel kpi"><span class="muted">Partner payouts, 4 weeks</span><b>${money(k.partner_payouts_4w_usd)}</b><span class="muted">${k.fee_pct}% fee</span></div>
    </div>
    <div class="grid2">
      <div class="panel"><h3>Buyer funnel</h3>${h.funnel.map(f => `<div class="frow"><span>${esc(f.stage)}</span><div class="bar"><i style="width:${Math.max(2, f.count / max * 100)}%"></i></div><span style="text-align:right">${f.count.toLocaleString('en-US')}</span></div>`).join('')}</div>
      <div class="panel"><h3>Stale data</h3>${h.stale_listings.map(s => `<p><span class="pill warn">${s.data_age_days} days</span> ${esc(s.name)} is past its ${s.rule_days}-day rule.</p>`).join('') || '<p class="muted">All data listings are fresh.</p>'}</div>
    </div>
    <div class="grid2">
      <div class="panel tablebox"><h3>Bought but not used</h3><table><thead><tr><th>Listing</th><th>Installs</th><th>Weekly active</th><th>Likely cause</th></tr></thead><tbody>
        ${h.adoption.map(a => `<tr><td>${esc(a.name)}</td><td>${Number(a.installs).toLocaleString('en-US')}</td><td><span class="pill bad">${a.weekly_active_pct}%</span></td><td class="muted">${esc(a.likely_cause)}</td></tr>`).join('')}</tbody></table></div>
      <div class="panel tablebox"><h3>Supply gaps</h3><table><thead><tr><th>Searched for</th><th>Workspaces</th></tr></thead><tbody>
        ${h.supply_gaps.map(s => `<tr><td>${esc(s.query)}</td><td>${s.workspaces}</td></tr>`).join('')}</tbody></table></div>
    </div>`;
}

async function vAudit() {
  const rows = await api('GET', '/api/audit?limit=100');
  view.innerHTML = `<div><h1>Audit log</h1><p class="muted">Who did what, on which surface, under which policy version.</p></div>
    <div class="panel tablebox"><table><thead><tr><th>Time (UTC)</th><th>Actor</th><th>Workspace</th><th>Action</th><th>Surface</th><th>Policy</th><th>Outcome</th><th>Detail</th></tr></thead><tbody>
    ${rows.map(e => `<tr><td class="mono">${esc(String(e.at).slice(11, 19))}</td><td>${esc(e.actor)}</td><td>${esc(e.workspace_id)}</td><td class="mono">${esc(e.action)}</td><td>${esc(e.surface)}</td><td>${esc(e.policy_version)}</td><td>${esc(e.outcome)}</td><td>${esc(e.detail)}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">Nothing logged yet.</td></tr>'}
    </tbody></table></div>`;
}

const VIEWS = { catalog: vCatalog, workspace: vWorkspace, run: vRun, approvals: vApprovals, review: vReview, health: vHealth, audit: vAudit };
async function render() {
  document.querySelectorAll('[data-tab]').forEach(a => a.setAttribute('aria-current', a.dataset.tab === S.tab ? 'page' : 'false'));
  try { await (VIEWS[S.tab] || vCatalog)(); } catch (e) { view.innerHTML = `<p class="note">${esc(e.message)}</p>`; }
}
function route() { const t = location.hash.slice(1); S.tab = VIEWS[t] ? t : 'catalog'; render(); }
window.addEventListener('hashchange', route);
document.getElementById('reset').onclick = safe(async () => { await api('POST', '/api/demo/reset'); S.results = []; S.review = {}; toast('Demo reset.'); await render(); });
api('GET', '/api/health').then(h => { document.getElementById('modeBadge').textContent = `${h.mode} mode`; }).catch(() => {});
route();

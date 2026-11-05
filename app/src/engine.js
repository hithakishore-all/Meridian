// The Meridian engine: catalog, buying, IT policy, the policy gateway and the agent flow.
// Shared by the web console and the Slack bot; works the same on the offline and live stores.
//
// Agent flow for every run: Discover (policy checks) -> Research (governed facts) -> Compose -> Validate.
// The validator rejects any claim without a source and retries at most MAX_VALIDATOR_RETRIES times, then escalates.
// Writes never run on their own: they become an approval that only the person who asked can decide,
// and approving only records the action in Meridian. Nothing is sent to any outside system.
import crypto from 'node:crypto';
import { badRequest, forbidden, notFound, conflict } from './errors.js';

export const SURFACES = ['chat', 'data', 'slack'];
export const PLANS = ['usage', 'team', 'annual'];
export const PAY_VIA = ['commitment', 'invoice'];
export const REVIEW_DECISIONS = ['approved', 'changes_requested', 'rejected'];
const LISTING_WORKSPACE = { orbit: 'nw-freight', conviction: 'nw-capital', credits: 'nw-software', readaroo: 'personal-jordan' };
const WORKSPACE_PERSONA = { 'nw-freight': 'jordan', 'nw-capital': 'avery', 'nw-software': 'sam', 'personal-jordan': 'jordan' };

const newId = prefix => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
const nowIso = () => new Date().toISOString();
const str = (v, name, max = 200) => {
  if (typeof v !== 'string' || !v.trim()) throw badRequest('missing_field', `${name} is required.`);
  if (v.length > max) throw badRequest('field_too_long', `${name} must be ${max} characters or fewer.`);
  return v.trim();
};
const num = v => (v === '' || v === null || v === undefined ? null : Number(v));
const money = n => Math.round(n * 10000) / 10000;

export class Engine {
  constructor(store) {
    this.store = store;
  }

  // ---------------------------------------------------------------- helpers
  async config() {
    const c = await this.store.getConfig();
    return {
      today: c.DEMO_TODAY, model: c.MODEL || 'scripted', feePct: Number(c.FEE_PCT || 15),
      callPrice: Number(c.CALL_PRICE_USD || 0.04), maxRetries: Number(c.MAX_VALIDATOR_RETRIES || 2),
    };
  }

  async audit(e) {
    await this.store.addAudit({
      event_id: newId('EVT'), at: nowIso(), actor: e.actor || 'system', workspace_id: e.workspace_id || '',
      listing_id: e.listing_id || '', action: e.action, surface: e.surface || '', policy_version: e.policy_version ?? '',
      outcome: e.outcome || 'ok', detail: e.detail || '',
    });
  }

  async requireAdmin(ws, userId) {
    const m = await this.store.getMember(ws, str(userId, 'userId'));
    if (!m) throw forbidden('not_a_member', `${userId} is not a member of ${ws}.`);
    if (!Number(m.is_admin)) throw forbidden('admin_only', `Only a workspace admin can do this. ${m.display_name} is in ${m.group_name}.`);
    return m;
  }

  defaultsFor(listingId) {
    const ws = LISTING_WORKSPACE[listingId];
    return ws ? { workspaceId: ws, userId: WORKSPACE_PERSONA[ws] } : null;
  }

  // ---------------------------------------------------------------- catalog
  async searchListings({ q = '', category = '' } = {}) {
    if (typeof q !== 'string' || q.length > 200) throw badRequest('bad_query', 'q must be text of 200 characters or fewer.');
    let list = await this.store.listListings();
    if (category) list = list.filter(l => l.category === category);
    // Light stemming so "accounts" matches "account" and "calls" matches "call".
    const words = q.toLowerCase().split(/\s+/).filter(w => w.length > 2).map(w => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w));
    if (!words.length) return list.map(l => ({ ...l, score: 0 }));
    return list
      .map(l => {
        const hay = `${l.name} ${l.description} ${l.keywords} ${l.category}`.toLowerCase();
        return { ...l, score: words.filter(w => hay.includes(w)).length };
      })
      .filter(l => l.score > 0)
      .sort((a, b) => b.score - a.score || Number(b.weekly_active_pct) - Number(a.weekly_active_pct));
  }

  async listingDetail(id) {
    const listing = await this.store.getListing(str(id, 'listingId'));
    if (!listing) throw notFound('listing_not_found', `No listing called ${id}.`);
    const [tools, prompts] = await Promise.all([this.store.listTools(id), this.store.listPrompts(id)]);
    return { listing, tools, prompts, defaults: this.defaultsFor(id) };
  }

  // ---------------------------------------------------------------- workspaces
  async workspaceState(ws) {
    const w = await this.store.getWorkspace(str(ws, 'workspaceId'));
    if (!w) throw notFound('workspace_not_found', `No workspace called ${ws}.`);
    const [members, installs, usage] = await Promise.all([this.store.listMembers(ws), this.store.listInstalls(ws), this.store.usage(ws)]);
    const detailed = await Promise.all(installs.map(async i => ({
      ...i,
      groups: await this.store.listGroupPolicies(ws, i.listing_id),
      tools: await this.store.listToolPolicies(ws, i.listing_id),
    })));
    return { workspace: w, members, installs: detailed, usage };
  }

  async getInstallOr404(ws, listingId) {
    const i = await this.store.getInstall(ws, listingId);
    if (!i) throw notFound('not_offered', `${listingId} is not set up for workspace ${ws}.`);
    return i;
  }

  async purchase(ws, listingId, { userId, plan, payVia } = {}) {
    const m = await this.store.getMember(ws, str(userId, 'userId'));
    if (!m) throw forbidden('not_a_member', `${userId} is not a member of ${ws}.`);
    if (!PLANS.includes(plan)) throw badRequest('bad_plan', `plan must be one of: ${PLANS.join(', ')}.`);
    if (!PAY_VIA.includes(payVia)) throw badRequest('bad_pay_via', `payVia must be one of: ${PAY_VIA.join(', ')}.`);
    const inst = await this.getInstallOr404(ws, listingId);
    if (inst.status !== 'not_purchased') return { install: inst, alreadyPurchased: true };
    const updated = await this.store.updateInstall(ws, listingId, { status: 'purchased', plan, pay_via: payVia });
    await this.audit({ actor: userId, workspace_id: ws, listing_id: listingId, action: 'purchase', detail: `${plan} plan, paid via ${payVia}` });
    return { install: updated, alreadyPurchased: false };
  }

  async updatePolicy(ws, listingId, body = {}) {
    await this.requireAdmin(ws, body.userId);
    const inst = await this.getInstallOr404(ws, listingId);
    const changes = [];
    if (body.groups !== undefined) {
      if (typeof body.groups !== 'object' || Array.isArray(body.groups)) throw badRequest('bad_groups', 'groups must be an object like {"Sales AEs": true}.');
      const known = (await this.store.listGroupPolicies(ws, listingId)).map(g => g.group_name);
      for (const [g, on] of Object.entries(body.groups)) {
        if (!known.includes(g)) throw badRequest('unknown_group', `Unknown group "${g}". Known groups: ${known.join(', ')}.`);
        await this.store.setGroupPolicy(ws, listingId, g, Boolean(on));
        changes.push(`${on ? 'enabled' : 'disabled'} group ${g}`);
      }
    }
    if (body.tools !== undefined) {
      if (typeof body.tools !== 'object' || Array.isArray(body.tools)) throw badRequest('bad_tools', 'tools must be an object like {"sync_to_crm": true}.');
      const known = (await this.store.listToolPolicies(ws, listingId)).map(t => t.tool_name);
      for (const [t, on] of Object.entries(body.tools)) {
        if (!known.includes(t)) throw badRequest('unknown_tool', `Unknown tool "${t}". Known tools: ${known.join(', ')}.`);
        await this.store.setToolPolicy(ws, listingId, t, Boolean(on));
        changes.push(`${on ? 'allowed' : 'blocked'} tool ${t}`);
      }
    }
    const patch = {};
    if (body.humanWrite !== undefined) { patch.human_write = body.humanWrite ? 1 : 0; changes.push(`write approval ${body.humanWrite ? 'required' : 'not required'}`); }
    if (body.piiMask !== undefined) { patch.pii_mask = body.piiMask ? 1 : 0; changes.push(`PII masking ${body.piiMask ? 'on' : 'off'}`); }
    if (body.spendCap !== undefined) {
      const cap = Number(body.spendCap);
      if (!Number.isFinite(cap) || cap < 0 || cap > 100000) throw badRequest('bad_spend_cap', 'spendCap must be a number from 0 to 100000.');
      patch.spend_cap_usd = cap; changes.push(`spend cap $${cap}`);
    }
    if (!changes.length) throw badRequest('nothing_to_change', 'Send at least one of: groups, tools, humanWrite, piiMask, spendCap.');
    patch.policy_version = Number(inst.policy_version || 0) + 1;
    const updated = await this.store.updateInstall(ws, listingId, patch);
    await this.audit({ actor: body.userId, workspace_id: ws, listing_id: listingId, action: 'policy_update', policy_version: patch.policy_version, detail: changes.join('; ') });
    return { install: updated, changes };
  }

  async approveDeploy(ws, listingId, { userId } = {}) {
    const admin = await this.requireAdmin(ws, userId);
    const inst = await this.getInstallOr404(ws, listingId);
    if (inst.status === 'approved') return { install: inst, alreadyApproved: true };
    if (inst.status !== 'purchased') throw conflict('not_purchased', `${listingId} has not been purchased for ${ws} yet. Buy it first.`);
    const { today } = await this.config();
    const updated = await this.store.updateInstall(ws, listingId, { status: 'approved', approved_by: admin.user_id, approved_on: today });
    await this.audit({ actor: userId, workspace_id: ws, listing_id: listingId, action: 'deploy_approved', policy_version: updated.policy_version });
    return { install: updated, alreadyApproved: false };
  }

  // ---------------------------------------------------------------- the policy gateway and agent flow
  async run(body = {}) {
    const workspaceId = str(body.workspaceId, 'workspaceId', 64);
    const listingId = str(body.listingId, 'listingId', 64);
    const promptId = str(body.promptId, 'promptId', 64);
    const userId = str(body.userId, 'userId', 64);
    const surface = body.surface === undefined ? 'chat' : body.surface;
    if (!SURFACES.includes(surface)) throw badRequest('bad_surface', `surface must be one of: ${SURFACES.join(', ')}.`);
    const key = body.idempotencyKey ? str(body.idempotencyKey, 'idempotencyKey', 120) : '';
    if (key) {
      const prior = await this.store.getRunByKey(key);
      if (prior) return { ...prior, replayed: true };
    }

    const cfg = await this.config();
    const trace = [];
    const step = (stage, detail, state = 'ok') => trace.push({ stage, detail, state });

    // ---- Discover: who is asking, is the agent deployed, is this tool allowed for them
    const listing = await this.store.getListing(listingId);
    if (!listing) throw notFound('listing_not_found', `No listing called ${listingId}.`);
    const prompt = await this.store.getPrompt(promptId);
    if (!prompt) throw notFound('prompt_not_found', `No prompt called ${promptId}.`);
    if (prompt.listing_id !== listingId) throw badRequest('prompt_mismatch', `${promptId} belongs to ${prompt.listing_id}, not ${listingId}.`);
    const ws = await this.store.getWorkspace(workspaceId);
    if (!ws) throw notFound('workspace_not_found', `No workspace called ${workspaceId}.`);
    const member = await this.store.getMember(workspaceId, userId);
    if (!member) throw forbidden('not_a_member', `${userId} is not a member of ${ws.name}.`);
    const inst = await this.store.getInstall(workspaceId, listingId);
    if (!inst) throw conflict('not_installed', `${listing.name} is not installed in ${ws.name}.`);
    if (inst.status !== 'approved') throw conflict('not_deployed', `IT has not approved ${listing.name} for ${ws.name} yet (status: ${inst.status}).`);
    const consumer = Number(listing.consumer) === 1;
    if (consumer && ws.kind !== 'personal') throw badRequest('consumer_listing', `${listing.name} is a consumer listing and runs only on personal accounts.`);
    if (consumer && surface !== 'chat') throw badRequest('surface_not_offered', `${listing.name} runs only in the chat assistant.`);

    const groups = await this.store.listGroupPolicies(workspaceId, listingId);
    const g = groups.find(x => x.group_name === member.group_name);
    if (!g || !Number(g.enabled)) {
      await this.audit({ actor: userId, workspace_id: workspaceId, listing_id: listingId, action: 'run_blocked', surface, policy_version: inst.policy_version, outcome: 'denied', detail: `group ${member.group_name} not allowed` });
      throw forbidden('group_not_allowed', `${member.display_name}'s group (${member.group_name}) is not allowed to use ${listing.name}. Ask IT to enable it.`);
    }
    const tools = await this.store.listTools(listingId);
    const tool = tools.find(t => t.tool_name === prompt.tool_name);
    const tp = (await this.store.listToolPolicies(workspaceId, listingId)).find(t => t.tool_name === prompt.tool_name);
    if (!tp || !Number(tp.enabled)) {
      await this.audit({ actor: userId, workspace_id: workspaceId, listing_id: listingId, action: 'run_blocked', surface, policy_version: inst.policy_version, outcome: 'denied', detail: `tool ${prompt.tool_name} blocked` });
      throw forbidden('tool_blocked', `IT has turned off ${prompt.tool_name} for ${ws.name}.`);
    }
    const calls = Number(tool?.calls_per_run || 1);
    const cost = consumer ? 0 : money(calls * cfg.callPrice);
    if (!consumer) {
      const spent = (await this.store.usage(workspaceId)).filter(u => u.listing_id === listingId).reduce((s, u) => s + Number(u.cost_usd), 0);
      const cap = Number(inst.spend_cap_usd || 0);
      if (cap > 0 && spent + cost > cap) {
        await this.audit({ actor: userId, workspace_id: workspaceId, listing_id: listingId, action: 'run_blocked', surface, policy_version: inst.policy_version, outcome: 'denied', detail: 'spend cap reached' });
        throw conflict('spend_cap_reached', `${ws.name} has reached its $${cap} monthly cap for ${listing.name}. IT has been notified.`);
      }
    }
    step('discover', `${member.display_name} (${member.group_name}) may use ${prompt.tool_name}; policy v${inst.policy_version}${Number(inst.pii_mask) ? '; PII masked' : ''}`);

    const base = {
      run_id: newId('RUN'), workspace_id: workspaceId, listing_id: listingId, listing_name: listing.name,
      prompt_id: promptId, prompt: prompt.text, tool: prompt.tool_name, access: tool?.access, surface, user_id: userId,
      policy_version: Number(inst.policy_version), at: nowIso(),
    };
    const facts = await this.store.getFacts(promptId);
    let result;

    if (tool?.access === 'link') {
      // Consumer payments link out to the partner. The marketplace never handles card data.
      const link = facts.find(f => f.kind === 'link');
      step('research', 'payment is handled on the partner\'s own checkout');
      result = { ...base, status: 'link_out', link: { url: link?.source, label: link?.claim }, trace, warnings: [], usage: { calls: 0, cost_usd: 0 } };
      await this.audit({ actor: userId, workspace_id: workspaceId, listing_id: listingId, action: 'link_out', surface, policy_version: inst.policy_version, detail: link?.source || '' });
    } else if (tool?.access === 'write' && (Number(inst.human_write) || consumer)) {
      // Writes wait for the person who asked. Same idempotency key -> same approval.
      let approval = key ? await this.store.findApprovalByKey(key) : null;
      if (!approval) {
        approval = {
          approval_id: newId('APR'), idempotency_key: key, workspace_id: workspaceId, listing_id: listingId, prompt_id: promptId,
          tool_name: prompt.tool_name, requested_by: userId, slack_user: body.slackUser || '', surface, status: 'pending', requested_at: nowIso(),
        };
        await this.store.addApproval(approval);
      }
      step('discover', `${prompt.tool_name} writes a record, so ${member.display_name} must approve it`, 'hold');
      result = { ...base, status: 'pending_approval', approval: { approval_id: approval.approval_id, requested_by: userId, tool_name: prompt.tool_name }, trace, warnings: [], usage: { calls: 0, cost_usd: 0 } };
      await this.audit({ actor: userId, workspace_id: workspaceId, listing_id: listingId, action: 'approval_requested', surface, policy_version: inst.policy_version, detail: `${approval.approval_id} ${prompt.tool_name}` });
    } else {
      // ---- Research, Compose, Validate
      step('research', `read ${facts.length} facts from the governed view for ${promptId}`);
      const outcome = await this.composeAndValidate(prompt, facts, cfg, step);
      if (!outcome.ok) {
        result = { ...base, status: 'escalated', reason: outcome.reason, trace, warnings: [], usage: { calls: 0, cost_usd: 0 } };
        await this.audit({ actor: userId, workspace_id: workspaceId, listing_id: listingId, action: 'run_escalated', surface, policy_version: inst.policy_version, outcome: 'escalated', detail: outcome.reason });
      } else {
        const warnings = this.staleWarnings(outcome.claims);
        for (const w of warnings) step('validate', w, 'warn');
        await this.meter({ workspaceId, listingId, tool: prompt.tool_name, calls, cost, key });
        step('meter', `${calls} tool call${calls === 1 ? '' : 's'} · $${cost.toFixed(2)}`);
        result = { ...base, status: 'answered', answer: { claims: outcome.claims, text: outcome.text }, trace, warnings, usage: { calls, cost_usd: cost } };
        await this.audit({ actor: userId, workspace_id: workspaceId, listing_id: listingId, action: 'run', surface, policy_version: inst.policy_version, detail: `${prompt.tool_name}: ${outcome.claims.length} claims, ${warnings.length} warnings` });
      }
    }
    if (key) await this.store.addRun({ run_id: result.run_id, idempotency_key: key, at: result.at, result });
    return result;
  }

  async composeAndValidate(prompt, facts, cfg, step) {
    const rejected = new Set();
    for (let attempt = 1; attempt <= cfg.maxRetries + 1; attempt++) {
      const draft = facts.filter(f => ['fact', 'unknown', 'uncited'].includes(f.kind) && !rejected.has(f.evidence_id));
      step('compose', `attempt ${attempt}: ${draft.length} claims`);
      const bad = draft.filter(f => f.kind !== 'unknown' && (f.kind === 'uncited' || !f.source));
      if (bad.length) {
        bad.forEach(f => rejected.add(f.evidence_id));
        step('validate', `rejected ${bad.length} uncited claim${bad.length === 1 ? '' : 's'}: "${bad.map(f => f.claim).join('"; "')}"`, 'reject');
        if (attempt === cfg.maxRetries + 1) return { ok: false, reason: 'Claims still lacked sources after the maximum retries.' };
        continue;
      }
      if (!draft.some(f => f.kind === 'fact')) return { ok: false, reason: 'No cited facts were available to answer this.' };
      const claims = draft.map(f => ({
        text: f.claim, evidence_id: f.evidence_id, source: f.source, as_of: f.as_of, kind: f.kind, stale: Boolean(f.is_stale),
        source_age_days: f.source_age_days ?? null,
      }));
      step('validate', `${claims.filter(c => c.kind === 'fact').length} claims cited${claims.some(c => c.kind === 'unknown') ? ', unknowns kept as unknown' : ''}`);
      let text = claims.map(c => `${c.kind === 'unknown' ? 'Unknown: ' : ''}${c.text} [${c.evidence_id}]`).join('\n');
      if (cfg.model === 'cortex' && typeof this.store.composeWithModel === 'function') {
        try {
          const worded = await this.store.composeWithModel(prompt.text, claims.map(c => ({ id: c.evidence_id, claim: c.text, kind: c.kind })));
          if (claims.every(c => worded.includes(c.evidence_id))) { text = worded; step('compose', 'worded by Cortex; every evidence ID kept'); }
          else step('validate', 'model wording dropped an evidence ID; kept the scripted wording', 'reject');
        } catch (e) {
          step('compose', `model unavailable (${e.message.slice(0, 80)}); kept the scripted wording`, 'warn');
        }
      }
      return { ok: true, claims, text };
    }
    return { ok: false, reason: 'Validation did not finish.' };
  }

  staleWarnings(claims) {
    const stale = claims.filter(c => c.stale);
    if (!stale.length) return [];
    const age = Math.max(...stale.map(c => Number(c.source_age_days || 0)));
    return [`${stale.length} claim${stale.length === 1 ? ' comes' : 's come'} from data last refreshed ${age} days ago, past its freshness rule. Treat as possibly stale.`];
  }

  async meter({ workspaceId, listingId, tool, calls, cost, key }) {
    await this.store.addCall({ call_id: newId('CALL'), idempotency_key: key || '', at: nowIso(), workspace_id: workspaceId, listing_id: listingId, tool_name: tool, calls, cost_usd: cost });
  }

  // ---------------------------------------------------------------- approvals (owner-only)
  async decide(approvalId, { userId, decision, slackUser } = {}) {
    str(approvalId, 'approvalId', 64);
    str(userId, 'userId', 64);
    if (!['approve', 'decline'].includes(decision)) throw badRequest('bad_decision', 'decision must be approve or decline.');
    const a = await this.store.getApproval(approvalId);
    if (!a) throw notFound('approval_not_found', `No approval called ${approvalId}.`);
    if (a.status !== 'pending') throw conflict('already_decided', `This approval was already ${a.status}.`);
    // Owner-only: the same demo user, and in Slack the same Slack person who asked.
    if (userId !== a.requested_by || (slackUser && slackUser !== a.slack_user)) {
      throw forbidden('owner_only', 'Only the person who asked for this action can approve or decline it.');
    }
    const decided_at = nowIso();
    if (decision === 'decline') {
      const updated = await this.store.updateApproval(approvalId, { status: 'declined', decided_by: userId, decided_at });
      await this.audit({ actor: userId, workspace_id: a.workspace_id, listing_id: a.listing_id, action: 'write_declined', surface: a.surface, detail: `${approvalId} ${a.tool_name}` });
      return { approval: updated, result: { status: 'declined', note: 'Nothing was written.' } };
    }
    const cfg = await this.config();
    const listing = await this.store.getListing(a.listing_id);
    const tool = (await this.store.listTools(a.listing_id)).find(t => t.tool_name === a.tool_name);
    const calls = Number(tool?.calls_per_run || 1);
    const cost = Number(listing?.consumer) === 1 ? 0 : money(calls * cfg.callPrice);
    const facts = (await this.store.getFacts(a.prompt_id)).filter(f => f.kind === 'action');
    await this.meter({ workspaceId: a.workspace_id, listingId: a.listing_id, tool: a.tool_name, calls, cost, key: `approval:${approvalId}` });
    const updated = await this.store.updateApproval(approvalId, { status: 'approved', decided_by: userId, decided_at });
    await this.audit({ actor: userId, workspace_id: a.workspace_id, listing_id: a.listing_id, action: 'write_approved', surface: a.surface, detail: `${approvalId} ${a.tool_name}` });
    return {
      approval: updated,
      result: {
        status: 'done',
        claims: facts.map(f => ({ text: f.claim, evidence_id: f.evidence_id, source: f.source, as_of: f.as_of, kind: f.kind })),
        usage: { calls, cost_usd: cost },
        note: 'Recorded in Meridian. This demo does not change any outside system.',
      },
    };
  }

  async listApprovals(q = {}) { return this.store.listApprovals({ workspaceId: q.workspaceId || '', status: q.status || '' }); }
  async listAudit(q = {}) { return this.store.listAudit({ workspaceId: q.workspaceId || '', limit: q.limit || 50 }); }

  async usage(ws) {
    const w = await this.store.getWorkspace(str(ws, 'workspaceId'));
    if (!w) throw notFound('workspace_not_found', `No workspace called ${ws}.`);
    const cfg = await this.config();
    const rows = await this.store.usage(ws);
    const total = rows.reduce((s, r) => s + Number(r.cost_usd), 0);
    return { workspace_id: ws, rows, total_usd: money(total), partner_earnings_usd: money(total * (1 - cfg.feePct / 100)), fee_pct: cfg.feePct };
  }

  // ---------------------------------------------------------------- operator
  async reviewQueue() {
    const subs = await this.store.listSubmissions();
    return subs.map(s => ({ ...s, checks_passed: ['manifest', 'scopes', 'privacy', 'evals', 'latency', 'injection'].filter(k => Number(s[k])).length }));
  }

  async reviewDecide(id, { decision, reviewer } = {}) {
    str(id, 'submissionId', 64);
    str(reviewer, 'reviewer', 64);
    if (!REVIEW_DECISIONS.includes(decision)) throw badRequest('bad_decision', `decision must be one of: ${REVIEW_DECISIONS.join(', ')}.`);
    const s = (await this.store.listSubmissions()).find(x => x.submission_id === id);
    if (!s) throw notFound('submission_not_found', `No submission called ${id}.`);
    let condition = '';
    if (decision === 'approved') {
      const hardFails = ['evals', 'injection', 'privacy'].filter(k => !Number(s[k]));
      if (hardFails.length) throw conflict('checks_failed', `${s.listing_name} failed ${hardFails.join(', ')}. It cannot be approved until the partner fixes them.`);
      if (!Number(s.scopes)) condition = 'Approved with re-consent: existing installs keep the old tools until IT re-approves the new scope.';
      if (!Number(s.latency)) condition = 'Approved as background-only: hidden from live and in-chat surfaces.';
    }
    const updated = await this.store.updateSubmission(id, decision);
    await this.audit({ actor: reviewer, action: 'review_decision', detail: `${id} ${s.listing_name}: ${decision}${condition ? ` (${condition})` : ''}` });
    return { submission: updated, condition };
  }

  async health() {
    const cfg = await this.config();
    const d = await this.store.operatorData();
    const bookings = d.bookings.map(r => ({ week_start: r.week_start, bookings_usd: Number(r.bookings_usd) }));
    const last4 = bookings.slice(-4).reduce((s, r) => s + r.bookings_usd, 0);
    const prev4 = bookings.slice(-8, -4).reduce((s, r) => s + r.bookings_usd, 0);
    const stage = name => Number(d.funnel.find(f => f.stage === name)?.count || 0);
    const purchased = stage('Purchased');
    const weekly = stage('Weekly active');
    const deployed = stage('Deployed by IT');
    const listings = await this.store.listListings();
    return {
      as_of: cfg.today,
      kpis: {
        bookings_4w_usd: last4,
        bookings_change_pct: prev4 ? Math.round(((last4 - prev4) / prev4) * 1000) / 10 : null,
        purchase_to_weekly_active_pct: purchased ? Math.round((weekly / purchased) * 1000) / 10 : null,
        deployed_not_weekly_pct: deployed ? Math.round(((deployed - weekly) / deployed) * 1000) / 10 : null,
        partner_payouts_4w_usd: Math.round(last4 * (1 - cfg.feePct / 100)),
        fee_pct: cfg.feePct,
      },
      bookings, funnel: d.funnel.map(f => ({ ...f, count: Number(f.count) })),
      adoption: d.adoption.map(a => ({ ...a, name: listings.find(l => l.listing_id === a.listing_id)?.name || a.listing_id })),
      supply_gaps: d.supply,
      stale_listings: listings.filter(l => l.is_stale).map(l => ({ listing_id: l.listing_id, name: l.name, data_age_days: l.data_age_days, rule_days: num(l.freshness_rule_days) })),
    };
  }
}

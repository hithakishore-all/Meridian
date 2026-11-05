// Offline store: the same interface as the live Snowflake store, backed by fixtures/snapshot.json in memory.
// The snapshot is built by data/generate_data.py from the same rows that seed Snowflake.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT = path.resolve(here, '..', '..', 'fixtures', 'snapshot.json');

const dayMs = 86400000;
const daysBetween = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / dayMs);

export class OfflineStore {
  constructor(snapshotPath = SNAPSHOT) {
    this.snapshotPath = snapshotPath;
    this.kind = 'offline';
    this.reset();
  }

  reset() {
    const raw = JSON.parse(fs.readFileSync(this.snapshotPath, 'utf8'));
    this.t = structuredClone(raw);
    this.t.audit = [];
    this.t.approvals = [];
    this.t.calls = [];
    this.t.runs = [];
    return Promise.resolve();
  }

  async ping() { return { ok: true, store: 'offline' }; }
  async close() {}

  async getConfig() {
    return Object.fromEntries(this.t.config.map(r => [r.config_key, r.config_value]));
  }

  #withFreshness(l, today) {
    const age = l.data_refreshed_on ? daysBetween(l.data_refreshed_on, today) : null;
    const rule = l.freshness_rule_days === '' || l.freshness_rule_days == null ? null : Number(l.freshness_rule_days);
    return { ...l, data_age_days: age, is_stale: rule != null && age != null && age > rule };
  }

  async listListings() {
    const { DEMO_TODAY } = await this.getConfig();
    return this.t.listings.map(l => this.#withFreshness(l, DEMO_TODAY));
  }
  async getListing(id) { return (await this.listListings()).find(l => l.listing_id === id) || null; }
  async listTools(listingId) { return this.t.tools.filter(t => t.listing_id === listingId); }
  async listPrompts(listingId) { return this.t.prompts.filter(p => !listingId || p.listing_id === listingId); }
  async getPrompt(id) { return this.t.prompts.find(p => p.prompt_id === id) || null; }

  async listWorkspaces() { return this.t.workspaces; }
  async getWorkspace(id) { return this.t.workspaces.find(w => w.workspace_id === id) || null; }
  async listMembers(ws) { return this.t.members.filter(m => m.workspace_id === ws); }
  async getMember(ws, userId) { return this.t.members.find(m => m.workspace_id === ws && m.user_id === userId) || null; }

  async listInstalls(ws) { return this.t.installs.filter(i => i.workspace_id === ws); }
  async getInstall(ws, l) { return this.t.installs.find(i => i.workspace_id === ws && i.listing_id === l) || null; }
  async updateInstall(ws, l, patch) {
    const i = await this.getInstall(ws, l);
    Object.assign(i, patch);
    return i;
  }
  async listGroupPolicies(ws, l) { return this.t.group_policies.filter(g => g.workspace_id === ws && g.listing_id === l); }
  async setGroupPolicy(ws, l, group, enabled) {
    const g = this.t.group_policies.find(x => x.workspace_id === ws && x.listing_id === l && x.group_name === group);
    if (g) g.enabled = enabled ? 1 : 0;
  }
  async listToolPolicies(ws, l) { return this.t.tool_policies.filter(g => g.workspace_id === ws && g.listing_id === l); }
  async setToolPolicy(ws, l, tool, enabled) {
    const g = this.t.tool_policies.find(x => x.workspace_id === ws && x.listing_id === l && x.tool_name === tool);
    if (g) g.enabled = enabled ? 1 : 0;
  }

  // Mirrors MERIDIAN.CORE.V_AGENT_FACTS
  async getFacts(promptId) {
    const { DEMO_TODAY } = await this.getConfig();
    const p = await this.getPrompt(promptId);
    return this.t.facts.filter(f => f.prompt_id === promptId).map(f => {
      const src = f.source_listing ? this.t.listings.find(l => l.listing_id === f.source_listing) : null;
      const fresh = src ? this.#withFreshness(src, DEMO_TODAY) : null;
      return {
        evidence_id: f.evidence_id, prompt_id: f.prompt_id, listing_id: p?.listing_id, tool_name: p?.tool_name,
        claim: f.claim, source: f.source || null, as_of: f.as_of || null, kind: f.kind,
        source_listing: f.source_listing || null, is_stale: fresh ? fresh.is_stale : false,
        source_age_days: fresh ? fresh.data_age_days : null,
      };
    });
  }

  async addAudit(e) { this.t.audit.push(e); }
  async listAudit({ workspaceId, limit = 50 } = {}) {
    return this.t.audit.filter(e => !workspaceId || e.workspace_id === workspaceId).slice(-limit).reverse();
  }
  async addCall(c) { this.t.calls.push(c); }
  async usage(ws) {
    const out = {};
    for (const c of this.t.calls.filter(c => c.workspace_id === ws)) {
      out[c.listing_id] ||= { listing_id: c.listing_id, calls: 0, cost_usd: 0 };
      out[c.listing_id].calls += c.calls;
      out[c.listing_id].cost_usd = Math.round((out[c.listing_id].cost_usd + c.cost_usd) * 10000) / 10000;
    }
    return Object.values(out);
  }

  async addApproval(a) { this.t.approvals.push(a); }
  async getApproval(id) { return this.t.approvals.find(a => a.approval_id === id) || null; }
  async findApprovalByKey(key) { return this.t.approvals.find(a => a.idempotency_key === key) || null; }
  async updateApproval(id, patch) { const a = await this.getApproval(id); Object.assign(a, patch); return a; }
  async listApprovals({ workspaceId, status } = {}) {
    return this.t.approvals.filter(a => (!workspaceId || a.workspace_id === workspaceId) && (!status || a.status === status));
  }

  async getRunByKey(key) { const r = this.t.runs.find(x => x.idempotency_key === key); return r ? r.result : null; }
  async addRun(run) { this.t.runs.push(run); }

  async listSubmissions() { return this.t.submissions; }
  async updateSubmission(id, status) {
    const s = this.t.submissions.find(x => x.submission_id === id);
    if (s) s.status = status;
    return s || null;
  }
  async operatorData() {
    return {
      bookings: this.t.bookings_weekly, funnel: [...this.t.funnel].sort((a, b) => a.ord - b.ord),
      adoption: this.t.adoption, supply: this.t.supply_gaps,
    };
  }
}

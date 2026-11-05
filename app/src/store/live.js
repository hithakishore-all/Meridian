// Live store: reads and writes Snowflake through the key-pair service user (no password).
// Same interface as OfflineStore. Every name is fully qualified; binds never send null (Snowpark-style
// drivers can bind None/null as the string 'None'), so empty values go as '' and SQL turns them back with NULLIF.
import snowflake from 'snowflake-sdk';
import path from 'node:path';

const lower = row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase(), v]));
const b = v => (v === null || v === undefined ? '' : v);

export class LiveStore {
  constructor(cfg, baseDir = process.cwd()) {
    this.kind = 'live';
    this.cfg = cfg;
    this.baseDir = baseDir;
    this.conn = null;
  }

  async connect() {
    if (this.conn) return this.conn;
    snowflake.configure({ logLevel: 'ERROR' });
    const s = this.cfg;
    const conn = snowflake.createConnection({
      account: s.account,
      username: s.username,
      authenticator: 'SNOWFLAKE_JWT',
      privateKeyPath: path.resolve(this.baseDir, s.privateKeyPath),
      privateKeyPass: s.privateKeyPass || undefined,
      role: s.role,
      warehouse: s.warehouse,
      database: s.database,
      application: 'Meridian',
    });
    await new Promise((resolve, reject) => conn.connect(err => (err ? reject(err) : resolve())));
    this.conn = conn;
    return conn;
  }

  async q(sqlText, binds = []) {
    const conn = await this.connect();
    return new Promise((resolve, reject) => {
      conn.execute({
        sqlText, binds: binds.map(b), fetchAsString: ['Date'],
        complete: (err, _stmt, rows) => (err ? reject(err) : resolve((rows || []).map(lower))),
      });
    });
  }

  async ping() { await this.q('SELECT 1 AS OK'); return { ok: true, store: 'live' }; }
  async close() {
    if (!this.conn) return;
    await new Promise(r => this.conn.destroy(() => r()));
    this.conn = null;
  }

  async reset() {
    for (const s of [
      'DELETE FROM MERIDIAN.OPS.RUNS', 'DELETE FROM MERIDIAN.OPS.APPROVALS',
      'DELETE FROM MERIDIAN.OPS.CALLS', 'DELETE FROM MERIDIAN.OPS.AUDIT',
      `UPDATE MERIDIAN.CORE.INSTALLS SET STATUS='not_purchased', PLAN=NULL, PAY_VIA=NULL, APPROVED_BY=NULL, APPROVED_ON=NULL,
         POLICY_VERSION=1, HUMAN_WRITE=1, PII_MASK=1, SPEND_CAP_USD=2000 WHERE WORKSPACE_ID='nw-freight' AND LISTING_ID='orbit'`,
      `UPDATE MERIDIAN.CORE.TOOL_POLICIES SET ENABLED = IFF(TOOL_NAME='sync_to_crm',0,1) WHERE WORKSPACE_ID='nw-freight' AND LISTING_ID='orbit'`,
      `UPDATE MERIDIAN.CORE.GROUP_POLICIES SET ENABLED = IFF(GROUP_NAME='Marketing',0,1) WHERE WORKSPACE_ID='nw-freight' AND LISTING_ID='orbit'`,
      `UPDATE MERIDIAN.CORE.SUBMISSIONS SET STATUS='pending'`,
    ]) await this.q(s);
  }

  async getConfig() {
    const rows = await this.q('SELECT CONFIG_KEY, CONFIG_VALUE FROM MERIDIAN.OPS.CONFIG');
    return Object.fromEntries(rows.map(r => [r.config_key, r.config_value]));
  }

  async listListings() { return this.q('SELECT * FROM MERIDIAN.CORE.V_LISTINGS ORDER BY FEATURED DESC, NAME'); }
  async getListing(id) { return (await this.q('SELECT * FROM MERIDIAN.CORE.V_LISTINGS WHERE LISTING_ID = ?', [id]))[0] || null; }
  async listTools(listingId) { return this.q('SELECT * FROM MERIDIAN.CORE.TOOLS WHERE LISTING_ID = ? ORDER BY ACCESS, TOOL_NAME', [listingId]); }
  async listPrompts(listingId) {
    return listingId
      ? this.q('SELECT * FROM MERIDIAN.CORE.PROMPTS WHERE LISTING_ID = ? ORDER BY PROMPT_ID', [listingId])
      : this.q('SELECT * FROM MERIDIAN.CORE.PROMPTS ORDER BY PROMPT_ID');
  }
  async getPrompt(id) { return (await this.q('SELECT * FROM MERIDIAN.CORE.PROMPTS WHERE PROMPT_ID = ?', [id]))[0] || null; }

  async listWorkspaces() { return this.q('SELECT * FROM MERIDIAN.CORE.WORKSPACES ORDER BY WORKSPACE_ID'); }
  async getWorkspace(id) { return (await this.q('SELECT * FROM MERIDIAN.CORE.WORKSPACES WHERE WORKSPACE_ID = ?', [id]))[0] || null; }
  async listMembers(ws) { return this.q('SELECT * FROM MERIDIAN.CORE.MEMBERS WHERE WORKSPACE_ID = ? ORDER BY DISPLAY_NAME', [ws]); }
  async getMember(ws, userId) {
    return (await this.q('SELECT * FROM MERIDIAN.CORE.MEMBERS WHERE WORKSPACE_ID = ? AND USER_ID = ?', [ws, userId]))[0] || null;
  }

  async listInstalls(ws) { return this.q('SELECT * FROM MERIDIAN.CORE.INSTALLS WHERE WORKSPACE_ID = ?', [ws]); }
  async getInstall(ws, l) {
    return (await this.q('SELECT * FROM MERIDIAN.CORE.INSTALLS WHERE WORKSPACE_ID = ? AND LISTING_ID = ?', [ws, l]))[0] || null;
  }
  async updateInstall(ws, l, patch) {
    const allowed = ['status', 'plan', 'pay_via', 'spend_cap_usd', 'human_write', 'pii_mask', 'policy_version', 'approved_by', 'approved_on'];
    const keys = Object.keys(patch).filter(k => allowed.includes(k));
    if (keys.length) {
      const sets = keys.map(k => `${k.toUpperCase()} = NULLIF(?, '')`).join(', ');
      await this.q(`UPDATE MERIDIAN.CORE.INSTALLS SET ${sets} WHERE WORKSPACE_ID = ? AND LISTING_ID = ?`,
        [...keys.map(k => String(b(patch[k]))), ws, l]);
    }
    return this.getInstall(ws, l);
  }
  async listGroupPolicies(ws, l) {
    return this.q('SELECT * FROM MERIDIAN.CORE.GROUP_POLICIES WHERE WORKSPACE_ID = ? AND LISTING_ID = ? ORDER BY GROUP_NAME', [ws, l]);
  }
  async setGroupPolicy(ws, l, group, enabled) {
    await this.q('UPDATE MERIDIAN.CORE.GROUP_POLICIES SET ENABLED = ? WHERE WORKSPACE_ID = ? AND LISTING_ID = ? AND GROUP_NAME = ?',
      [enabled ? 1 : 0, ws, l, group]);
  }
  async listToolPolicies(ws, l) {
    return this.q('SELECT * FROM MERIDIAN.CORE.TOOL_POLICIES WHERE WORKSPACE_ID = ? AND LISTING_ID = ? ORDER BY TOOL_NAME', [ws, l]);
  }
  async setToolPolicy(ws, l, tool, enabled) {
    await this.q('UPDATE MERIDIAN.CORE.TOOL_POLICIES SET ENABLED = ? WHERE WORKSPACE_ID = ? AND LISTING_ID = ? AND TOOL_NAME = ?',
      [enabled ? 1 : 0, ws, l, tool]);
  }

  async getFacts(promptId) {
    return this.q('SELECT * FROM MERIDIAN.CORE.V_AGENT_FACTS WHERE PROMPT_ID = ? ORDER BY EVIDENCE_ID', [promptId]);
  }

  async addAudit(e) {
    await this.q(`INSERT INTO MERIDIAN.OPS.AUDIT (EVENT_ID, AT, ACTOR, WORKSPACE_ID, LISTING_ID, ACTION, SURFACE, POLICY_VERSION, OUTCOME, DETAIL)
      SELECT ?, TO_TIMESTAMP_NTZ(?), ?, NULLIF(?, ''), NULLIF(?, ''), ?, NULLIF(?, ''), TRY_TO_NUMBER(NULLIF(?, '')), ?, NULLIF(?, '')`,
      [e.event_id, e.at, e.actor, e.workspace_id, e.listing_id, e.action, e.surface, String(b(e.policy_version)), e.outcome, e.detail]);
  }
  async listAudit({ workspaceId, limit = 50 } = {}) {
    const n = Math.max(1, Math.min(500, Number(limit) || 50));
    return workspaceId
      ? this.q(`SELECT * FROM MERIDIAN.OPS.AUDIT WHERE WORKSPACE_ID = ? ORDER BY AT DESC LIMIT ${n}`, [workspaceId])
      : this.q(`SELECT * FROM MERIDIAN.OPS.AUDIT ORDER BY AT DESC LIMIT ${n}`);
  }
  async addCall(c) {
    await this.q(`INSERT INTO MERIDIAN.OPS.CALLS (CALL_ID, IDEMPOTENCY_KEY, AT, WORKSPACE_ID, LISTING_ID, TOOL_NAME, CALLS, COST_USD)
      SELECT ?, NULLIF(?, ''), TO_TIMESTAMP_NTZ(?), ?, ?, ?, ?, ?`,
      [c.call_id, c.idempotency_key, c.at, c.workspace_id, c.listing_id, c.tool_name, c.calls, c.cost_usd]);
  }
  async usage(ws) { return this.q('SELECT LISTING_ID, CALLS, COST_USD FROM MERIDIAN.OPS.V_USAGE WHERE WORKSPACE_ID = ?', [ws]); }

  async addApproval(a) {
    await this.q(`INSERT INTO MERIDIAN.OPS.APPROVALS (APPROVAL_ID, IDEMPOTENCY_KEY, WORKSPACE_ID, LISTING_ID, PROMPT_ID, TOOL_NAME,
        REQUESTED_BY, SLACK_USER, SURFACE, STATUS, REQUESTED_AT)
      SELECT ?, NULLIF(?, ''), ?, ?, ?, ?, ?, NULLIF(?, ''), ?, ?, TO_TIMESTAMP_NTZ(?)`,
      [a.approval_id, a.idempotency_key, a.workspace_id, a.listing_id, a.prompt_id, a.tool_name, a.requested_by,
        a.slack_user, a.surface, a.status, a.requested_at]);
  }
  async getApproval(id) { return (await this.q('SELECT * FROM MERIDIAN.OPS.APPROVALS WHERE APPROVAL_ID = ?', [id]))[0] || null; }
  async findApprovalByKey(key) {
    return (await this.q('SELECT * FROM MERIDIAN.OPS.APPROVALS WHERE IDEMPOTENCY_KEY = ?', [key]))[0] || null;
  }
  async updateApproval(id, patch) {
    await this.q(`UPDATE MERIDIAN.OPS.APPROVALS SET STATUS = ?, DECIDED_BY = ?, DECIDED_AT = TO_TIMESTAMP_NTZ(?) WHERE APPROVAL_ID = ?`,
      [patch.status, patch.decided_by, patch.decided_at, id]);
    return this.getApproval(id);
  }
  async listApprovals({ workspaceId, status } = {}) {
    return this.q(`SELECT * FROM MERIDIAN.OPS.APPROVALS
      WHERE (? = '' OR WORKSPACE_ID = ?) AND (? = '' OR STATUS = ?) ORDER BY REQUESTED_AT DESC`,
      [b(workspaceId), b(workspaceId), b(status), b(status)]);
  }

  async getRunByKey(key) {
    const r = (await this.q('SELECT RESULT FROM MERIDIAN.OPS.RUNS WHERE IDEMPOTENCY_KEY = ?', [key]))[0];
    if (!r) return null;
    return typeof r.result === 'string' ? JSON.parse(r.result) : r.result;
  }
  async addRun(run) {
    await this.q(`INSERT INTO MERIDIAN.OPS.RUNS (RUN_ID, IDEMPOTENCY_KEY, AT, RESULT)
      SELECT ?, NULLIF(?, ''), TO_TIMESTAMP_NTZ(?), PARSE_JSON(?)`, [run.run_id, run.idempotency_key, run.at, JSON.stringify(run.result)]);
  }

  async listSubmissions() { return this.q('SELECT * FROM MERIDIAN.CORE.SUBMISSIONS ORDER BY SUBMISSION_ID'); }
  async updateSubmission(id, status) {
    await this.q('UPDATE MERIDIAN.CORE.SUBMISSIONS SET STATUS = ? WHERE SUBMISSION_ID = ?', [status, id]);
    return (await this.q('SELECT * FROM MERIDIAN.CORE.SUBMISSIONS WHERE SUBMISSION_ID = ?', [id]))[0] || null;
  }
  async operatorData() {
    const [bookings, funnel, adoption, supply] = await Promise.all([
      this.q('SELECT WEEK_START, BOOKINGS_USD FROM MERIDIAN.CORE.BOOKINGS_WEEKLY ORDER BY WEEK_START'),
      this.q('SELECT ORD, STAGE, COUNT FROM MERIDIAN.CORE.FUNNEL ORDER BY ORD'),
      this.q('SELECT * FROM MERIDIAN.CORE.ADOPTION ORDER BY WEEKLY_ACTIVE_PCT'),
      this.q('SELECT * FROM MERIDIAN.CORE.SUPPLY_GAPS ORDER BY WORKSPACES DESC'),
    ]);
    return { bookings, funnel, adoption, supply };
  }

  // Optional: reword claims with Cortex when MODEL = 'cortex' (sql/05_agents.sql).
  async composeWithModel(question, claims) {
    const r = await this.q('SELECT MERIDIAN.CORE.COMPOSE_ANSWER(?, ?) AS TEXT', [question, JSON.stringify(claims)]);
    return r[0]?.text || '';
  }
}

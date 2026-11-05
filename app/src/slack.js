// Slack bot (Bolt, Socket Mode: no public URL needed). Shares the engine with the web console.
// Commands: /meridian help | listings | prompts <listing> | run <promptId> [chat|data|slack] | approvals | usage <workspace>
// Approve and Decline buttons work only for the Slack person who asked (owner-only). Approving records the action; it sends nothing.
import bolt from '@slack/bolt';
import { HttpError } from './errors.js';

const { App } = bolt;

const HELP = [
  '*Meridian* runs marketplace agents under your workspace\'s policy. All data is fictional.',
  '• `/meridian listings` shows the featured listings',
  '• `/meridian prompts orbit` shows what you can ask an agent',
  '• `/meridian run orbit-brief` runs a prompt (add `data` or `chat` to pick a surface; default is `slack`)',
  '• `/meridian approvals` shows writes waiting for you',
  '• `/meridian usage nw-freight` shows spend for a workspace',
  'Try the demo order: `run orbit-brief` (works after IT deploys Orbit in the web console), `run conviction-memo`, `run credits-solve`, `run conviction-export`.',
].join('\n');

export function formatRun(r) {
  const head = `*${r.listing_name}* · ${r.prompt}`;
  if (r.status === 'answered') {
    const lines = r.answer.claims.map(c => `• ${c.kind === 'unknown' ? '_Unknown:_ ' : ''}${c.text} \`${c.evidence_id}\`${c.stale ? ' :warning:' : ''}`);
    const warn = r.warnings.map(w => `:warning: ${w}`);
    const trace = r.trace.filter(t => t.state === 'reject').map(t => `:no_entry: Validator ${t.detail}`);
    return [head, ...lines, ...warn, ...trace, `_${r.usage.calls} tool calls · $${r.usage.cost_usd.toFixed(2)} · policy v${r.policy_version}_`].join('\n');
  }
  if (r.status === 'pending_approval') return `${head}\n:hourglass: \`${r.tool}\` writes a record, so it needs your approval. Only you can approve it.`;
  if (r.status === 'link_out') return `${head}\n${r.link.label}\nCheckout: ${r.link.url} (the marketplace never sees your card)`;
  if (r.status === 'escalated') return `${head}\n:rotating_light: Escalated to a person: ${r.reason}`;
  return head;
}

function approvalBlocks(text, approvalId) {
  return [
    { type: 'section', text: { type: 'mrkdwn', text } },
    {
      type: 'actions', elements: [
        { type: 'button', text: { type: 'plain_text', text: 'Approve' }, style: 'primary', action_id: 'meridian_approve', value: approvalId },
        { type: 'button', text: { type: 'plain_text', text: 'Decline' }, action_id: 'meridian_decline', value: approvalId },
      ],
    },
  ];
}

const errText = e => (e instanceof HttpError ? `:no_entry_sign: ${e.message}` : ':warning: Something went wrong. Check the Meridian terminal.');

export async function handleCommand(engine, text, slackUser) {
  const [cmd = 'help', a1, a2] = String(text || '').trim().split(/\s+/);
  if (cmd === 'help' || !cmd) return { text: HELP };
  if (cmd === 'listings') {
    const ls = (await engine.searchListings()).filter(l => Number(l.featured));
    return { text: ls.map(l => `• *${l.name}* (\`${l.listing_id}\`) · ${l.category} · ${l.description}`).join('\n') };
  }
  if (cmd === 'prompts') {
    if (!a1) return { text: 'Which listing? For example `/meridian prompts orbit`.' };
    const d = await engine.listingDetail(a1);
    return { text: d.prompts.map(p => `• \`${p.prompt_id}\` ${p.text}`).join('\n') || 'No prompts for that listing.' };
  }
  if (cmd === 'run') {
    if (!a1) return { text: 'Which prompt? For example `/meridian run orbit-brief`.' };
    const prompt = await engine.store.getPrompt(a1);
    if (!prompt) return { text: `No prompt called \`${a1}\`. Try \`/meridian prompts orbit\`.` };
    const def = engine.defaultsFor(prompt.listing_id);
    if (!def) return { text: `${prompt.listing_id} has no demo workspace.` };
    const surface = a2 || (prompt.listing_id === 'readaroo' ? 'chat' : 'slack');
    const r = await engine.run({ ...def, listingId: prompt.listing_id, promptId: a1, surface, slackUser });
    const text = formatRun(r);
    return r.status === 'pending_approval' ? { text, blocks: approvalBlocks(text, r.approval.approval_id) } : { text };
  }
  if (cmd === 'approvals') {
    const list = (await engine.listApprovals({ status: 'pending' })).filter(a => a.slack_user === slackUser);
    if (!list.length) return { text: 'Nothing is waiting for your approval.' };
    return { text: list.map(a => `• \`${a.approval_id}\` ${a.tool_name} in ${a.workspace_id}`).join('\n') };
  }
  if (cmd === 'usage') {
    const u = await engine.usage(a1 || 'nw-freight');
    return { text: `*${u.workspace_id}*: $${u.total_usd.toFixed(2)} this month · partners earn $${u.partner_earnings_usd.toFixed(2)} after a ${u.fee_pct}% fee\n${u.rows.map(r => `• ${r.listing_id}: ${r.calls} calls, $${Number(r.cost_usd).toFixed(2)}`).join('\n')}` };
  }
  return { text: `I don't know \`${cmd}\`.\n${HELP}` };
}

export async function decideFromSlack(engine, approvalId, slackUser, decision) {
  const a = await engine.store.getApproval(approvalId);
  if (!a) return ':no_entry_sign: That approval no longer exists.';
  const out = await engine.decide(approvalId, { userId: a.requested_by, decision, slackUser });
  if (out.result.status === 'declined') return ':x: Declined. Nothing was written.';
  return [':white_check_mark: Approved.', ...out.result.claims.map(c => `• ${c.text} \`${c.evidence_id}\``), `_${out.result.note}_`].join('\n');
}

export async function startSlack(engine, { botToken, appToken }) {
  const app = new App({ token: botToken, appToken, socketMode: true });

  app.command('/meridian', async ({ command, ack, respond }) => {
    await ack();
    try { await respond({ response_type: 'in_channel', ...(await handleCommand(engine, command.text, command.user_id)) }); }
    catch (e) { await respond({ response_type: 'ephemeral', text: errText(e) }); }
  });

  app.event('app_mention', async ({ event, say }) => {
    const text = String(event.text || '').replace(/<@[^>]+>/g, '').trim();
    try { await say({ thread_ts: event.ts, ...(await handleCommand(engine, text, event.user)) }); }
    catch (e) { await say({ thread_ts: event.ts, text: errText(e) }); }
  });

  for (const [actionId, decision] of [['meridian_approve', 'approve'], ['meridian_decline', 'decline']]) {
    app.action(actionId, async ({ ack, body, action, respond }) => {
      await ack();
      try { await respond({ replace_original: true, text: await decideFromSlack(engine, action.value, body.user.id, decision) }); }
      catch (e) { await respond({ replace_original: false, response_type: 'ephemeral', text: errText(e) }); }
    });
  }

  await app.start();
  return app;
}

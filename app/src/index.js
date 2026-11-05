#!/usr/bin/env node
// Start Meridian: `npm start` (live, Snowflake), `npm run offline` (no accounts), `npm run check` (config only).
import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, loadConfig, checkConfig } from './config.js';
import { Engine } from './engine.js';
import { OfflineStore } from './store/offline.js';
import { createApp, listen } from './server.js';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs(process.argv.slice(2));
const cfg = loadConfig(process.env, args);
const problems = checkConfig(cfg, appDir);

if (args.check || problems.length) {
  console.log(`Meridian configuration (${cfg.mode} mode${cfg.slack.enabled ? ' + Slack' : ''})`);
  if (!problems.length) { console.log('  Everything needed is set.'); process.exit(0); }
  for (const p of problems) console.log(`  - ${p}`);
  if (cfg.mode === 'live') console.log('\nTip: run `npm run offline` to try Meridian with no accounts.');
  process.exit(args.check ? 1 : 2);
}

let store;
if (cfg.mode === 'offline') {
  store = new OfflineStore();
} else {
  const { LiveStore } = await import('./store/live.js');
  store = new LiveStore(cfg.snowflake, appDir);
  try {
    await store.ping();
  } catch (e) {
    console.error(`Could not connect to Snowflake: ${e.message}`);
    console.error('Check SNOWFLAKE_ACCOUNT and the key pair (docs/SETUP_SNOWFLAKE.md, steps 4 to 6), or run `npm run offline`.');
    process.exit(3);
  }
}

const engine = new Engine(store);
const app = createApp(engine, { mode: cfg.mode });
const server = await listen(app, { host: cfg.host, port: cfg.port });
const { port } = server.address();
console.log(`Meridian is running in ${cfg.mode} mode at http://${cfg.host === '0.0.0.0' ? 'localhost' : cfg.host}:${port}`);
if (cfg.mode === 'offline') console.log('All data is fictional and kept in memory; restarting resets the demo.');

let slackApp = null;
if (cfg.slack.enabled) {
  const { startSlack } = await import('./slack.js');
  try {
    slackApp = await startSlack(engine, cfg.slack);
    console.log('Slack bot connected (Socket Mode). Try /meridian help in Slack.');
  } catch (e) {
    console.error(`Slack bot did not start: ${e.message}. See docs/SETUP_SLACK.md. The web console still works.`);
  }
}

let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(`\n${signal} received, shutting down.`);
  try { if (slackApp) await slackApp.stop(); } catch { /* ignore */ }
  server.close();
  try { await store.close(); } catch { /* ignore */ }
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

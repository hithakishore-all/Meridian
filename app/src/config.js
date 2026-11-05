// Reads settings from the environment (.env) and command-line flags, and explains anything missing.
import fs from 'node:fs';
import path from 'node:path';

export function parseArgs(argv) {
  const args = { offline: false, check: false, port: undefined, slack: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--offline') args.offline = true;
    else if (a === '--check') args.check = true;
    else if (a === '--no-slack') args.slack = false;
    else if (a === '--port') args.port = Number(argv[++i]);
    else if (a.startsWith('--port=')) args.port = Number(a.slice(7));
  }
  return args;
}

export function loadConfig(env = process.env, args = {}) {
  const offline = args.offline || env.MERIDIAN_MODE === 'offline';
  const port = Number.isFinite(args.port) ? args.port : Number(env.MERIDIAN_PORT || 3000);
  return {
    mode: offline ? 'offline' : 'live',
    host: env.MERIDIAN_HOST || '127.0.0.1',
    port,
    snowflake: {
      account: env.SNOWFLAKE_ACCOUNT || '',
      username: env.SNOWFLAKE_USER || 'MERIDIAN_SVC',
      privateKeyPath: env.SNOWFLAKE_PRIVATE_KEY_PATH || '',
      privateKeyPass: env.SNOWFLAKE_PRIVATE_KEY_PASSPHRASE || '',
      role: env.SNOWFLAKE_ROLE || 'MERIDIAN_APP',
      warehouse: env.SNOWFLAKE_WAREHOUSE || 'MERIDIAN_WH',
      database: env.SNOWFLAKE_DATABASE || 'MERIDIAN',
    },
    slack: {
      enabled: args.slack !== false && Boolean(env.SLACK_BOT_TOKEN || env.SLACK_APP_TOKEN),
      botToken: env.SLACK_BOT_TOKEN || '',
      appToken: env.SLACK_APP_TOKEN || '',
    },
  };
}

// Returns a list of problems, each naming what is missing and which doc step fixes it.
export function checkConfig(cfg, baseDir = process.cwd()) {
  const problems = [];
  if (cfg.mode === 'live') {
    const s = cfg.snowflake;
    if (!s.account) problems.push('SNOWFLAKE_ACCOUNT is not set. Add your account identifier to .env (docs/SETUP_SNOWFLAKE.md, step 6).');
    if (!s.privateKeyPath) problems.push('SNOWFLAKE_PRIVATE_KEY_PATH is not set. Point it at .keys/meridian_svc.p8 (docs/SETUP_SNOWFLAKE.md, step 4).');
    else if (!fs.existsSync(path.resolve(baseDir, s.privateKeyPath))) problems.push(`No private key found at ${s.privateKeyPath}. Create the key pair (docs/SETUP_SNOWFLAKE.md, step 4) or fix the path in .env.`);
  }
  if (cfg.slack.enabled) {
    if (!cfg.slack.botToken) problems.push('SLACK_BOT_TOKEN is not set. Install the Slack app and copy its Bot User OAuth Token (docs/SETUP_SLACK.md, step 3).');
    else if (!cfg.slack.botToken.startsWith('xoxb-')) problems.push('SLACK_BOT_TOKEN should start with xoxb-. Copy the Bot User OAuth Token, not another token (docs/SETUP_SLACK.md, step 3).');
    if (!cfg.slack.appToken) problems.push('SLACK_APP_TOKEN is not set. Create an app-level token with connections:write (docs/SETUP_SLACK.md, step 4).');
    else if (!cfg.slack.appToken.startsWith('xapp-')) problems.push('SLACK_APP_TOKEN should start with xapp-. Create an app-level token (docs/SETUP_SLACK.md, step 4).');
  }
  if (!Number.isInteger(cfg.port) || cfg.port < 0 || cfg.port > 65535) problems.push('MERIDIAN_PORT must be a whole number between 0 and 65535.');
  return problems;
}

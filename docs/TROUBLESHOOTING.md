# Troubleshooting

Start with `npm run check` from `meridian/app`: it lists every missing or malformed setting and the setup step that fixes it.

## Node and the app

| Symptom | Cause | Fix |
| --- | --- | --- |
| `npm ci` fails with an engine or syntax error | Node older than 20 | Install Node 20 or newer (`nvm use` reads `.nvmrc`) |
| `npm start` exits listing missing settings | Live mode needs Snowflake settings | Run `npm run offline`, or follow docs/SETUP_SNOWFLAKE.md |
| `EADDRINUSE` | Port 3000 is taken | `npm run offline -- --port 3001`, or set `MERIDIAN_PORT` |
| Console loads but shows an error box | The server stopped | Check the terminal; restart with `npm run offline` |
| Changes in offline mode disappear | Offline data lives in memory | Expected. Use live mode to keep state |
| Teammates cannot open the console | It listens on 127.0.0.1 | Set `MERIDIAN_HOST=0.0.0.0` on a trusted network only |

## Snowflake

| Symptom | Cause | Fix |
| --- | --- | --- |
| `JWT token is invalid` | Public key in Snowflake does not match `.keys/meridian_svc.p8` | Copy the public key again (SETUP_SNOWFLAKE step 4) and re-run `ALTER USER MERIDIAN_SVC SET RSA_PUBLIC_KEY = '...'` |
| `Incorrect username or password` | Account identifier wrong | Use the result of `SELECT CURRENT_ORGANIZATION_NAME() || '-' || CURRENT_ACCOUNT_NAME();` |
| `Object does not exist or not authorized` | Grants ran before tables existed | Re-run `06_service_user.sql` after `02` to `04` |
| `Insufficient privileges to operate on warehouse` | Role lacks warehouse usage | Re-run `01_setup.sql` and `06_service_user.sql` |
| Freshness flags never change | `DEMO_TODAY` is pinned | Expected; update `OPS.CONFIG` to move it |
| `Unknown function AI_COMPLETE` | Cortex not available (trial accounts) | Keep `MODEL = scripted`; the answers stay cited |
| Seed counts look wrong | `02_tables.sql` re-run after seeding | Re-run `04_seed.sql` |

## Slack

| Symptom | Cause | Fix |
| --- | --- | --- |
| Slack says `/meridian` did not respond | Meridian is not running | Start it; the bot only works while the server runs |
| `Slack bot did not start: invalid_auth` | Bot token wrong or from another app | Copy the Bot User OAuth Token again (SETUP_SLACK step 3) |
| `not_allowed_token_type` | App token in the bot slot, or the reverse | `xoxb-` goes in `SLACK_BOT_TOKEN`, `xapp-` in `SLACK_APP_TOKEN` |
| Mentions get no reply | Bot not in the channel | `/invite @Meridian` |
| Buttons say "Only the person who asked" | Owner rule | Expected: only the person who ran the prompt can decide |
| Orbit says IT has not approved | Orbit is not deployed yet | Buy and deploy it on the console's Buy and deploy tab |

## Data

| Symptom | Cause | Fix |
| --- | --- | --- |
| Offline and live answers differ | Seed files out of date | `python3 data/generate_data.py`, then re-run `04_seed.sql` |
| `git diff` shows changes after regenerating | Someone edited a generated file by hand | Make the change in `generate_data.py` instead |

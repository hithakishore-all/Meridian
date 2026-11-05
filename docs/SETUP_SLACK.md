# Set up the Slack bot

The bot uses Socket Mode, so it needs no public URL: it connects out from your computer while Meridian runs. It works in offline mode and live mode. You need a Slack workspace where you can install apps (a free workspace you create is fine).

## 1. Create the app from the manifest

1. Go to https://api.slack.com/apps and choose **Create New App → From an app manifest**.
2. Pick your workspace.
3. Choose **YAML**, delete what is there, and paste the contents of `slack-manifest.yml` from this repo.
4. Choose **Next**, review the summary, then **Create**.

The manifest adds the `/meridian` command, the bot scopes `commands`, `chat:write`, `chat:write.public` and `app_mentions:read`, button handling (interactivity) and Socket Mode.

## 2. Install it to your workspace

In the app's settings, open **Install App** and choose **Install to Workspace**, then **Allow**.

## 3. Copy the bot token

On the same **Install App** page, copy the **Bot User OAuth Token**. It starts with `xoxb-`.

From the `meridian/app` folder, create `.env` if you have not (`cp .env.example .env`), open it in a text editor, and paste the token after `SLACK_BOT_TOKEN=`. Do not share it or commit it; `.env` is git-ignored.

## 4. Create the app-level token

1. Open **Basic Information → App-Level Tokens → Generate Token and Scopes**.
2. Name it `socket`, add the scope `connections:write`, and choose **Generate**.
3. Copy the token (it starts with `xapp-`) and paste it after `SLACK_APP_TOKEN=` in `.env`.

## 5. Check and start

```bash
npm run check      # confirms both tokens are present and have the right prefix
npm run offline    # or npm start for live mode
```

The terminal prints `Slack bot connected (Socket Mode)`. The bot only answers while this is running.

## 6. Try it

In any channel:

```
/meridian help
/meridian run conviction-memo
/meridian run conviction-export
```

The last one posts **Approve** and **Decline** buttons. Only you can press them; a teammate who tries gets a private refusal. To use mentions, invite the bot first (`/invite @Meridian`), then `@Meridian run credits-solve`.

GTM Orbit answers in Slack only after you buy and deploy it on the web console's **Buy and deploy** tab, which shows one policy applying to every surface.

## Turn the bot off

Run with `--no-slack`, or remove the two tokens from `.env`. To remove the app entirely, open its settings and choose **Basic Information → Delete App**.

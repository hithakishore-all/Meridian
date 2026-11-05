# Security

Meridian is a portfolio demo with fictional data. It is not meant to hold real customer data.

## How secrets are handled

- The app signs in to Snowflake with a key pair as a `TYPE = SERVICE` user. There is no password.
- The private key lives in `app/.keys/`; Slack tokens live in `app/.env`. Both are in `.gitignore`.
- `npm run check` only checks that a token is present and starts with the right prefix; it never prints it.
- The server listens on 127.0.0.1 unless you set `MERIDIAN_HOST`.

## If you find a problem

Please do not open a public issue for a security problem. Use GitHub's **Security → Report a vulnerability** on this repository, or contact the author through the profile on the repository page. Include what you found and how to reproduce it.

## If a secret leaks

1. Slack: in the app settings, revoke the token (**OAuth & Permissions → Revoke**, and delete the app-level token), then create new ones.
2. Snowflake: create a new key pair and run `ALTER USER MERIDIAN_SVC SET RSA_PUBLIC_KEY = '<new key>';`.
3. Remove the secret from git history before pushing again.

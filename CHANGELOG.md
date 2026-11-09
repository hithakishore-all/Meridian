# Changelog

## 1.1.0 (2026-11-09)

- New featured listing: Fieldwise (guided field-service resolution) at Northwind Field Service. It asks for the model before any steps, cites manual pages, rejects an uncited "works every time" claim, and its technician handoff waits for the person who asked.
- Fieldwise v1.0 added to the review queue.
- Smoke test covers the Fieldwise flow.
- Captioned walkthrough video of the clickable demo, with a recorder (`make video`) to re-make it.

## 1.0.0 (2026-11-04)

First release.

- Web console: catalog, buy and deploy, run an agent, approvals, review queue, health, audit log.
- Policy gateway: groups, tools, write approval, PII masking, spend cap, policy versions.
- Agent flow: Discover, Research, Compose, Validate; uncited claims rejected with up to 2 retries, then escalation; stale-data warnings; unknowns kept as unknown.
- Owner-only approvals that record actions without calling outside systems.
- Four working listings: GTM Orbit, Conviction AI, Credit Simulator, Readaroo; 15 sample listings.
- Slack bot with `/meridian`, mentions and Approve/Decline buttons (Socket Mode).
- Snowflake scripts with a governed view and a key-pair service user; offline mode with the same data.
- End-to-end smoke test.

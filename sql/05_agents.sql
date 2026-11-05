-- 05_agents.sql: optional live-model wording through Cortex.
-- The app ships scripted wording (MODEL = 'scripted'), because AI functions are blocked on Snowflake trial accounts.
-- On an account with Cortex enabled, run this file, then set MODEL to 'cortex':
--   UPDATE MERIDIAN.OPS.CONFIG SET CONFIG_VALUE = 'cortex' WHERE CONFIG_KEY = 'MODEL';
-- The validator still runs on every answer: the model may only reword claims, and each line must keep its evidence ID.

USE ROLE MERIDIAN_ADMIN;
USE WAREHOUSE MERIDIAN_WH;

CREATE OR REPLACE FUNCTION MERIDIAN.CORE.COMPOSE_ANSWER(QUESTION STRING, CLAIMS_JSON STRING)
RETURNS STRING
AS
$$
  AI_COMPLETE(
    'claude-sonnet-4-5',
    'You write short, plain answers for a business user. Use ONLY the claims below. '
    || 'Rewrite each claim as one bullet and end each bullet with its evidence ID in square brackets, exactly as given. '
    || 'Do not add facts. If a claim is marked unknown, say it is unknown.\n\nQuestion: ' || QUESTION
    || '\n\nClaims (JSON): ' || CLAIMS_JSON
  )
$$;

GRANT USAGE ON FUNCTION MERIDIAN.CORE.COMPOSE_ANSWER(STRING, STRING) TO ROLE MERIDIAN_APP;

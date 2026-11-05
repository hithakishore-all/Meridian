-- 07_reset.sql: put the demo back to its starting state without reloading the catalog.
-- Clears runs, approvals, calls and the audit log, and resets Orbit at Northwind Freight to "not purchased".
-- Run as MERIDIAN_ADMIN. Re-running 04_seed.sql also works, and restores everything else too.

USE ROLE MERIDIAN_ADMIN;
USE WAREHOUSE MERIDIAN_WH;

DELETE FROM MERIDIAN.OPS.RUNS;
DELETE FROM MERIDIAN.OPS.APPROVALS;
DELETE FROM MERIDIAN.OPS.CALLS;
DELETE FROM MERIDIAN.OPS.AUDIT;

UPDATE MERIDIAN.CORE.INSTALLS
SET STATUS = 'not_purchased', PLAN = NULL, PAY_VIA = NULL, APPROVED_BY = NULL, APPROVED_ON = NULL,
    POLICY_VERSION = 1, HUMAN_WRITE = 1, PII_MASK = 1, SPEND_CAP_USD = 2000
WHERE WORKSPACE_ID = 'nw-freight' AND LISTING_ID = 'orbit';

UPDATE MERIDIAN.CORE.TOOL_POLICIES SET ENABLED = IFF(TOOL_NAME = 'sync_to_crm', 0, 1)
WHERE WORKSPACE_ID = 'nw-freight' AND LISTING_ID = 'orbit';

UPDATE MERIDIAN.CORE.GROUP_POLICIES SET ENABLED = IFF(GROUP_NAME = 'Marketing', 0, 1)
WHERE WORKSPACE_ID = 'nw-freight' AND LISTING_ID = 'orbit';

UPDATE MERIDIAN.CORE.SUBMISSIONS SET STATUS = 'pending';

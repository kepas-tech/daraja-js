-- Proof-gathering: mine DISTINCT Daraja codes actually observed in production.
-- READ-ONLY. This is how the `kepas-db` proof tags in src/result-codes.ts are
-- substantiated — the `desc` column is Safaricom's own verbatim text.
--
-- Run against a kepas-pay (or compatible) Postgres, e.g.:
--   docker exec -i <db-container> psql -U <user> -d <db> -f - < tools/mine-daraja-codes.sql
--
-- Promote any NEW (scope, code, desc) into src/result-codes.ts by hand with a
-- proof tag. Do NOT copy counts/dates/table names into the published catalog.

\echo '== STK (async) =='
SELECT callback_payload->'Body'->'stkCallback'->>'ResultCode' AS code,
       callback_payload->'Body'->'stkCallback'->>'ResultDesc' AS desc
FROM transactions WHERE callback_payload->'Body' ? 'stkCallback'
GROUP BY 1,2 ORDER BY 1;

-- B2C / B2B / float / balance / status / reversal all use result_payload->'Result'
\echo '== B2C =='
SELECT result_payload->'Result'->>'ResultCode' code, result_payload->'Result'->>'ResultDesc' desc
FROM payouts WHERE result_payload ? 'Result' GROUP BY 1,2 ORDER BY 1;
\echo '== B2B =='
SELECT result_payload->'Result'->>'ResultCode' code, result_payload->'Result'->>'ResultDesc' desc
FROM b2b_payments WHERE result_payload ? 'Result' GROUP BY 1,2 ORDER BY 1;
\echo '== FLOAT (b2b) =='
SELECT result_payload->'Result'->>'ResultCode' code, result_payload->'Result'->>'ResultDesc' desc
FROM float_transfers WHERE result_payload ? 'Result' GROUP BY 1,2 ORDER BY 1;
\echo '== BALANCE =='
SELECT result_payload->'Result'->>'ResultCode' code, result_payload->'Result'->>'ResultDesc' desc
FROM balance_snapshots WHERE result_payload ? 'Result' GROUP BY 1,2 ORDER BY 1;
\echo '== STATUS =='
SELECT result_payload->'Result'->>'ResultCode' code, result_payload->'Result'->>'ResultDesc' desc
FROM status_queries WHERE result_payload ? 'Result' GROUP BY 1,2 ORDER BY 1;
\echo '== REVERSAL =='
SELECT result_payload->'Result'->>'ResultCode' code, result_payload->'Result'->>'ResultDesc' desc
FROM reversals WHERE result_payload ? 'Result' GROUP BY 1,2 ORDER BY 1;

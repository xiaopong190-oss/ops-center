export const followupHistoryCleanupSql = revision => `WITH
  latest AS MATERIALIZED (SELECT value FROM records WHERE key='_new-product-followup'
    AND json_extract(value,'$.revision')=${revision} AND json_extract(value,'$.storage')='followup-shards-v1'),
  selected AS MATERIALIZED (SELECT key,value FROM records WHERE key GLOB '_new-product-followup:history:*'
    AND json_valid(value) ORDER BY key LIMIT 20),
  protected AS MATERIALIZED (
    SELECT p.value AS key FROM latest, json_each(latest.value,'$.parts') p
    UNION
    SELECT p.value FROM records r JOIN json_each(CASE WHEN json_valid(r.value) THEN r.value ELSE '{}' END,'$.parts') p
    WHERE r.key GLOB '_new-product-followup:*'
      AND r.key NOT GLOB '_new-product-followup:version:*' AND r.key NOT GLOB '_new-product-followup:upload:*'
      AND r.key NOT IN (SELECT key FROM selected)
  ),
  removable AS MATERIALIZED (
    SELECT key FROM selected
    UNION
    SELECT p.value FROM selected s,json_each(s.value,'$.parts') p
    WHERE p.value GLOB '_new-product-followup:version:*' AND p.value NOT IN (SELECT key FROM protected WHERE key IS NOT NULL)
  )
  DELETE FROM records WHERE key IN (SELECT key FROM removable) AND EXISTS (SELECT 1 FROM latest)`;

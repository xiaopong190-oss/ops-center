# Free D1 read budget repair

On 2026-10-30 the production D1 API returned code 7500: the account had exhausted its daily free row-read budget. Query Insights attributed 5,290,821 reads across 2,326 executions to the public synchronization query using `substr(key,1,1) <> '_'` (average 2,274 reads). This scanned private upload rows on each normal synchronization. Session and key lookups were already indexed and much smaller.

The replacement uses two primary-key ranges (`key < '_'` and `key >= '`'`) combined with UNION ALL. These retain exactly the non-underscore namespace with SQLite's existing BINARY key collation. File access checks and response sanitization remain unchanged. The regression fixture compares both results over public boundary/Unicode keys and 3,000 internal shards, then checks both query-plan branches use the key index with no records-table scan.

Daily read/write exhaustion now returns a fixed 503 code, UTC reset time and Retry-After. The snapshot client preserves local storage, stops retrying that code, and displays the resource error rather than a network diagnosis. No quota bypass, public snapshot access, paid plan, account change or dataset migration is introduced. Exhausted quota cannot be restored by this change; new requests still await the provider's daily reset.

The signed read-only GitHub audit run 41071288213 succeeded against the existing encrypted snapshot on 2026-10-30. No publication occurred during this diagnosis. Rollback reverts the query and resource-error adapter; stored records and snapshots are untouched.

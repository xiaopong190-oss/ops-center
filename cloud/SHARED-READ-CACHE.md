# Shared synchronization read reuse

The v1.0.32 indexed query removes scans of private upload rows but still executes for each public synchronization. This change coalesces simultaneous reads and briefly reuses their results.

The server caches raw query rows in memory for 15 seconds per database binding and Worker isolate. Every caller still executes session validation and fileAccess filtering; no filtered response or credentials enter the shared cache. Successful config writes and public PATCH writes invalidate it. An already-running read cannot restore an invalidated slot. Errors are not cached. Other isolates can retain a prior read until the 15-second TTL expires, so this is bounded reuse rather than globally exactly-once reading.

The operations page coalesces all simultaneous gist reads and reuses them for five seconds, scoped to endpoint plus credential in page memory. Returned objects are cloned to prevent consumers mutating the shared result. Writes clear this cache before and after successful completion. Credential changes cannot reuse the old account result. No persistent credential cache, storage migration, public access expansion or paid service is introduced.

The existing standalone display already verifies metadata and reuses its validated session-bound local snapshot when the SHA is unchanged; it does not download the full snapshot on every reopen. This change addresses the separate operations-center synchronization query that exhausted D1 reads. A new computer still needs its first snapshot download, and permission checks must remain live. Cross-device and cross-isolate globally exactly-once reads are not promised.

Tests cover concurrent readers, repeated reads, TTL expiry, successful-write invalidation, failed-read retry, credential isolation, object cloning and the complete worker permission suite. Rollback removes the two cache adapters; stored data and snapshot formats are unchanged.

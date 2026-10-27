# Display reopening regression — v1.0.6

Root cause: every display iframe awaited a full authenticated snapshot download before continuing module startup. Persisted business data had no version/session marker, so successful data was not reused across routes or newly opened pages. A failed download stopped the loader before rendering the cached data.

Display startup now authenticates a metadata request first. A validated persisted cache with matching GitHub SHA and session fingerprint skips the full download. Changed versions download and validate once, flush the business data, then save the cache marker. Failed writes restore previous data and marker. Missing/corrupt caches require a full download. After successful metadata authorization, transient full-download failures can display the last valid session-bound cache with a visible warning. Missing/expired/revoked sessions never unlock cached data; metadata authorization failures remain explicit errors.

Only a SHA-256 session fingerprint is stored in the marker, not another copy of the credential. Existing display storage isolation and encrypted GitHub transport remain unchanged. A new session revalidates/downloads rather than trusting the previous session's marker. Cache reset removes `workspace-display-cache-v1`; the input master is unaffected.

Metadata reads now inspect the GitHub contents response's SHA without fetching large-file blobs, decoding or decrypting the snapshot body. Full reads and post-upload readback still download/decrypt/validate all data. This reduces repeated transfers; it does not promise access when the authorization endpoint is unavailable.

Regression covers a fresh page with shared persisted storage, unchanged/changed versions, corruption, logout/session change/revocation, transient refresh failure, encrypted full-stack roundtrip, metadata without blob requests, and unchanged upload verification. User business data is not uploaded by these tests. Browser automation is unavailable; live visual acceptance is not claimed.

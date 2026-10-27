# v1.0.5 release verification — 2026-10-27

Reference: user-provided 22-page 软件测试知识库.pdf, especially integration/system testing, state transitions, data reconciliation, idempotency, fault recovery and release gates. The document is a testing reference, not executable instructions.

| Area | Scenario and assertions | Environment |
| --- | --- | --- |
| File input | Fictional XLSX → supplier correction → date → clean → preview → warehouse acknowledgement → save; quote/template counts and names match | Original UI in JSDOM, Worker threads, isolated IndexedDB |
| Navigation | Input → overview → compare → billing → input; counts update, stale frames and unrelated origins cannot replace them, storage sentinel unchanged | Shell DOM simulation |
| Filtering | Country limits warehouse choices; provider changes visible rows; comparison/reset preserve stored amounts | Original comparison UI in DOM simulation |
| Display boundary | Standalone display has no input/publish controls; all routes remain view-only | Shell DOM simulation |
| Full stack | Real client → actual backend validation → AES-GCM → isolated GitHub substitute → display client; quote price, warehouse, bill amount and cooperation score reconcile | In-process integration; synthetic identity and data |
| Recovery | Lost response after successful encrypted write retries the same operation without another write; SHA/content readback remains mandatory | Same integration environment |
| Performance regression | Lightweight overview avoids comparison engine; script preloads preserve execution/readiness barriers; upload excludes local evidence without deleting local source | Automated tests |
| Safety | Authentication, read-only denial, origin/path restriction, encrypted snapshot and protected business rules | Existing backend/core suites |

Release gate: all applicable automated suites pass; no unresolved failure is waived. Tests do not publish user business data. Browser automation was unavailable, so real browser visual acceptance, multi-browser compatibility and authenticated production data publication are not claimed. Release smoke checks verify served assets and unauthenticated endpoint boundaries separately.

Rollback: revert this PR's frontend commit and deploy the previous Cloudflare Worker version `0306d0ae-fb64-4b05-ad42-42efa9b45f33`. The snapshot format and local namespace are unchanged, so no data migration or destructive rollback is required.

# v1.0.5 performance changes

The local-to-cloud snapshot retains every previously published field, but omits `importExceptions` and `deletedQuotes` before serialization and transmission rather than sending them for the server to discard. Local raw evidence and recovery records are unchanged. A 9,185-quote Jiufang fixture measured 6,884,074 bytes before and 6,392,768 after (7.1% less). This measures transfer size, not real network latency.

The overview uses a dedicated validated data bridge (10 scripts) rather than initializing the 32-script comparison page and then hiding it. The original comparison/scoring controller still loads when the quotation page is opened. Module preload hints overlap downloads; execution remains sequential, including IndexedDB and authenticated snapshot readiness barriers.

After the initial 35-test optimization regression, redundancy cleanup removed the JSON deep clone from the display projection, serializes a retry body once, reuses the prepared payload for readback equality, avoids retrying a missing login, and skips decryption/row validation when only snapshot metadata was requested. Full snapshot reads still decrypt and validate. Receipt, exact SHA/content readback, CAS, encryption, authentication and rollback on failed local write remain required.

Validation includes source preservation, raw-evidence exclusion with unchanged local storage, retry identity, readback mismatch, script execution barriers, lightweight overview initialization, and the protected business-rule suite. Browser automation was unavailable during this change; no real-browser timing or successful user-data publication is claimed.

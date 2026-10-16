# GPS running — preview and device checks

Branch: `gps-run`. App cache: `train-today-v56`.

## Behavior and data

- Run → GPS: start, pause, resume, finish. Finish attempts to save a normal run; a failed save leaves an explicit pending result with Retry and Export actions. A run with no accepted distance is never saved automatically.
- Active time uses a monotonic clock. Hiding the app pauses tracking. A timer suspension longer than 15 seconds pauses at the last heartbeat. Resume always starts a new route segment.
- Invalid coordinates, accuracy worse than 30 m, stale/non-increasing timestamps and speeds above 7 m/s are rejected. Gaps longer than 15 seconds start a disconnected segment. Current pace averages approximately 30 seconds and becomes unavailable after 10 seconds without a valid fix.
- Each completed kilometre is marked once. Vibration uses the existing opt-in and explanation; it is never enabled implicitly. No notification permission is requested.
- Screen Wake Lock is requested only while active and visible, released on pause/finish, and requested again on resume or when visible while still active. Failure leaves a clear screen-on reminder.
- Pending runs use a separate localStorage key, `kryvos-gps-run-v1`, checkpointed approximately every 5 seconds. Recovery is paused and requires an explicit Resume/Finish/Save. Abrupt process termination can lose the interval since the last successful checkpoint; storage failures show a warning to keep the app open and export the finished result.
- Web Locks prevents simultaneous active tracking in supporting browsers. A local draft ownership lease and storage events provide fallback coordination. A crashed tab's lease expires after about 15 seconds.
- Lease expiry only allows recovery of the latest stored snapshot. An older in-memory session cannot checkpoint, save or clear a different owner's draft. Recovery can retry after a storage error only while the snapshot it read is unchanged. Deleting the draft from another tab stops tracking, cancels pending lock acquisition and clears the in-memory session so locations cannot be recreated.
- Normal runs keep `ts`, `km`, `min`, optional `t`. GPS adds `gpsId` for save deduplication and optional `route`, an array of disconnected arrays of `[latitude, longitude]`. Coordinates round to 5 decimals and total points are capped at 1,500. Simplification retains segment endpoints and samples intermediate points; it is an overview, not a precise navigation record.
- If there are more than 750 nonempty segments, simplification drops the oldest segments and keeps the active tail. It never appends current points to an older disconnected segment; the total measured distance is unchanged.
- Routes and pending positions remain in localStorage and user-downloaded backups. AI weekly summaries contain aggregate running counts/distance only. No coordinates are sent to AI, analytics, logs, or maps. The new `run_gps` analytics call contains only the event name and occurs after a successful save.
- Old runs/backups and shoe mileage keep working. Malformed route points are removed without dropping an otherwise valid run; invalid points break the segment instead of connecting unknown locations.

## Verified in this workspace

- Node tests execute the app's real functions with synthetic GPS positions, clocks, storage errors, wake locks and Web Locks. They cover distance, filtering, pace, pause/resume, splits, route limits, cleanup, interruptions, failed saves/retries, deduplication, imports and old data.
- Chrome flows use **mocked geolocation and wake locks**, including permission explanation, denial/timeout/unavailable messages, manual fallback, pending backup download, quota retry, reload recovery and local-only route handling.
- Layout checks: 320/360/375/430 px, light/dark, Thai/English, reduced motion, keyboard controls and no horizontal overflow. Screenshots stay in `%TEMP%\kryvos-gps-run`.
- Offline test loads the actual cached v56 app shell, runs mocked GPS and saves locally without a network connection. This does not verify a phone's ability to obtain a satellite fix offline.

## Real-phone checks still required

Use an HTTPS preview (or localhost through USB debugging/port forwarding); a plain LAN HTTP URL does not provide the secure context needed by GPS/Wake Lock. No preview has been published or deployed by this task.

1. Open Run, start GPS, review the KRYVOS explanation and allow location. Test both Thai and English and confirm the permissions card reflects the browser's actual status.
2. Outdoors, keep the app visible and screen on. Run a known route for at least 1 km. Compare distance, active time, current/average pace and the once-per-kilometre vibration with the setting enabled, then disabled.
3. Pause, move to another location, then resume. Paused time/movement must not count and the SVG must show separate segments.
4. Hide the app or lock the screen. Return and confirm it is paused and waits for Resume. Check screen wake lock/battery restrictions on the actual Android/iOS browser; background tracking is not supported.
5. Deny location, disable the phone's location services, and try a poor-signal area. Confirm useful messages and the manual-run fallback. Restore permission in browser/site and phone settings and retry.
6. Finish once, verify one history record and shoe mileage, then export/import a backup containing its route. Try an older backup too. For pending runs, reload and verify there is no automatic restart/save.
7. Load the app online once, then test airplane mode outdoors. Cached UI should load; actual offline GPS acquisition depends on the device. Review a saved route without contacting a map service.

Physical GPS, real wake-lock/vibration behavior and battery use have **not** been verified. The separate real-phone machine-scan failure remains pending and unchanged.

## Worker

`proxy/worker.js` changes only to allow `run_gps`; `stats.html` adds its label. The owner must manually redeploy the worker later. This task does not deploy it.

## API references checked

- [Geolocation watchPosition — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/watchPosition)
- [Geolocation timestamp — MDN](https://developer.mozilla.org/en-US/docs/Web/API/GeolocationPosition/timestamp)
- [Screen Wake Lock — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API)

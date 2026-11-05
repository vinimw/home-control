# Alexa and TV investigation follow-up

Related: issue #58 and merged PR #59. This document is a reviewable investigation plan, not evidence that
TV control or Alexa recovery has been completed.

## Confirmed findings

- During the first captured window (2026-11-04, 22:31–22:35 America/Sao_Paulo), the backend sent six
  commands to the Samsung TV and no Alexa text commands. Each command correlated with one HA REST
  attempt. This does not establish Amazon's internal request count.
- Two `media_player.play_media` attempts returned HA HTTP 500 after about six seconds. Three
  `media_player.turn_on` calls returned HA HTTP 200 but only application-level `accepted`, without
  device-state confirmation. One `remote.send_command` returned HA HTTP 200.
- HA's Samsung integration separately recorded a timeout sending `KEY_POWER`. This is useful evidence,
  but does not by itself establish the cause of the two playback errors or their exact correlation.
- The web container healthcheck rendered `/` every ten seconds without a user session. The initial page
  requested protected `/ha/status`, generating repeated local HTTP 401 responses. Those requests were
  rejected before reaching HA; they were not Alexa/Amazon requests.
- Commit `6ab1997` changed the healthcheck to local `/api/health`. Three explicit liveness requests and
  two further automatic healthcheck intervals produced no new failed status reads (45 before / 45 after).
  Check the deployed main branch includes this commit; if not, carry it into the follow-up PR.
- Alexa Devices had returned `Too Many Requests`. Its integration was disabled and automatic polling
  disabled to stop retries. Device configuration and credentials were preserved.

## Investigation and verification checklist

- [ ] Confirm deployed revision, healthy containers and `/api/health` independent of auth/API/provider.
- [ ] Observe several healthcheck intervals: no new periodic unauthenticated `/ha/status` requests.
- [ ] For TV failures, retain exact operation ids, source timestamps/timezone, target entity, HA HTTP
      status, duration and safe requested action. Correlate against HA Samsung logs by time and target;
      do not assume the power timeout explains playback failure.
- [ ] Inspect Samsung integration/library versions, entity capabilities, current availability and
      app-launch mapping. Verify whether `play_media` with app content type/id is supported by this
      integration/model, and whether aliases/app ids match the TV's available apps.
- [ ] Check network reachability, pairing/permissions, remote entity binding and standby power-on
      behavior. Do not remove/re-pair devices or change credentials as an initial diagnostic step.
- [ ] Before any controlled TV command test, specify the intended action and expected observable result.
      Avoid repeated power/app commands and automatic retries; retain accepted vs confirmed semantics.
- [ ] Verify diagnostics still record one transport attempt per actual dispatch, preserve timeouts,
      distinguish local reads and WS heartbeats, and do not log free-form text or credentials.
- [ ] Document root cause when demonstrated, any code/config correction, regression validation and
      remaining uncertainties. Do not mark this investigation finished merely because the plan is merged.

## Final step: reconnect Alexa to Home Control

The user explicitly authorized reactivating Alexa **when this investigation task is finished**. This is
conditional authorization, not an instruction to reactivate while writing this plan or merging it.

- [ ] Finish and review the investigation/corrections above; verify diagnostics and deployment first.
- [ ] Read current Alexa integration state and recent rate-limit evidence without issuing cloud test
      commands. Do not assume elapsed time alone proves Amazon has lifted the limit.
- [ ] Enable the existing Alexa Devices entry once, preserving credentials and saved device identities.
      Keep automatic polling disabled initially; this avoids immediately restoring periodic cloud polling.
      Enabling the entry can itself generate startup cloud calls, so capture timing and HA error evidence.
- [ ] Verify the integration loads, Home Control receives fresh device states and availability, and
      application logs remain bounded. HA-internal startup calls remain outside first-delivery counters.
- [ ] If necessary, perform one documented benign command (for example querying the time, not changing
      power/volume) and check dispatch and acceptance separately from actual device response. Do not claim
      success from HA HTTP 200 alone.
- [ ] If rate limiting or authentication failure persists, stop, leave the integration paused again and
      report the result. Do not loop reload/login/retry or promise a provider unblock time.
- [ ] Only establish a longer polling interval in a separate explicit configuration decision, after
      validating effects on sensors and event-driven playback/volume. Do not silently restore five-minute
      polling as part of reactivation.
- [ ] Report the final observed integration/device state, controlled-test evidence and polling setting.

No actual TV/Alexa recovery commands were sent while preparing this follow-up. Alexa remains paused.

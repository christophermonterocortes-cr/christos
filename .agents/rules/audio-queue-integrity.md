---
trigger: model_decision
description: Enforces single-source-of-truth audio playback and prevents queue desynchronization.
---
# Audio Playback & Queue Authority

1. Single Source of Truth: All audio playback triggers (clicks, spotlight search, track ended, next/prev) MUST call `Player.playTrack(track)`.
2. Audio Element Binding: Never swap `activeAudio` and `inactiveAudio` without explicitly setting `this.activeAudio.src = streamUrl`.
3. Inactive Audio Silence: When playing `activeAudio`, `inactiveAudio` must be paused and reset to `currentTime = 0`.
4. Non-Destructive Preloading: Preloading future tracks must use `<link rel="prefetch">` DOM elements or cached fetches, never secondary media element play calls that collide with Web Audio routing.
5. Ramp Interval Cleanup: Always clear `this.fadeRampInterval` before starting new volume fade animations.

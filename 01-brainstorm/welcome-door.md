# Welcome (first visit only) — "خبّط على الباب"
Design: 02-design/canvas/WelcomeDoor.dc.html (read markup + JS for timings).
Flow: closed door (party light under door, muffled bubbles, notes) > knock 3 times by tapping the door OR the "خبّط" button (door shakes, "طُق!", replies مين؟ / مين بيخبّط؟ / أيوه جاي!) > door opens immediately on the 3rd knock > ~1.6s later camera push-in through the doorway (scale + blur + fade) into scene 1 table > scene 2 game cards fan (each card lifts in turn with its name/description) > scene 3 group chat (invite by code). Story bars on top, tap to go next, "تخطّي التعريف" always visible, CTA "يلا · اعمل شخصيتك" fixed at bottom.
Anti-glitch rules (must):
- One state machine (phase + settled). Only the active scene and the one leaving are mounted; the leaving one unmounts ~1s after the switch.
- Ignore taps/next while a transition runs (settled=false). Ignore knocks after the 3rd.
- Clear all timers on skip, unmount and route change. Never schedule two phase changes for the same moment.
- Exit runs first (fast fade), enter starts after it (~0.4s delay) so two scenes are never readable at once.
- Use transform/opacity/filter only (GPU), no layout animation. Respect prefers-reduced-motion: no zoom/blur, simple fades.
- Invite-link visitors skip this page entirely. Shown once (localStorage flag), then straight to Home.
- Sounds: knock x3, door creak on open, crowd cheer muffled > clear on push-in, soft whoosh per scene.

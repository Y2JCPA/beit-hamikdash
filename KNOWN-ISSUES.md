# Known Issues — V2

## Fixed in V2 (from V1)
- [x] Direction keys inverted → Rewrote camera-relative movement math
- [x] Can't walk up Kevesh → Built step ramp + getGroundHeight() system
- [x] Wrong animal = stuck → Added sell-back at 50% price
- [x] Azara too small → Expanded from 38×38 to 66×66 units
- [x] Lag → Disabled antialias, optimized meshes
- [x] Stacked animate loops → cancelAnimationFrame before new loop
- [x] Leg animation broken → Fixed scope (now uses elapsedTime)
- [x] Korban select only first animal → Shows ALL available korbanot
- [x] No guidance → Welcome sign + toast + first-avodah guidance
- [x] NPCs static → Idle animations (bob, sway)
- [x] No collision → AABB collision system (walls, mizbeach, ulam)
- [x] No sell-back → Sell section in shop at 50% price

## Needs Testing (may still have issues)
- [ ] Movement direction — math rewritten, needs user confirmation
- [ ] Ramp walking — step-based, needs testing on mobile
- [ ] Korban flow end-to-end — buy → walk north → shechita → kabbalah → holacha → zerika → haktarah

## Minor / Polish
- [ ] Fire effect could be better (still basic boxes)
- [ ] No sound effects beyond instruments  
- [ ] Missing favicon
- [ ] Camera could be smoother (lerp)
- [ ] No particle effects for blood service / burning

## Future (V3+)
- [ ] Menachot system (Level 2 mechanic)
- [ ] Heichal interior
- [ ] Kohen Gadol mode (Level 3-4)
- [ ] More NPCs (Yisraelim with animals)
- [ ] Day/night cycle tied to Tamid schedule
- [ ] Glowing waypoints for Level 1 guided mode

*Updated: Feb 26, 2026 — V2*

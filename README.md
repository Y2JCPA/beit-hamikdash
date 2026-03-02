# 🏛️ Avodah — Beit HaMikdash Simulator

An educational 3D game where you serve as a Kohen in the Beit HaMikdash. Learn about Korbanot, the Avodah, and Levitical music — all sourced from Torah, Mishnah, and Gemara.

## 🎮 Play
Coming soon at: https://y2jcpa.github.io/beit-hamikdash/

## 📖 About
- Walk the Azara, bring Korbanot on the Mizbeach, hear the Leviim play
- Progressive difficulty: from guided Tamid to full Yom Kippur Avodah
- Every action teaches real halacha with sources (Vayikra, Zevachim, Menachot, Tamid, Middot)
- Built for kids ages 3-16

## 🛠️ Tech
- Vanilla HTML/CSS/JS + Three.js
- Blocky Minecraft aesthetic
- Mobile + desktop
- No frameworks, no dependencies

## ⚡ Performance & Gameplay improvements
- Added scene teardown/disposal between runs to prevent renderer/mesh/material leaks
- Optimized particle system: capped active particles, pooled particle meshes, removed per-frame vector cloning
- Reduced frame-time overhead: throttled HUD/label DOM updates, avoided per-frame world-label allocations, replaced hot distance checks with squared-distance math
- Hardened input handling: key repeat guard on interact, prevented browser scroll/input conflicts for movement keys
- Gameplay polish: `Kavanah Streak` bonus for chaining Avodah steps quickly
- Gameplay polish: `Taharah Focus` buff from the Kiyor (+10% coin rewards for 45s)
- Added sprint movement with `Shift` for smoother traversal in the larger Azara

## 📚 Sources
- Vayikra 1-7 (Laws of Korbanot)
- Mishnah Zevachim Ch. 5 (Eizehu Mekoman)
- Mishnah Menachot Ch. 5 (Meal offerings)
- Mishnah Tamid (Daily Avodah)
- Mishnah Middot (Mikdash layout)
- Rambam, Hilchot Ma'aseh HaKorbanot

---
*By Y2JCPA*

# Landing Page V2 — Background Video Prompt

The hero video at `public/bg-video-desk.mp4` (referenced in `src/app/landing-v2/page.tsx`) is a Studio Ghibli–style cinemagraph: three young writers, seen from behind, hunched over warmly glowing laptops in a wildflower meadow, walled in by towering stacks of books, under an enormous starry sky. The motion is subtle and loopable — designed to play behind text without competing with it.

Below are prompts tuned for the major text-to-video models. Use the variant that matches your tool, or adapt freely.

---

## Master prompt (Veo 3 / Sora / Kling 1.6+ / Runway Gen-3)

> **Style:** Studio Ghibli hand-drawn 2D animation, painterly cel-shading in the lineage of *Whisper of the Heart* and *From Up on Poppy Hill*; soft gouache textures, gentle linework, no photorealism, no 3D rendering, no anime gloss.
>
> **Scene:** A wide cinematic shot, slightly low angle. Three young people — late teens, casually dressed — sit on the ground in a wildflower meadow at night, seen from behind. Each is hunched over an open laptop resting in their lap or on a low surface; the screens emit a warm honey-gold glow that lights their faces and shoulders from below. The center figure is closest to camera; the two flanking figures are smaller, set deeper into the field. They are quietly absorbed in writing.
>
> **Setting:** The meadow is dense with cosmos and marigold blossoms in saffron, ochre, and burnt orange, swaying gently. On the far left and far right of the frame, stacks of hardcover books rise like columns or canyon walls — uneven, taller than the figures, leaning slightly, weathered cloth and leather bindings catching faint warm light. Above and behind the figures, the meadow opens to a colossal indigo-navy night sky filled with thousands of pin-sharp stars and softly visible constellations. A faint Milky Way smear cuts across the upper third.
>
> **Lighting:** Two competing temperatures. Warm 2700K laptop glow on the figures and the flowers immediately around them; cool deep-blue ambient starlight everywhere else. A subtle rim of warm light catches the edges of the book stacks. No moon. No artificial environmental light beyond the laptops.
>
> **Motion (loopable, ~6–10 seconds):** Almost still. Wildflowers and tall grass sway gently in a low breeze. Hair on the figures lifts slightly. The laptop screens flicker imperceptibly with the warmth of typing. A few stars twinkle. One or two fireflies drift slowly across the lower foreground. The camera performs a very slow, almost imperceptible push-in (or alternately a slow tilt up toward the sky). No cuts. No characters turning around. No dialogue. No text on screens.
>
> **Color palette:** Indigo, midnight blue, deep teal sky; saffron, marigold, burnt orange flowers; warm gold laptop glow; muted earth tones on book spines.
>
> **Mood:** Peaceful, contemplative, romantic, hopeful — the quiet joy of writing under a vast sky. Cinematic, intimate, dreamlike.
>
> **Composition:** 16:9. Center figure at lower-third center. Book stacks frame the left and right edges as natural vignette. Sky occupies the upper two-thirds. Negative space above the figures so on-screen UI text can sit cleanly.
>
> **Avoid:** photorealism, 3D CGI look, anime "moe" facial close-ups, visible faces, readable laptop screen content, modern logos, lens flares, harsh contrast, fast camera moves, cuts, text overlays, watermarks, distorted hands.

---

## Short variant (Pika, Luma Dream Machine, Hailuo, ≤ 512 chars)

> Studio Ghibli hand-drawn 2D animation. Wide low-angle shot at night: three young writers seen from behind, sitting in a wildflower meadow of orange cosmos, hunched over laptops glowing warm gold. Towering stacks of old books frame the left and right edges like canyon walls. Vast indigo starry sky and faint Milky Way fill the upper two-thirds. Gentle breeze sways the flowers; very slow camera push-in. Painterly, peaceful, dreamlike. No faces shown, no text on screens.

---

## Image-to-video variant (when seeding from `public/bg-poster.jpg`)

> Animate this Ghibli-style still as a slow, loopable cinemagraph. Wildflowers and grass sway gently in a low breeze. Hair on the three figures lifts slightly. Laptop screens flicker almost imperceptibly with a warm typing glow. A few distant stars twinkle. One or two fireflies drift slowly across the lower foreground from left to right. Camera performs a very slow, near-imperceptible push-in. Keep all characters facing away — no head turns. No cuts. 8 seconds, seamless loop.

---

## Negative prompt (when supported)

> photorealistic, 3D render, CGI, live-action, anime close-up, visible faces, readable screen text, modern logos, brand names, lens flare, motion blur, fast pan, whip-zoom, hard cuts, text overlays, watermark, subtitles, deformed hands, extra fingers, low resolution, jpeg artifacts.

---

## Production notes for the landing page

- Target length: **6–10 s seamless loop** so it can `loop muted autoplay` cleanly behind the hero text.
- Export **two crops**: a desktop 16:9 master (`bg-video-desk.mp4`) and a 9:16 mobile reframe (`bg-video.mp4` / `bg-video.webm`) where the center figure sits in the lower third and the book stacks are cropped tight.
- Keep the **upper-left quadrant calm and slightly darker** — that is where the headline ("There's an author inside you.") sits.
- Render a high-quality first frame as `bg-poster.jpg` for the `poster` fallback and reduced-motion users (see the `prefers-reduced-motion` block in `src/app/landing-v2/page.tsx:433`).
- Encode H.264 high profile, ~3–5 Mbps for desktop, plus a VP9 `.webm` at ~1 Mbps for the mobile fallback already wired up in the repo.

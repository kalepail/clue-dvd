Reveal Card Tuning Notes

Purpose
- This note documents the solved-screen flip card (reveal) sizing and layout adjustments so future tweaks are fast and consistent.

Where This Lives
- Styles are in `src/client/styles.css` under "SOLUTION REVEAL CARDS - Win Screen".
- Markup is in `src/client/pages/GamePage.tsx` (the `RevealCard` front/back faces).

Key Controls (current values)
- Card box ratio: `--reveal-card-aspect-ratio` in `src/client/styles.css` (currently `0.76`).
- Reveal text size (front):
  - `.reveal-card-label` is `text-lg`.
  - `.reveal-card-hint` is `text-base`.
  - Divider line uses `.reveal-card-divider` width 66%.
- Reveal text size (back):
  - `.reveal-card-back .reveal-card-label` is `text-sm` to give the image more space.
- Image sizing inside the revealed card:
  - `.reveal-card-media` is the container, full width with the standard card aspect ratio.
  - `.reveal-card-image` uses `object-cover` with `width: 77%` and `height: auto`.
    This keeps rounded corners visible and avoids the “zoomed/cropped” look.

What Was Adjusted Most Recently
- Increased the front text and hint sizes ~10% and widened the divider line.
- Increased the revealed image footprint to 77% width while keeping the card size/ratio unchanged.

How To Adjust Later
- If the front text feels too large/small:
  - Tweak `.reveal-card-label` and `.reveal-card-hint` sizes.
- If the revealed image shows too little or too much:
  - Adjust `.reveal-card-image` width (currently 77%).
- If the card box feels too tall/short:
  - Change `--reveal-card-aspect-ratio`.


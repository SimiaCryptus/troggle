# Troggle — Developer Notes

Tridimensional Boggle: word search on a cube of letter cubes.

## Navigation

- The top bar includes a home icon (🏠) linking back to `/`, the site index,
  so players can return to the games hub without using the browser back
  button.

## Structure

- `index.html` — app shell: top bar (home link, timer, title, score, menu),
  3D stage (`#board` canvas rendered with three.js), word bar (chip/word
  input, submit/clear/mic controls), found-words drawer, toasts, and two
  `<dialog>` sheets (`#lobby` for setup, `#results` for end-of-round stats).
- `css/style.css` — dark, rounded UI theme; grid layout with topbar / stage /
  wordbar / found sections; overlays for loading & countdown; responsive
  tweaks at `min-width: 720px`.
- `js/main.js` — application entry point (game logic, three.js scene setup,
  input handling, scoring).

## Conventions

- Uses CSS custom properties defined on `:root` for theming (`--bg`, `--fg`,
  `--accent`, etc.).
- Respects `prefers-reduced-motion` and exposes a manual "Reduce motion"
  toggle in the lobby dialog.
- Accessible live regions (`#announcer`, `#sr-board`) mirror visual state for
  screen readers.
- Import map pins `three` to a pinned CDN version (currently `0.166.1`).

## Follow-ups

- If additional top-bar icon buttons are added, keep consistent sizing with
  `.icon-btn` (34px min-height) and ensure `aria-label`/`title` pairs stay in
  sync.

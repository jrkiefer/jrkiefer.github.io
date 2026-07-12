# Dough Tracker

Mobile-first dough planner for Hot Tomato Pizzeria, served by GitHub Pages
(no build step) and opened by QR code on a kitchen phone. Sales numbers and
dough counts go in; tonight's use, tomorrow's need, and the batch count come
out. Everything saves as you type — to the phone first, then to a Google
Sheet in the background.

- **Docs**: [CLAUDE.md](CLAUDE.md) (project context and data-layer contract) · [MASTERPLAN.md](MASTERPLAN.md) (the v2 build plan)
- **Develop**: `npm ci`, then `npm test` (Node's built-in runner, zero deps) and `npm run lint`
- **Backend**: `apps-script/Code.gs`, deployed manually into the Google Apps Script editor (see CLAUDE.md)
- **`/v1/`**: frozen snapshot of the pre-rebuild site, kept as a fallback through cutover — never edit

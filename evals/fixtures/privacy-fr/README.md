# privacy-fr (French audience measurement without a banner)

French site, technically clean (no `check-site` error). Planted defects, mostly legal:

- Microsoft Clarity is loaded on every page with no consent step (TRACKER-001).
- `assets/visite.js` writes a visit identifier into `sessionStorage` (TRACKER-001; Web Storage treated as a tracker under article 82, cautious reading).
- `/confidentialite/` claims "Ce site n'utilise aucun traceur" and names no processor and no retention period.
- No opt-out link for the audience measurement.
- `/mentions-legales/` names no publication director and no hosting provider (LCEN article 1-1).

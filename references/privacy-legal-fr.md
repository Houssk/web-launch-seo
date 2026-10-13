# France: audience measurement, privacy page, legal notice

Load for a site aimed at visitors in France (or the EU) when adding or reviewing audience measurement, a session tool, a form, a privacy page or the legal notice, and before publishing high-stakes content. The legal terms are French; quote them as they are.

## Contents

- Scope of article 82
- Exemption for audience measurement
- Opt-out
- GDPR still applies
- Common tools
- Keeping measurement without a banner
- Privacy page: what it must say
- Legal notice (LCEN)
- Risk register
- High-stakes content
- Say in the report

## Scope of article 82

- Article 82 of the loi Informatique et Libertés covers any reading or writing on the visitor's device. The CNIL guidelines name HTTP cookies, HTML5 "local storage", fingerprinting and system identifiers (deliberation 2020-091, paragraph 13). Source: https://www.cnil.fr/sites/cnil/files/atoms/files/lignes_directrices_de_la_cnil_sur_les_cookies_et_autres_traceurs.pdf (read 2026-10-12)
- Article 82 applies whether or not the information is personal data (CNIL FAQ, Q8). Source: https://www.cnil.fr/fr/cookies-et-autres-traceurs/regles/cookies/FAQ (read 2026-10-12)
- `sessionStorage` is not named by the CNIL. It belongs to the same Web Storage API as `localStorage`, and article 82 covers any writing on the device: treating it as a tracker is an interpretation, a cautious one. Write it as such, never as a CNIL statement.
- So "no cookie" does not mean "no tracker": a visit identifier in `localStorage` is a tracker, and one in `sessionStorage` should be handled as one (same interpretation).

## Exemption for audience measurement

A measurement tracker is exempt from consent only if **all** conditions hold: purpose strictly limited to measuring the site's audience for the publisher alone; anonymous statistics only; no global tracking of navigation across sites; no cross-matching with other processing; no transfer to third parties. The controller must be able to demonstrate these guarantees. Sources: https://www.cnil.fr/sites/cnil/files/atoms/files/lignes_directrices_de_la_cnil_sur_les_cookies_et_autres_traceurs.pdf (read 2026-10-12, paragraph 51) and Source: https://www.cnil.fr/fr/cookies-et-autres-traceurs/regles/cookies/FAQ (read 2026-10-12, Q9)

CNIL recommendations for exempt measurement: trackers living about 13 months without extension, data kept 25 months at most, information of the visitors. Source: https://www.cnil.fr/fr/cookies-et-autres-traceurs/regles/cookies-solutions-pour-les-outils-de-mesure-daudience (read 2026-10-12)

## Opt-out

- Even exempt, measurement based on legitimate interest needs an "easily accessible" opt-out mechanism (FAQ, Q10). Source: https://www.cnil.fr/fr/cookies-et-autres-traceurs/regles/cookies/FAQ (read 2026-10-12)
- The tracker that stores the visitor's choice is itself exempt. Source: https://www.cnil.fr/fr/cookies-et-autres-traceurs/regles/cookies/que-dit-la-loi (read 2026-10-12)
- Pattern: a link « Ne pas être mesuré » (« Vous pouvez vous opposer à la mesure d'audience ») on the privacy page that stores a local preference, read **before** the measurement script starts.

```html
<p>Vous pouvez vous opposer à la mesure d'audience de ce site :
  <a href="#" id="optout">ne pas être mesuré</a>.</p>
```

```js
// before any measurement code (in a file, allowed by the CSP)
const OPT_OUT = 'measure-opt-out';
document.getElementById('optout')?.addEventListener('click', (e) => { e.preventDefault(); localStorage.setItem(OPT_OUT, '1'); });
if (localStorage.getItem(OPT_OUT) !== '1') startMeasurement();
```

## GDPR still applies

Measurement processing remains subject to the GDPR (guidelines, paragraph 52). Source: https://www.cnil.fr/sites/cnil/files/atoms/files/lignes_directrices_de_la_cnil_sur_les_cookies_et_autres_traceurs.pdf (read 2026-10-12)

The information given to visitors includes "les destinataires ou les catégories de destinataires" (article 13.1.e: processors, sous-traitants, and their location) and "la durée de conservation" of the data, or the criteria used to set it (article 13.2.a), with the legal basis and any transfer outside the EU. Source: https://www.cnil.fr/fr/reglement-europeen-protection-donnees/chapitre3#Article13 (read 2026-10-12)

## Common tools

- **Cloudflare Web Analytics** "does not use any client-side state, such as cookies or localStorage": outside article 82, but the GDPR still applies to the server-side processing (Recommendation (unsourced) for that reading). Source: https://www.cloudflare.com/web-analytics/ (read 2026-10-12)
- **Microsoft Clarity** sets cookies; since 2025-10-31 Clarity requires a valid consent signal for visits from the EEA, the UK and Switzerland; without consent, no cookie and limited features. So: behind prior consent, or no Clarity. A site that wants no banner removes Clarity. Source: https://learn.microsoft.com/en-us/clarity/setup-and-installation/consent-management (read 2026-10-12)
- Session recording is never exempt: consent first. Recommendation (unsourced).
- A measurement relay served by the site (`/ingest/*`): its duties (cookies, methods, headers, IP address) are in the security headers reference.

## Keeping measurement without a banner

When the owner wants to keep audience measurement without a consent banner, do not delete the measurement: make it fit the exemption, and leave the final legal call to the owner. Recommendation (unsourced), built on the rules above.

1. Remove what cannot be exempt: session recording, heatmaps and cookie-based third-party tools (Clarity, an analytics tag that shares data with its vendor).
2. Keep the first-party measurement (or an exempt-configured tool); limit it to anonymous statistics for the publisher alone, avoid persistent identifiers where possible, and note what it stores on the device.
3. Add the opt-out now, on the privacy page: a link « ne pas être mesuré » with a sentence such as « Vous pouvez vous opposer à la mesure d'audience », and make the measurement script read the choice before it starts.
4. Rewrite the privacy page (next section).
5. List the exemption conditions for the owner to confirm (Needs owner decision).

## Privacy page: what it must say

Never "Ce site n'utilise aucun traceur" when anything is read or written on the device. Content, to be validated by the owner:

- the measurement tool, the processors (« Sous-traitants ») and their location;
- what is stored on the device (cookie, Web Storage...), its lifetime;
- the purpose and the legal basis (exemption or consent);
- the retention period (« Durée de conservation »);
- the opt-out link (« ne pas être mesuré »);
- the rights of the visitors and the contact.

The « Sous-traitants » and « Durée de conservation » lines are always on the page (article 13 above), but their values are facts only the owner has: never invent them (not even a plausible default). Ask for them; until they are given, write the line with the marker `[à compléter]`, for example « Durée de conservation : [à compléter] ». The marker is a placeholder: in launch mode `check-site` (PLACEHOLDER-001) reports it as an error on any public page, `noindex` pages included, so the launch is blocked until the owner fills it, and the report lists it under **Needs owner decision**.

## Legal notice (LCEN)

Since 2024-05-23, article 1-1 of loi n° 2004-575 (created by loi n° 2024-449) lists what a publisher shows. For a company: name or company name, registered office, phone number, share capital and registration number for registered companies; the name of the **directeur de la publication** and, where applicable, of the co-director and of the person responsible for editorial content (responsable de la rédaction); the name, company name, address and phone number of the **hébergeur** (hosting provider), and of the third parties that store data for the site, where applicable. Penalty (article 1-2): one year of imprisonment and a 75,000 EUR fine. References to "article 6-III" are outdated. Source: https://www.legifrance.gouv.fr/loda/id/JORFTEXT000000801164 (read 2026-10-12)

The agent lists missing items; the owner provides the facts (never invent a name, an address or a registration number).

## Risk register

A decision to accept a risk is written in the project's risk register, read again before any feature that touches personal data or legal duties:

| ID | Subject | Decision and date | Rule | Exposure | What lifts the risk |
| --- | --- | --- | --- | --- | --- |

## High-stakes content

Health, law, finance, regulation: reviewed by a human expert before publication; no invented figure, article number or criterion number; every quotation checked on its source page. Recommendation (unsourced).

## Say in the report

- Article 82: what is read or written on the device (cookies, Web Storage), and whether the exemption conditions can hold; the opt-out (opposition) mechanism.
- What changed on the privacy page, and every `[à compléter]` line the owner must fill (processors, retention).
- LCEN article 1-1: missing items of the legal notice (directeur de la publication, hébergeur...).
- Legal decisions belong to the owner: exemption or consent, accepted risks.

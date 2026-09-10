# Final audit report — Hethonglab TSA practice UI

## Outcome

The audit combines direct semantic observation, 16 user-supplied serialized HTML captures and the read-only local application bundle. One supplied capture is an exact duplicate, so 15 unique states/documents remain. Extension injections and all scripts were excluded from capture-derived artifacts; account text, form values, application identifiers and response/session material were not retained.

## Captured UI coverage

The supplied DOM directly confirms the candidate confirmation screen, repeated exam-room/sidebar structure, single-choice controls, true/false matrix controls, inline fill-in blanks, native draggable answer chips, and a completion/recommendation page. The reference bundle additionally proves multiple-choice and matching renderers plus the submit modal. Capture viewport dimensions were not embedded, so desktop/tablet/mobile labels are intentionally left unknown; responsive utilities themselves are documented.

## Protection boundary

A clean live outerHTML/getComputedStyle/network-response capture was not available after developer-tool attachment caused the site to redirect through its protection page. No protection was bypassed. No request was altered to expand access. No hidden answer data, credential, cookie, Authorization value or sensitive session material was read or stored. The accidental localhost network capture was discarded.

## Local reference classification

- `index-rqS3kNQ4.js`: same application family and contains matching TSA components, but differs from the saved HTML's `index-CvGeGVj1.js`; it is a version variant, not a proven exact current-network match.
- `index-IpwJzEAT.css`: matching Tailwind/KaTeX styling, but the saved HTML references `index-9eYssA5U.css`; it is likewise a version variant.
- `output.css`: an HTML document saved under a CSS extension. It references the other hashed build and `/disable-devtool.js`.

The reference directory was read only and was not modified.

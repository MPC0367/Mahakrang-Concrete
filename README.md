# Mahakrang Concrete - website (static build)

Live: https://mahakrangconcrete.com/ (GitHub Pages custom domain, set in the `CNAME` file; DNS on Cloudflare).
The old address https://mpc0367.github.io/Mahakrang-Concrete/ forwards there.

This repository holds the **generated** static build of the public website. Do not edit these files by hand:
they are rendered from the Mahakrang v2 site (Node + SQLite CMS, `NOVA\mahakrang-v2`) with

    node scripts/export-pages.ts      # renders every page into var/pages
    node scripts/sync-pages.mjs       # copies it here

Since 9 Nov 2026 the site is served from the domain's root, so every address starts with `/`, not
`/Mahakrang-Concrete/`. Build with the base path `/` (or rewrite the prefix after syncing), and keep the
`CNAME` file: without it GitHub Pages drops the custom domain.

Content is managed in the v2 admin, which needs the Node server and is not part of this static site.
Search engines may list it since 9 Nov 2026 (the owner's word): content pages carry `index, follow`, an absolute
canonical and th/en hreflang, `robots.txt` names `sitemap.xml` (58 pages). Kept `noindex`: the redirect pages, 404s,
search results, the order-by-phone contact page and the three lab batch reports (sample test records). The IndexNow key
file is the 32-character `.txt` at the root. Records marked "ข้อมูลตัวอย่าง" are still sample data.
Since 10 Nov 2026 the site is no longer a review build (the owner's word): the "Structural review build" bar is off
every page; each sample record keeps its own "Sample data" label. A rebuild from the source must keep all of this.
Since 10 Nov 2026 every page with a footer (70) ends with O2 Design Studio's credit, the O2 mark and DESIGN STUDIO
linked to o2-designstudio.com, as the last line of `.ftr__legal` (`.ftr__credit`; styles at the end of
`assets/site.css`, whose `?v=` is the first 10 characters of its SHA-1). The source on the other computer does not
draw it yet: add it there, or a rebuild drops it.
Since 19 Nov 2026 (branch `home-phone-mock-2026-11-19`) phones below 768px lay the home page's four cards out as in
the owner's picture: 01 large, a Quality / Standard / Service row (the gateway list's last item, `.hm-gw__values`;
from 768px it sits under the unchanged 2 x 2 mosaic since 19 Nov), 02 and 03 side by side with their words at the foot of the photo, 04 wide with white words on the
photo (no white fade since 19 Nov), outlined see-more links. Styles: the "home on phones" block in `assets/site.css`; the row's markup is in
`index.html` and `en/index.html`. Made here by hand, not in mahakrang-v2: add it there, or a rebuild drops it.
Since 20 Nov 2026 (branch `values-hover-2026-11-20`) the Quality / Standard / Service row answers a mouse: the icon turns red,
a red rule draws under the words, and each icon moves its own way (layers spread, the tick redraws, the headset
rings); colour and rule only under reduced motion, nothing on phones. Styles: "the three words: hover" in
`assets/site.css`. Made here by hand, not in mahakrang-v2: add it there, or a rebuild drops it.
Since 20 Nov 2026 (branch `logo-opening-2026-11-20`) the 62 pages with the logo mark open on the logo: a white cover,
the wordmark drawn as an outline and filled from the bottom, then moved into the header (~2 s; a fresh open or a
reload only, never on clicks within the site or under reduced motion; a tap or key skips it). The decision and timing
are an inline script in each page's head (after the site.css link), the look is "the logo opening" in
`assets/site.css`. Made here by hand, not in mahakrang-v2: add it there, or a rebuild drops it.
Since 20 Nov 2026 (branch `micropile-page-2026-11-20`) `/concrete/micropile/` and its English page follow Mahakrang's
reference layout with their own words and photographs (sent through the owner, originals in the client's documents
folder, never here): MICROPILE SURFACE PRO over the pile render on its own warm grey, four points from their text, the
production standard beside the stacked piles, three slanted photos, their Customer First film (`media/micropile/`,
H.264 1080p, loads only on play), the Quality / Standard / Service row; the specifications note and calculator stay.
`/concrete/` and `/en/concrete/` open their use rail on a light Micropile Surface Pro card. Styles: "the Micropile
Surface Pro page" in `assets/site.css`. Made here by hand, not in mahakrang-v2: add it there, or a rebuild drops it.
Since 21 Nov 2026 (branch `micropile-forming-2026-11-21`) both Micropile pages form like the home page's story: as the
logo opening lifts the pile pours in from the bottom, MICROPILE SURFACE PRO rises out of its baseline word by word and
the line under the kicker forms letter by letter; lower down the stacked piles, the three photos and the film pour in,
the photos drift with the scroll, the rest rises in; section headings and the calculator stay still. Styles "the
Micropile page forms" in `assets/site.css`; a one-line script in each page's head (sets `mp-js` only when motion is
welcome) and one at the end of `<main>`. Nothing moves under reduced motion or without scripts.
Since 22 Nov 2026 (branch `cards-broken-grid-2026-11-22`) from 768px the four cards are laid out like the story under
them: the page's own margins, two large and two smaller photographs whose tops step (01 high, 02 low, 03 low, 04 high),
each card's number as a huge numeral standing on its photo (it rises out of the photo's edge once, after the logo
opening), and the English line beside it as a label with the red square (03's stays handwritten); the words on the
photos and phones are unchanged. Styles "the four cards on the computer: a broken grid" in `assets/site.css`; a
one-line script in the home pages' head (sets `gw-js` only when motion is welcome) and one after the cards. The
owner preferred it to the phone-style layout tried the same night (branch `home-phone-layout-2026-11-22`, not used). Made here
by hand, not in mahakrang-v2: add it there, or a rebuild drops it.

Since 22 Nov 2026 (branch `ga-on-grid-2026-11-22`) Google Analytics runs only after a visitor's yes: `js/consent.js` (on
every page with a footer, 72) asks once on the live site after the logo opening, Accept and Decline alike; only after
Accept does it load Google's tag, with Consent Mode v2 (analytics storage alone granted, no advertising, no Google signals),
cookies for 180 days, and the page's address without its query. Anywhere but mahakrangconcrete.com and www it asks and
loads nothing. Property "Mahakrang Concrete website" in O2's Google Analytics account (O2 Design Studio, 416310196),
Measurement ID G-CJ6WM47SN9, data kept 2 months. The cookie policy is `/cookies/` and `/en/cookies/` (noindex, follow);
the footer's phone line links it and, on the live site, "Cookie settings". Every page's Content-Security-Policy allows
Google's tag and collection hosts. Styles "the cookie question and the cookie policy" at the end of `assets/site.css`.
Made here by hand, not in mahakrang-v2: add it there, or a rebuild drops it.

Since 20 Nov 2026 (branch `home-art-2026-11-20`) the home page tells a story under the four cards, which stay first:
six chapters (`.hm-ed` in `index.html` and `en/index.html`, styles "the home page story under the four cards" and the
"motion" block in `assets/site.css`, a small inline script at the end of the block): 01 a manifesto on warm paper with
three words (Opportunity / Community / The future), 02 the plant, 03 a timeline of six plant photos (pinned while you
scroll on a computer or tablet, drop-down photos on phones), 04 the lab on stone, 05 the team in a slowly drifting row
whose photos open in `js/viewer.js`, 06 contact on ink. Photos pour into their frames and drift, numerals rise; section
headings stay still; nothing moves under reduced motion. From 768px the cards' words are smaller (title 30-58px). Every
word and photo is already on the site. Made here by hand, not in mahakrang-v2: add it there, or a rebuild drops it.

The previous site is kept at the tag `v1-previous-site`.

## Editing the texts from SPINE (since 22 Nov 2026, branch `spine-website-2026-11-22`)

The owner asked for Mahakrang in SPINE "the same setup as for patravana … they can edit their website and all its pages
on here". Every text on the 72 pages (36 Thai + 36 English; 1,948 texts, 1,568 in both languages) is marked with a key, `data-cms="<key>"` (a photograph's
description `data-cms-alt`), and the words SPINE shows are read from the pages themselves:

- `cms/registry.json` — every text: key, page tab, section, page address, languages, length limit. `content/manifest.json`
  points at the newest `content/r<N>.json` (the words per key, `{ th, en }`). Shared texts (header, menu, footer, search,
  skip link: keys `s.*`) carry one key on every page; search titles and descriptions are `seo.<page>.title|description`.
  A text found in one language only (the English capitals over a Thai heading, say) has that language alone.
- `cms/units.mjs` — the rules for reading a text and writing it back: plain words, a new line for `<br>`, icons kept;
  unchanged texts are never touched; new words keep the phrase spans (`cc-ph`, `nw`, `pg-nobr`) that were there and get
  new ones (Thai split by the browser's own dictionary). `cms/test.mjs` checks all of it (7 checks).
- **Publishing:** SPINE adds `inbox/queue/<nonce>.json` to the branch `cms-inbox`; its workflow (`cms-publish.yml`, kept
  in `cms/cms-inbox/` here) runs `cms/build.mjs --queue`, refuses any change whose words moved on the website since it was
  typed, rewrites only the changed texts, reads every page back, commits a new revision to `main`, asks Pages to publish
  and leaves the answer in `inbox/results/<nonce>.json` for SPINE.
- **After a change by hand:** the workflow "Website texts (keys for SPINE)" (`.github/workflows/cms-refresh.yml`) keys any
  new text and writes a new revision after every push to `main` that touches a page, so SPINE never shows stale words.
  It commits to `main` as "Mahakrang website texts (SPINE)": fetch `origin/main` before pushing, as always. Or run
  `node cms/extract.mjs --write && node cms/test.mjs` before committing.
- **Preview:** each page's head has one line (`data-spine-loader`) that loads `js/spine-preview.js` only when the page is
  opened as `?spine-preview=1` inside SPINE; it shows the drafts in that frame only and hides the logo opening and the
  cookie question there.
- **Cloudflare Web Analytics** (since 22 Nov 2026): every page's head has a line (`data-cf-loader`) that loads Cloudflare's
  beacon on mahakrangconcrete.com only (not on localhost, not inside SPINE's preview), and its CSP allows
  `static.cloudflareinsights.com` (script) and `cloudflareinsights.com` (connect). No cookie. Site "mahakrangconcrete.com" in
  O2's Cloudflare account (site tag `cd80289686c94ad9af73a49fae3b4dbf`, manual install); `cms/extract.mjs` keeps the line
  and the CSP on every page. SPINE shows the numbers under Website > Visits.
- Not editable here: O2's credit, the "ข้อมูลตัวอย่าง / Sample data" labels, phone numbers, e-mail addresses and their
  links, dated `<time>` texts and other texts with no letters, the volume calculator (its words come from its own data),
  words the scripts write at run time, links' addresses, and photographs.
- **Setting it up on GitHub (once, before SPINE's first Publish; done 22 Nov 2026):** the branch `cms-inbox` must exist
  with the workflow at its root. In an empty folder: `git init -b cms-inbox`, then
  `git --git-dir=<a clone>/.git archive main cms/cms-inbox | tar -x --strip-components=2`, `git add -A`, commit,
  `git remote add origin https://github.com/MPC0367/Mahakrang-Concrete.git`, `git push origin cms-inbox`. After a change to
  `cms/cms-inbox/` on `main`, copy it onto the branch the same way. SPINE refuses to publish to a branch without the
  workflow, and says so. A rebuild from mahakrang-v2 drops every key and every SPINE edit: carry them into the
  source first, or run `cms/extract.mjs --write` after the sync (new keys; drafts typed in SPINE on old keys are refused).

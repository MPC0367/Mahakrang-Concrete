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
the owner's picture: 01 large, a Quality / Standard / Service row (the gateway list's last item, `.hm-gw__values`,
hidden from 768px), 02 and 03 side by side with their words at the foot of the photo, 04 wide with white words on the
photo (no white fade since 19 Nov), outlined see-more links. Styles: the "home on phones" block in `assets/site.css`; the row's markup is in
`index.html` and `en/index.html`. Made here by hand, not in mahakrang-v2: add it there, or a rebuild drops it.

The previous site is kept at the tag `v1-previous-site`.

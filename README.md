# Mahakrang Concrete - website (static build)

Live: https://mpc0367.github.io/Mahakrang-Concrete/

This repository holds the **generated** static build of the public website. Do not edit these files by hand:
they are rendered from the Mahakrang v2 site (Node + SQLite CMS, `NOVA\mahakrang-v2`) with

    node scripts/export-pages.ts      # renders every page into var/pages
    node scripts/sync-pages.mjs       # copies it here

Content is managed in the v2 admin, which needs the Node server and is not part of this static site.
This is a review build: pages carry `noindex`, and records marked "ข้อมูลตัวอย่าง" are sample data.

The previous site is kept at the tag `v1-previous-site`.

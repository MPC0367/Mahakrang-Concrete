# SPINE's inbox for mahakrangconcrete.com

This branch (`cms-inbox`) is where SPINE (O2's back office, Website > Texts > Publish) sends changes to the website's
texts. Nothing here is the website: the website is `main`.

- `inbox/queue/<id>.json` — a publication from SPINE, waiting: the texts to change, each with the words it was typed
  on. SPINE adds one file per Publish and never changes it.
- `inbox/results/<id>.json` — the website's answer: built (and the revision), or why a change was refused.
- `.github/workflows/cms-publish.yml` — takes every waiting publication, oldest first, checks it against the pages on
  `main`, rewrites only the changed texts (`cms/build.mjs` on `main`), commits a new revision to `main`, asks GitHub
  Pages to publish it and writes the answer here.

Its source is `cms/cms-inbox/` on `main`: change it there, then copy it onto this branch. Do not delete the branch.

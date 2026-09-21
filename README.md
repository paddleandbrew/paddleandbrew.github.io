# paddleandbrew.github.io

The site of the research group at [Paddle & Brew](https://paddleandbrew.us), a
micro-roastery in Richmond, Virginia: research notes, projects, and the hosted
[Brew Simulator](https://paddleandbrew.github.io/brew-simulator/).

The roastery's shop and story are at [paddleandbrew.us](https://paddleandbrew.us);
roast-day news is on [Instagram](https://www.instagram.com/paddleandbrew/). This
repository is only the research side.

Built with [Jekyll](https://jekyllrb.com) and the
[Minimal Mistakes](https://mmistakes.github.io/minimal-mistakes/) theme, and
published to GitHub Pages by `.github/workflows/pages.yml`.

## Layout

| Path                       | What it is                                                         |
| -------------------------- | ------------------------------------------------------------------ |
| `_config.yml`              | Site and theme configuration                                        |
| `_data/navigation.yml`     | Masthead navigation                                                 |
| `index.html`               | Home page (intro + recent posts)                                    |
| `_pages/`                  | Standalone pages: projects, apps, about, notes, archives, 404       |
| `_posts/`                  | Research notes and write-ups                                        |
| `_includes/`               | Local overrides of theme includes                                   |
| `brew-simulator/`          | **Generated — do not edit.** See below.                             |

## The brew-simulator app

`brew-simulator/` is a standalone WebAssembly app built in
[paddleandbrew/brew-simulator](https://github.com/paddleandbrew/brew-simulator)
and pushed into this repository by that repository's CI. It is served at
`/brew-simulator/`, which stays canonical because that is where the simulator's
CI writes it; the menu bar groups it under
[`/apps/`](https://paddleandbrew.github.io/apps/), and `/apps/brew-simulator/`
redirects there. The app is **not** themed — Jekyll copies it through verbatim as
static files, and the deploy workflow then re-copies it over the build output
and fails if the result differs from the source by a single byte.

Two rules keep it working:

1. Never add YAML front matter to anything under `brew-simulator/` — that would
   make Jekyll render the file as a page.
2. Never add `brew-simulator` to `exclude` in `_config.yml`.

The root `.nojekyll` file is written by the simulator's deploy job. It has no
effect now that the site is published from a workflow rather than straight from
the branch, and the workflow writes its own `_site/.nojekyll` so the published
artifact is never post-processed.

## Publishing

GitHub Pages is set to the **GitHub Actions** source. Every push to `main` —
including the simulator's automated deploys — rebuilds and republishes the
whole site. The workflow can also be run by hand from the Actions tab.

## Local development

```sh
bundle install
bundle exec jekyll serve   # http://127.0.0.1:4000
```

The simulator needs to be fetched over HTTP (it loads a worker and a `.wasm`
module), which `jekyll serve` does, so `/brew-simulator/` works locally too.

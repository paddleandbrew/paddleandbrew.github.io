# lit-html, vendored

lit-html 3.3.3, browser ES modules, copied from the npm package so the site keeps its no-bundler
build: `pages.yml` copies these files verbatim and the browser loads them as plain modules. Every
import inside the package is relative, so nothing here needs a resolver.

Only the files `web/src` actually imports are kept, plus what they import in turn. The `node/` and
`development/` trees, the type declarations and the source maps are not copied.

To update, or to add a directive the app has started using:

    npm pack lit-html@<version>
    tar -xzf lit-html-<version>.tgz
    cp package/{lit-html,directive,directive-helpers}.js web/vendor/lit-html/
    cp package/directives/{live,unsafe-html,unsafe-svg}.js web/vendor/lit-html/directives/
    cp package/LICENSE web/vendor/lit-html/

Then check the graph is still closed — every import relative and present:

    cd web/vendor/lit-html
    for f in $(find . -name '*.js'); do d=$(dirname "$f"); \
      for i in $(grep -oE 'from"[^"]+"' "$f" | sed 's/from"//;s/"//'); do \
        [ -f "$d/$i" ] || echo "MISSING $f -> $i"; done; done

Upstream: https://github.com/lit/lit — BSD-3-Clause, see LICENSE.

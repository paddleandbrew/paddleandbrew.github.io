---
title: "Projects"
permalink: /projects/
excerpt: "Things that run, not just things that were written down."
toc: true
toc_sticky: true
---

Tools built by the research group at [Paddle &amp; Brew](https://paddleandbrew.us)
to answer our own questions. They are public because the answers are more useful
when other people can poke holes in them.

## Brew Simulator

A pour-over brew simulator and test bench built on a 1.5D column model of
extraction, with prediction bands rather than single-point answers.

The solver is compiled to WebAssembly and runs in a web worker, so simulations
happen locally in the browser — no server, no accounts, nothing uploaded. Brew
logs and calibration fits are kept in your own browser storage.

What is in it:

- **Quick start** — a single brew in, a prediction and a recommendation out.
- **Setup** — grinder, water, and geometry parameters for a specific rig.
- **Simulate / cutaway** — the run over time, plus a cross-section of the bed.
- **Results** — extraction yield and strength with uncertainty bands.
- **Log brew** — record what actually happened in the cup.
- **Calibrate** — fit the model's parameters to your own logged brews, by least
  squares or (with `?method=bayes`) a Bayesian fit that carries samples forward
  into the bands.
- **Bench** — the test bench: sweeps and comparisons between runs.

[Open the simulator]({{ '/brew-simulator/' | relative_url }}){: .btn .btn--primary}
[Source on GitHub](https://github.com/paddleandbrew/brew-simulator){: .btn .btn--inverse}

The simulator is developed in its own repository and deployed into this site
automatically, so the version above is always the current build.

Brewing something of ours while you test it? The coffee is at
[paddleandbrew.us](https://paddleandbrew.us), and roast-day news goes out on
[Instagram](https://www.instagram.com/paddleandbrew/).

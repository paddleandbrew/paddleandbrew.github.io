---
title: "The brew simulator now lives on the site"
excerpt: "A 1.5D column model of pour-over extraction, running in the browser on a WebAssembly solver — with uncertainty bands instead of single answers."
date: 2026-09-20 21:30:00 -0400
categories:
  - notes
tags:
  - brew-simulator
  - extraction
  - uncertainty
---

The pour-over simulator and test bench is now published here at
[/brew-simulator/]({{ '/brew-simulator/' | relative_url }}). Nothing about the app
has changed in this move; it just has a home next to the notes that explain it.

## What it does

It solves a 1.5D column model of extraction: water moving down through a bed of
grounds, with soluble material coming off the particles as it goes. You describe
the brew — dose, grind, water, geometry, pour schedule — and it returns the run
over time, a cutaway of the bed, and the numbers you actually care about at the
end.

The part worth pointing at is that the answers come as **bands, not points**. A
single predicted extraction yield from a model this coarse would be false
precision. So predictions are sampled across the parameters the model is least
sure about and reported as an interval.

## Calibrating it against your own brews

Out of the box the bands are wide, because the priors are wide. The **Log brew**
screen is where you record what a brew actually measured, and **Calibrate** fits
the model's parameters to those logs — least squares by default, or a Bayesian
fit if you open the app with `?method=bayes`. A Bayesian fit keeps its samples,
and the prediction bands then come from your rig instead of from a generic prior.

## Where it runs

Entirely in your browser. The solver is compiled to WebAssembly and runs in a web
worker; brew logs and fits are stored locally in the browser. There is no server
to talk to and nothing is uploaded, which also means your logs do not follow you
to another machine.

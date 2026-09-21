// Plain-language notes about what each screen and each panel does. Kept in one file so the wording
// lives apart from the markup, and so a panel can be explained without growing the panel itself.
// SCREEN notes print as a line under the header. PANEL notes hide behind the (i) button on a card.

export const SCREEN = {
  '/setup': 'Everything the solver needs about this brew: the coffee, the grind, the water, the brewer, the kettle and the pour schedule. Sharper inputs narrow the prediction; anything you leave alone keeps its assumed value and widens the band.',
  '/simulate': 'One brew, played out. Every view reads named fields from the solver state at the frame you are on, so what you see is the model, not an animation of it.',
  '/cutaway': 'The same column model swept around the brewer axis, with a probe you can move through the bed to read the liquor at one point over the whole brew.',
  '/recipe-search': 'Set the cup you want. The solver simulates about 120 recipes around your setup, keeps the ones nothing else beats on both closeness to that cup and tolerance to pouring error, and explains how the best two differ.',
  '/calibrate': 'What your logged brews did to the model. Each measured outcome pins down constants that were free, and this screen shows which ones moved, by how much, and whether the prediction band got narrower.',
  '/bench': 'The research side. Run one brew through every config, compare two variants on held-out brews, run the pre-registered falsification tests, read the parameter registry and export the data.',
};

export const PANEL = {
  // Recipe search
  'recipe.target': 'The cup the search aims at. Strength and extraction alone do not pin a brew down: two recipes can land on the same TDS and EY with very different beds, so the third dial sets how much of the contact time the bed spends slurried rather than draining.',
  'recipe.levers': 'What the search is allowed to change. Pour rate is only a lever if you own a flow-control kettle, and the water recipe is held at whatever the Setup screen says. Equipment you do not have is struck through.',
  'recipe.map': 'Each dot is one simulated recipe. Left is closer to your target cup; up is more forgiving of pouring error, meaning the pour rate can drift further before the cup moves. The joined dots are the front: the recipes nothing else beats on both at once. Click one to select it.',
  'recipe.front': 'The front, best tolerance first. Pouring tolerance is how far the pour rate may wander, in grams per second, before the predicted cup leaves your target. Click a row to compare that recipe against the next one on the front.',
  'recipe.compare': 'The selected recipe against the next one on the front, both re-run at full fidelity. Two recipes can agree on strength and still leave a different bed behind: column height, fines driven into the paper, coffee stranded on the wall, and the shape left after drawdown.',
  'recipe.explain': 'Written from the two runs by the explainer in the core. It may only quote numbers the solver produced: the check says how many were verified and names any the text invented.',
  // Simulate
  'sim.profile': 'A cut through the brewer on the section A–A′. The picker chooses which solver field is coloured in. Solid fill is state the solver computed; dashed or hatched shapes are drawn for orientation and mean nothing.',
  'sim.top': 'The bed seen from above, same field as the profile. The readings below it are the pour as the model sees it: where the stream lands, how wide its footprint is, and how much of the surface it mobilises.',
  'sim.player': 'Playback runs on the brew\'s own clock, so at 1× the brew takes as long as it would on the counter; the speed button steps up to 8× for skipping ahead. The strip shows the pours, the bed state, the head of water and the outflow strength. Click anywhere on it to jump.',
  'sim.cup': 'Cup so far is the state at the frame you are on. Projected finish is the middle and half-width of an ensemble of runs with the uncertain constants varied, so it is wider than the single run quoted under it. The split at the bottom matters when you compare two brews: the pour schedule is time you set, and only the drawdown after it is the bed\'s answer.',
  'sim.bed': 'Π is the pour rate divided by the drain rate. Much above 1 the bed stays flooded and behaves like a stirred tank; below it the water leaves as fast as it arrives and the bed runs closer to plug flow.',
  'sim.pools': 'How much of each extractable pool has been given up so far: a fast surface pool, a slower diffusion-limited one, and the cell-wall matrix that needs hydrolysis. Single pool means the active config models only one.',
  'cut.probe': 'The liquor at one cell of the bed: click any cell in the cutaway to move the probe. The chart below follows that same point across the whole brew.',
  // Setup
  'setup.confidence': 'How much of this brew is measured rather than assumed. Tier 1 is what you can say from feel, tier 3 is measured inputs: a bean profile, a grinder profile, a water recipe. The tier sets how wide the prediction band starts out, before any brew is logged.',
  'setup.recipe': 'The pour schedule as the solver runs it. Water to is the cumulative weight in the brewer at the end of that pour, not the amount added. Rate, stream and placement feed the pour-bed coupling, which decides whether the bed is slurried or settled.',
  // Calibrate
  'calibrate.pinned': 'Each constant the fit was allowed to move, with the range your brews leave it in. A constant that barely moved was already consistent with your data; one still showing a wide range needs a brew that separates it from the others.',
  'calibrate.band': 'The prediction band for this setup before and after your logged brews. It narrows only where a measurement actually constrains a constant, so logging time alone narrows less than time with a measured TDS.',
};

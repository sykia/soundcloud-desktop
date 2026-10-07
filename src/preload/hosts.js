'use strict';

// The preload's own light-DOM hosts. Each module stores the element it creates
// here so every other module (motion, localization, styles) can find it without
// importing the module that made it.

const hosts = {
  panelHost: null,
  updateHost: null,
  visualizationHost: null,
  likesShuffleHost: null,
  insightsBanner: null,
  insightsHost: null
};

module.exports = { hosts };

'use strict';

// Plain event hooks for the notes list; there is no React in this project.
function onCount(list, listener) {
  return () => listener(list.length);
}

module.exports = { onCount };

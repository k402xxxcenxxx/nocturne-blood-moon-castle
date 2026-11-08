// The hero sheet per weapon. A weapon sheet may leave out a row: heroPose then uses the base row.
import base from './hero-sheet.js';
import heavy from './hero-heavy-sheet.js';
import twin from './hero-twin-sheet.js';
import spear from './hero-spear-sheet.js';

export const heroSheets = { base, heavy, twin, spear };

/**
 * main.js — bootstrap. Wires modules together and owns nothing (idea.md §8).
 *
 *   input/* → game.js (single source of truth) → events → view/* + ui/*
 */

import { Game, STATE, REASON, normaliseWord } from './core/game.js';
import { Selection } from './core/selection.js';
import { Grid } from './core/grid.js';
import { findPath } from './core/solver.js';
import { encodeSeed, parseSeed, dailySeed, defaultMinWordLength } from './core/board.js';
import { requestBoard } from './core/boardsource.js';

import { View } from './view/renderer.js';
import { attachPicker } from './input/picker.js';
import { KeyboardPlay } from './input/keyboard.js';
import { Speech, variantsFor } from './input/speech.js';

import { Hud } from './ui/hud.js';
import { toast } from './ui/toasts.js';
import { showResults } from './ui/results.js';
import { loadSettings, saveSettings, recordRound, openLobby } from './ui/settings.js';
import { THEMES, getTheme, applyTheme } from '../css/themes.js';

const canvas = document.getElementById('board');
const settings = loadSettings();
const prefersReduced =
  settings.reducedMotion ||
  (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

const view = new View(canvas, { reducedMotion: prefersReduced });
const game = new Game({ duration: settings.duration });
const hud = new Hud(document);

let board = null;
let selection = null;
let speech = null;
let keyboardPlay = null;
let previewTimer = null;
let hintTimer = null;

view.start();
// ------------------------------------------------------------------ themes
function setAppTheme(themeId) {
   settings.theme = themeId;
   saveSettings(settings);
   const { isLight } = applyTheme(themeId);
   view.setTheme(themeId, isLight);
   const select = document.getElementById('set-theme');
   if (select && select.value !== themeId) select.value = themeId;
}
function cycleTheme() {
   const idx = THEMES.findIndex((t) => t.id === settings.theme);
   const next = THEMES[(idx + 1) % THEMES.length];
   setAppTheme(next.id);
   toast(`${next.icon} ${next.name}`, 'grey');
}
setAppTheme(settings.theme || 'system');
if (window.matchMedia) {
   window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
     if (!settings.theme || settings.theme === 'system' || settings.theme === 'auto') {
       setAppTheme('system');
     }
   });
}
document.getElementById('btn-theme')?.addEventListener('click', cycleTheme);

// ------------------------------------------------------------------ board

async function newRound(opts = {}) {
  hud.setLoading(true, 'Rolling the cube…');
  hud.reset();
  view.setPath([], null);
  let data;
  try {
    data = await requestBoard({
      size: opts.size ?? settings.size,
      adjacency: opts.adjacency ?? settings.adjacency,
      seed: opts.seed,
    });
  } catch (err) {
    console.error(err);
    hud.setLoading(true, 'Could not build a board 😕');
    return;
  }

  const grid = new Grid(data.size, data.letters, data.adjacency);
  board = {
    ...data,
    grid,
    words: data.words ? new Map(data.words) : null,
    minWordLength: data.minWordLength ?? defaultMinWordLength(data.size),
  };

  selection = new Selection(grid);
  selection.addEventListener('change', onSelectionChange);

  view.setBoard(grid);
  attachPicker(view, selection);
  keyboardPlay?.dispose();
  keyboardPlay = new KeyboardPlay(view, selection, {
    announce: (m) => hud.announce(m),
    submit: submitSelection,
  });

  hud.setBoard(board);
  hud.setSrMirror(grid);
  game.duration = settings.duration;
  game.start(board);
  hud.setLoading(false);
  view.frame();
}

// -------------------------------------------------------------- selection

function onSelectionChange(e) {
  const { path, rejected } = e.detail;
  clearPreview();
  clearHint();
  view.setPath(path, selection.legal());
  hud.setChips(path.map((i) => board.grid.letterAt(i)));
  hud.setInput('');
  hud.setInputStatus(null);
  if (rejected) {
    hud.shake();
    view.flash(rejected);
  }
}

function submitSelection() {
  if (!selection || selection.path.length === 0) return;
  const path = selection.path.slice();
  const res = game.submitWord('', path);
  if (!res.ok) hud.shake();
  selection.clear();
  return res;
}

function submitTyped() {
  const raw = hud.inputValue();
  if (selection && selection.path.length) return submitSelection();
  const word = normaliseWord(raw);
  if (!word) return;
  const res = game.submitWord(word);
  if (res.ok) {
    hud.setInput('');
    hud.setInputStatus(null);
    hud.setChips([]);
    view.setPath([], null);
  } else {
    hud.selectInput();
  }
  return res;
}

/** Live typing highlight (§4.2): green = word, amber = path only, grey = nothing. */
function onTyping(raw) {
  if (!board) return;
  const word = normaliseWord(raw);
  if (selection && selection.path.length) selection.clear({ silent: true });
  if (word.length < 2) {
    hud.setInputStatus(null);
    view.setPath([], null);
    hud.setChips([]);
    return;
  }
  const path = findPath(board.grid, word);
  const isWord = !!(board.words && board.words.has(word));
  hud.setInputStatus(path ? (isWord ? 'is-word' : 'is-path') : 'is-none');
  view.setPath(path ?? [], null);
  hud.setChips(path ? path.map((i) => board.grid.letterAt(i)) : []);
}

// ------------------------------------------------------------ game events

game.addEventListener('tick', (e) => {
  const { state, remaining, elapsed } = e.detail;
  if (state === STATE.COUNTDOWN) hud.setCountdown(Math.ceil(remaining));
  else hud.setTimer(remaining, elapsed);
});

game.addEventListener('state', (e) => {
  const { to } = e.detail;
  hud.setState(to);
  if (to === STATE.PLAYING) {
    hud.setCountdown(null);
    hud.focusInput();
  }
  if (to === STATE.RESULTS) {
    speech?.stop();
    selection?.clear();
  }
});

game.addEventListener('word', (e) => {
  const { word, score, path } = e.detail;
  toast(`+${score.total} ${word.toUpperCase()}`, 'good', badges(score));
  hud.setScore(game.score, true);
  hud.addFound(e.detail);
  hud.announce(`${word}, ${score.total} points.`);
  view.celebrate(path);
  hud.setInput('');
  hud.setInputStatus(null);
  hud.setChips([]);
  view.setPath([], null);
});

game.addEventListener('miss', (e) => {
  const { reason, word } = e.detail;
  toast(missText(reason, word), reason === REASON.ALREADY_FOUND ? 'grey' : 'warn');
  hud.shake();
});

game.addEventListener('end', (e) => {
  const results = e.detail;
  recordRound(results);
  hud.setTimer(game.duration <= 0 ? Infinity : 0, results.duration);
  showResults(results, {
    onAgain: () => newRound({ seed: undefined }),
    onResume: () => {
      game.resume();
      hud.focusInput();
    },
    onLobby: () => lobby(),
    onReplay: (path) => preview(path, 2200),
  });
});

function badges(score) {
  const b = [];
  if (score.layerBonus) b.push(`▲${score.layerBonus}`);
  if (score.volumeBonus) b.push('◆3D');
  if (score.interior) b.push('★deep');
  return b.join(' ');
}

function missText(reason, word) {
  switch (reason) {
    case REASON.NOT_A_WORD:
      return 'not a word';
    case REASON.NO_PATH:
      return 'not on the cube';
    case REASON.ALREADY_FOUND:
      return 'already found';
    case REASON.TOO_SHORT:
      return `${game.minWordLength}+ letters`;
    case REASON.BAD_PATH:
      return 'broken path';
    default:
      return word ? 'nope' : 'empty';
  }
}

// ------------------------------------------------------------- previewing

function preview(path, ms = 1600) {
  clearPreview();
  view.setPath(path, null);
  hud.setChips(path.map((i) => board.grid.letterAt(i)));
  previewTimer = setTimeout(() => {
    previewTimer = null;
    view.setPath(selection ? selection.path : [], selection?.legal() ?? null);
    hud.setChips((selection?.path ?? []).map((i) => board.grid.letterAt(i)));
  }, ms);
}
function clearPreview() {
  if (previewTimer) {
    clearTimeout(previewTimer);
    previewTimer = null;
  }
}
function clearHint() {
  if (hintTimer) {
    clearTimeout(hintTimer);
    hintTimer = null;
  }
  view.setHint(-1);
}
function giveHint() {
  if (game.state !== STATE.PLAYING || !board) return;
  if (!board.words || board.words.size === 0) {
    toast('No dictionary hints available', 'grey');
    return;
  }
  clearHint();
  // If letters are already selected, hint the next cube along a matching unfound word
  if (selection && selection.path.length > 0) {
    const selPath = selection.path;
    const candidates = [];
    for (const [w, entry] of board.words) {
      if (game.found.has(w)) continue;
      if (entry.path && entry.path.length > selPath.length) {
        let match = true;
        for (let i = 0; i < selPath.length; i++) {
          if (entry.path[i] !== selPath[i]) {
            match = false;
            break;
          }
        }
        if (match) candidates.push({ word: w, entry, nextIdx: entry.path[selPath.length] });
      }
    }
    if (candidates.length > 0) {
      candidates.sort((a, b) => a.word.length - b.word.length);
      const pick = candidates[0];
      const nextLetter = board.grid.letterAt(pick.nextIdx);
      view.setHint(pick.nextIdx);
      view.flash(pick.nextIdx);
      toast(`Hint: next letter is "${nextLetter}" (${pick.word.length} letters)`, 'good');
      hud.announce(`Hint: next letter is ${nextLetter}`);
      hintTimer = setTimeout(clearHint, 4000);
      return;
    } else {
      toast('No unfound words extend this path', 'grey');
      return;
    }
  }
  // Otherwise hint the first letter of an unfound word
  const unfound = [];
  for (const [w, entry] of board.words) {
    if (!game.found.has(w)) unfound.push({ word: w, entry });
  }
  if (unfound.length === 0) {
    toast('All words found!', 'good');
    return;
  }
  unfound.sort((a, b) => a.word.length - b.word.length);
  const pool = unfound.slice(0, Math.max(1, Math.min(10, Math.ceil(unfound.length / 3))));
  const chosen = pool[Math.floor(Math.random() * pool.length)];
  const startIdx = chosen.entry.path[0];
  const startLetter = board.grid.letterAt(startIdx);
  view.setHint(startIdx);
  view.flash(startIdx);
  toast(`Hint: starts with "${startLetter}" (${chosen.word.length} letters)`, 'good');
  hud.announce(`Hint: starts with ${startLetter}, ${chosen.word.length} letters`);
  hintTimer = setTimeout(clearHint, 4000);
}


// -------------------------------------------------------------- HUD wiring

hud.bind({
  onSubmit: submitTyped,
  onClear: () => {
    selection?.clear();
    clearHint();
    hud.setInput('');
    hud.setInputStatus(null);
    view.setPath([], null);
    hud.setChips([]);
  },
  onType: onTyping,
  onReplay: (entry) => preview(entry.path),
  onMenu: () => lobby(),
  onMic: () => toggleMic(),
  onPeel: (v) => view.effects.setPeel(v),
  onSnap: (which) => view.controls.snap(which),
  onHint: () => giveHint(),
  onEnd: () => {
    if (game.state === STATE.PLAYING || game.state === STATE.COUNTDOWN) game.end();
  },
});

// ------------------------------------------------------------------ speech

function toggleMic() {
  if (!Speech.supported) {
    toast('no speech api here', 'grey');
    return;
  }
  if (!speech) {
    speech = new Speech({ lang: settings.speechLang });
    speech.addEventListener('state', (e) => hud.setMic(e.detail.state));
    speech.addEventListener('interim', (e) => onTyping(e.detail.text));
    speech.addEventListener('final', (e) => {
      for (const token of e.detail.tokens) {
        let done = false;
        for (const v of variantsFor(token)) {
          if (v.length < game.minWordLength) continue;
          const res = game.submitWord(v);
          if (res.ok) {
            done = true;
            break;
          }
        }
        if (!done) game.submitWord(token);
      }
      hud.setInput('');
      hud.setInputStatus(null);
      hud.setChips([]);
      view.setPath([], null);
    });
  }
  speech.toggle();
}
if (!Speech.supported) hud.hideMic();

// ------------------------------------------------------------ global keys

window.addEventListener('keydown', (e) => {
  const typing = document.activeElement === hud.input;
  if (e.key === 'Enter') {
    if (typing) return; // the field's own keydown handler submits (avoid double submit)
    e.preventDefault();
    submitTyped();
    return;
  }
  if (e.key === 'Escape') {
    selection?.clear();
    hud.setInput('');
    hud.setInputStatus(null);
    view.setPath([], null);
    hud.setChips([]);
    hud.input.blur();
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (typing && /^[a-zA-Z]$/.test(e.key)) return; // let the field have letters

  switch (e.key) {
    case 'x':
    case 'X': {
      const v = view.effects.peelTarget > 0 ? 0 : 0.45;
      view.effects.setPeel(v);
      hud.setPeel(v);
      break;
    }
    case '1':
      view.controls.snap('front');
      break;
    case '2':
      view.controls.snap('top');
      break;
    case '3':
      view.controls.snap('iso');
      break;
     case 't':
     case 'T':
       if (!typing) {
         cycleTheme();
         break;
       }
       return;
    case 'h':
    case 'H':
      if (!typing) {
        giveHint();
        break;
      }
      return;
    case 'm':
    case 'M':
      if (!typing) lobby();
      break;
    default:
      return;
  }
  e.preventDefault();
});

window.addEventListener('keydown', (e) => {
  if (e.defaultPrevented) return;
  // typing anywhere focuses the field (§4.2)
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (!/^[a-zA-Z]$/.test(e.key)) return;
  if (document.activeElement === hud.input) return;
  if (keyboardPlay?.active) return;
  hud.focusInput();
});

// ------------------------------------------------------------------- lobby

async function lobby() {
   const choice = await openLobby(settings, {
     onThemePreview: (themeId) => setAppTheme(themeId),
   });
  if (!choice) return;
   if (choice.settings) {
     if (choice.settings.theme !== settings.theme) {
       setAppTheme(choice.settings.theme);
     }
     Object.assign(settings, choice.settings);
     saveSettings(settings);
   }
  if (choice.action === 'daily') {
    const seed = dailySeed(new Date(), settings.size, settings.adjacency);
    await newRound({ seed });
  } else if (choice.action === 'play') {
    const parsed = choice.seedString ? parseSeed(choice.seedString) : null;
    await newRound(parsed ?? {});
  }
}

document.getElementById('btn-menu').addEventListener('click', lobby);

// ------------------------------------------------------------------- boot

hud.setState(STATE.LOBBY);
newRound();

// Expose a tiny handle for debugging / the console.
Object.assign(globalThis, {
  troggle: {
    get board() {
      return board;
    },
    game,
    view,
    hud,
    get seed() {
      return board && encodeSeed(board);
    },
    newRound,
  },
});
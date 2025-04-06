// Remove unused tf import
import * as mm from '../src/index';
import { INoteSequence } from '../src/index';

// Either define CHECKPOINTS_DIR directly (recommended if it's a constant value)
const CHECKPOINTS_DIR = 'https://storage.googleapis.com/magentadata/js/checkpoints';

// Or import it from common.ts (if available)
// import {CHECKPOINTS_DIR} from './common';

const CKPT_URL = `${CHECKPOINTS_DIR}/transcription/onsets_frames_uni`;

// 最小音符时长(秒)，短于这个值的音符会被过滤
const MIN_NOTE_DURATION = 0.1;
// 合并间隔(秒)，间隔小于这个值的连续相同音符会被合并
const MERGE_THRESHOLD = 0.05;

document.getElementById('fileInput').addEventListener('change', (e: Event) => {
  const file = (e.target as HTMLInputElement).files[0];
  if (file) {
    processAudioFile(file);
  }
});

// Change the visualizer import to use the correct type
import { Visualizer } from '../src/core/visualizer';
import { Player } from '../src/core/player';

// In the global variable part add
let player: Player;
let visualizer: Visualizer;
let originalNs: INoteSequence;
let cleanedNs: INoteSequence;

// Modify processAudioFile function
async function processAudioFile(file: File) {
  const audioPlayer = document.getElementById('audioPlayer') as HTMLAudioElement;
  audioPlayer.src = URL.createObjectURL(file);
  
  const startTime = performance.now();
  const oaf = new mm.OnsetsAndFrames(CKPT_URL);
  
  try {
    await oaf.initialize();
    originalNs = await oaf.transcribeFromAudioFile(file);
    cleanedNs = cleanMidiTranscription(originalNs);
    
    displayResults(originalNs, cleanedNs);
    document.getElementById('time').textContent = 
      `${((performance.now() - startTime)/1000).toFixed(2)} seconds`;
    
    // Initialize player and visualizer with proper types
    if (!player) {
      player = new Player(false, {
        run: (note: mm.NoteSequence.INote) => {},
        stop: () => {}
      });
      const canvas = document.createElement('canvas');
      canvas.id = 'visualizer-canvas';
      const visualizerDiv = document.getElementById('visualizer');
      visualizerDiv.appendChild(canvas);
      visualizer = new Visualizer(originalNs, canvas);
    }
    visualizer.redraw();
  } finally {
    oaf.dispose();
  }
}

// Update the playback control functions
function setupPlaybackControls() {
  document.getElementById('playOriginalBtn').addEventListener('click', () => {
    if (player && originalNs) {
      player.stop();
      player.start(originalNs);
      visualizer.redraw();
    }
  });
  
  document.getElementById('playCleanedBtn').addEventListener('click', () => {
    if (player && cleanedNs) {
      player.stop();
      player.start(cleanedNs);
      visualizer.redraw();
    }
  });
  
  document.getElementById('stopPlaybackBtn').addEventListener('click', () => {
    if (player) {
      player.stop();
    }
  });
}

// In DOM loaded call
document.addEventListener('DOMContentLoaded', setupPlaybackControls);

function cleanMidiTranscription(ns: INoteSequence): INoteSequence {
  const cleanedNotes = [];
  let prevNote: mm.NoteSequence.INote = null;

  // 先按音高和开始时间排序
  const sortedNotes = [...ns.notes].sort((a, b) => {
    return a.pitch !== b.pitch ? a.pitch - b.pitch : a.startTime - b.startTime;
  });

  for (const note of sortedNotes) {
    // 过滤短音符
    if (note.endTime - note.startTime < MIN_NOTE_DURATION) {
      continue;
    }

    if (prevNote &&
      note.pitch === prevNote.pitch &&
      note.startTime - prevNote.endTime < MERGE_THRESHOLD) {
      // 合并连续音符
      prevNote.endTime = note.endTime;
    } else {
      // 添加新音符
      const newNote = { ...note };
      cleanedNotes.push(newNote);
      prevNote = newNote;
    }
  }

  return {
    ...ns,
    notes: cleanedNotes
  };
}

function displayResults(originalNs: INoteSequence, cleanedNs: INoteSequence) {
  const resultsDiv = document.getElementById('results');
  resultsDiv.innerHTML = `
    <h3>Original Notes: ${originalNs.notes.length}</h3>
    <p>${formatNotes(originalNs.notes)}</p>
    <h3>Cleaned Notes: ${cleanedNs.notes.length}</h3>
    <p>${formatNotes(cleanedNs.notes)}</p>
  `;
}

function formatNotes(notes: mm.NoteSequence.INote[]): string {
  return notes.map(n =>
    `Pitch:${n.pitch} Start:${n.startTime.toFixed(2)} End:${n.endTime.toFixed(2)}`
  ).join('\n');
}

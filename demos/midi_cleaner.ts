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



// In the global variable part add
let player: mm.Player;
let originalNs: mm.INoteSequence;
let cleanedNs: mm.INoteSequence;
let originalVisualizer: mm.Visualizer;
let cleanedVisualizer: mm.Visualizer;

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

    // 更新显示
    updateNoteDisplay(originalNs, cleanedNs);
    document.getElementById('time').textContent =
      `${((performance.now() - startTime) / 1000).toFixed(2)} 秒`;

    // 初始化播放器
    if (!player) {
      player = new mm.Player();
    }

    // 创建两个可视化器
    const originalCanvas = document.createElement('canvas');
    originalCanvas.id = 'original-visualizer-canvas';
    document.getElementById('original-visualizer').appendChild(originalCanvas);
    originalVisualizer = new mm.Visualizer(originalNs, originalCanvas);
    
    const cleanedCanvas = document.createElement('canvas');
    cleanedCanvas.id = 'cleaned-visualizer-canvas';
    document.getElementById('cleaned-visualizer').appendChild(cleanedCanvas);
    cleanedVisualizer = new mm.Visualizer(cleanedNs, cleanedCanvas);

    originalVisualizer.redraw();
    cleanedVisualizer.redraw();
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
      originalVisualizer.redraw();
      cleanedVisualizer.redraw();
    }
  });

  document.getElementById('playCleanedBtn').addEventListener('click', () => {
    if (player && cleanedNs) {
      player.stop();
      player.start(cleanedNs);
      originalVisualizer.redraw();
      cleanedVisualizer.redraw();
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


function updateNoteDisplay(original: mm.INoteSequence, cleaned: mm.INoteSequence) {
  document.getElementById('original-count').textContent = original.notes.length.toString();
  document.getElementById('cleaned-count').textContent = cleaned.notes.length.toString();

  document.getElementById('original-notes').textContent = 
    original.notes.map(n => `音高:${n.pitch} 开始:${n.startTime.toFixed(2)} 结束:${n.endTime.toFixed(2)}`).join('\n');

  document.getElementById('cleaned-notes').textContent =
    cleaned.notes.map(n => `音高:${n.pitch} 开始:${n.startTime.toFixed(2)} 结束:${n.endTime.toFixed(2)}`).join('\n');
}



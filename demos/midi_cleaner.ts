import * as tf from '@tensorflow/tfjs';
import * as mm from '../src/index';
import { INoteSequence } from '../src/index';


import { CHECKPOINTS_DIR, writeMemory, writeNoteSeqs, writeTimer } from './common';


mm.logging.setVerbosity(mm.logging.Level.DEBUG);

const CKPT_URL = `${CHECKPOINTS_DIR}/transcription/onsets_frames_uni`;

// 最小音符时长(秒)，短于这个值的音符会被过滤
const MIN_NOTE_DURATION = 0.1;
// 合并间隔(秒)，间隔小于这个值的连续相同音符会被合并
const MERGE_THRESHOLD = 0.05;

let originalNs: mm.INoteSequence;
let cleanedNs: mm.INoteSequence;
const optimizeBtn = document.getElementById('optimizeBtn') as HTMLButtonElement;
optimizeBtn.disabled = true;

document.getElementById('fileInput').addEventListener('change', (e: any) => {
  const file = e.target.files[0];
  transcribeFromFile(file);
  return false;
});

async function transcribeFromFile(blob: Blob, prefix = 'file') {
  setLoadingMessage(prefix);
  const audioEl =
    document.getElementById(`${prefix}Player`) as HTMLAudioElement;
  audioEl.hidden = false;
  audioEl.src = window.URL.createObjectURL(blob);

  const oafA = new mm.OnsetsAndFrames(CKPT_URL);
  oafA.initialize()
    .then(async () => {
      const start = performance.now();
      const ns = await oafA.transcribeFromAudioFile(blob);
      originalNs = ns;
      optimizeBtn.disabled = false;  // 音频处理完成后启用按钮
      writeTimer(`${prefix}-time`, start);
      writeNoteSeqs(`${prefix}-results`, [ns], true, true);
    })
    .then(() => oafA.dispose())
    .then(() => writeMemory(tf.memory().numBytes, `${prefix}-leaked-memory`));
}

function setLoadingMessage(className: string) {
  const els = document.querySelectorAll(`.${className}`);
  for (let i = 0; i < els.length; i++) {
    els[i].textContent = 'Loading...';
  }
}



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



document.getElementById('optimizeBtn').addEventListener('click', (e: any) => {
  let prefix = 'optimize';
  if (originalNs) {
    setLoadingMessage(prefix);
    const start = performance.now();
    cleanedNs = cleanMidiTranscription(originalNs);
    writeTimer(`${prefix}-time`, start);
    writeNoteSeqs(`${prefix}-results`, [cleanedNs], true, true);

  }
  return false;
});

import * as tf from '@tensorflow/tfjs';
import * as mm from '../src/index';


import { CHECKPOINTS_DIR, writeMemory, writeNoteSeqs, writeTimer } from './common';


mm.logging.setVerbosity(mm.logging.Level.DEBUG);

const CKPT_URL = `${CHECKPOINTS_DIR}/transcription/onsets_frames_uni`;


let originalNs: mm.INoteSequence;

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



/**
 * Merge notes that share the same pitch.
 * For each group of same-pitch notes, the function sorts them by startTime and merges notes
 * that are overlapping or nearly consecutive (gap < MERGE_THRESHOLD).
 */
// 移除原来的全局变量定义
// const MIN_NOTE_DURATION = 0.1;
// const MERGE_THRESHOLD = 0.08;

// 修改mergeSamePitchNotes函数签名
function mergeSamePitchNotes(
  notes: mm.NoteSequence.INote[],
  mergeThreshold: number
): mm.NoteSequence.INote[] {
  // Group notes by pitch
  const groups: { [pitch: number]: mm.NoteSequence.INote[] } = {};
  notes.forEach(note => {
    if (!groups[note.pitch]) {
      groups[note.pitch] = [];
    }
    groups[note.pitch].push(note);
  });

  const mergedNotes: mm.NoteSequence.INote[] = [];
  // Iterate over each pitch group and merge notes
  Object.keys(groups).forEach(key => {
    const group = groups[+key].sort((a, b) => a.startTime - b.startTime);
    const mergedGroup: mm.NoteSequence.INote[] = [];
    let current = group[0];
    for (let i = 1; i < group.length; i++) {
      const note = group[i];
      // Check if the next note overlaps or is nearly consecutive
      // 修改检查条件
      if (note.startTime - current.endTime < mergeThreshold || note.startTime <= current.endTime) {
        // Merge by updating the endTime to the maximum value
        current.endTime = Math.max(current.endTime, note.endTime);
      } else {
        mergedGroup.push(current);
        current = note;
      }
    }
    mergedGroup.push(current);
    mergedNotes.push(...mergedGroup);
  });

  return mergedNotes;
}

/**
 * Merge notes with different pitches if their time intervals overlap or are nearly consecutive.
 * The merging is done by merging the shorter note into the longer note.
 */
// 修改mergeDifferentPitchNotes函数签名
function mergeDifferentPitchNotes(
  notes: mm.NoteSequence.INote[],
  mergeThreshold: number
): mm.NoteSequence.INote[] {
  // Sort notes by startTime
  const mergedNotes = notes.slice().sort((a, b) => a.startTime - b.startTime);
  let merged = true;
  while (merged) {
    merged = false;
    // Outer loop: iterate over notes array
    for (let i = 0; i < mergedNotes.length; i++) {
      for (let j = i + 1; j < mergedNotes.length; j++) {
        // Only process notes with different pitch
        if (mergedNotes[i].pitch !== mergedNotes[j].pitch) {
          // Check for overlap: if note[i] and note[j] have any time overlap
          const overlap = (mergedNotes[i].startTime < mergedNotes[j].endTime) &&
            (mergedNotes[j].startTime < mergedNotes[i].endTime);
          // Check if notes are nearly consecutive in time
          const gap = mergedNotes[j].startTime - mergedNotes[i].endTime;
          const nearlyConsecutive = gap < mergeThreshold && gap >= 0;

          if (overlap || nearlyConsecutive) {
            // Calculate durations for both notes
            const durationI = mergedNotes[i].endTime - mergedNotes[i].startTime;
            const durationJ = mergedNotes[j].endTime - mergedNotes[j].startTime;
            // Merge the note with the shorter duration into the note with longer duration
            if (durationI >= durationJ) {
              mergedNotes[i].startTime = Math.min(mergedNotes[i].startTime, mergedNotes[j].startTime);
              mergedNotes[i].endTime = Math.max(mergedNotes[i].endTime, mergedNotes[j].endTime);
              // Remove the smaller note
              mergedNotes.splice(j, 1);
            } else {
              mergedNotes[j].startTime = Math.min(mergedNotes[i].startTime, mergedNotes[j].startTime);
              mergedNotes[j].endTime = Math.max(mergedNotes[i].endTime, mergedNotes[j].endTime);
              mergedNotes.splice(i, 1);
              // Break to restart the process because the current index is removed
              merged = true;
              break;
            }
            merged = true;
            break;
          }
        }
      }
      if (merged) {
        // Restart the outer loop if any merge occurred
        break;
      }
    }
  }
  return mergedNotes;
}

/**
 * Clean MIDI transcription by first merging same-pitch notes and then merging different-pitch notes.
 * Finally, filter out notes with duration less than MIN_NOTE_DURATION.
 */
// 修改mergeDifferentPitchNotes函数签名
function cleanMidiTranscription(
  ns: mm.INoteSequence,
  minNoteDuration: number,
  mergeThreshold: number
): mm.INoteSequence {
  // First, merge notes with the same pitch
  const samePitchMerged = mergeSamePitchNotes(ns.notes, mergeThreshold);
  const allMerged = mergeDifferentPitchNotes(samePitchMerged, mergeThreshold);
  // Filter out notes that are too short
  const cleanedNotes = allMerged.filter(note => (note.endTime - note.startTime) >= minNoteDuration);
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
    const minDuration = parseFloat(minDurationSlider.value);
    const mergeThreshold = parseFloat(mergeThresholdSlider.value);
    // 使用深拷贝来创建一个原始转录结果的副本
    const originalNsCopy = JSON.parse(JSON.stringify(originalNs));
    const cleanedNs = cleanMidiTranscription(originalNsCopy, minDuration, mergeThreshold);
    writeTimer(`${prefix}-time`, start);
    writeNoteSeqs(`${prefix}-results`, [cleanedNs], true, true);
  }
  return false;
});

// 在文件顶部添加这些常量声明后
const minDurationSlider = document.getElementById('minDurationSlider') as HTMLInputElement;
const mergeThresholdSlider = document.getElementById('mergeThresholdSlider') as HTMLInputElement;
const minDurationValue = document.getElementById('minDurationValue') as HTMLSpanElement;
const mergeThresholdValue = document.getElementById('mergeThresholdValue') as HTMLSpanElement;

// 添加滑块值变化监听器
minDurationSlider.addEventListener('input', () => {
  minDurationValue.textContent = minDurationSlider.value;
});

mergeThresholdSlider.addEventListener('input', () => {
  mergeThresholdValue.textContent = mergeThresholdSlider.value;
});

// 在滑块监听器后面添加重置按钮处理
const resetBtn = document.getElementById('resetBtn') as HTMLButtonElement;
resetBtn.addEventListener('click', () => {
  minDurationSlider.value = '0.1';
  mergeThresholdSlider.value = '0.08';
  minDurationValue.textContent = '0.1';
  mergeThresholdValue.textContent = '0.08';
});

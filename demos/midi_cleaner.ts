import * as tf from '@tensorflow/tfjs';
import * as mm from '../src/index';


import { CHECKPOINTS_DIR, writeMemory, writeNoteSeqs, writeTimer } from './common';


mm.logging.setVerbosity(mm.logging.Level.DEBUG);

const CKPT_URL = `${CHECKPOINTS_DIR}/transcription/onsets_frames_uni`;

// 最小音符时长(秒)，短于这个值的音符会被过滤
const MIN_NOTE_DURATION = 0.1;
// 合并间隔(秒)，间隔小于这个值的连续相同音符会被合并
const MERGE_THRESHOLD = 0.08;

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



/**
 * Merge notes that share the same pitch.
 * For each group of same-pitch notes, the function sorts them by startTime and merges notes
 * that are overlapping or nearly consecutive (gap < MERGE_THRESHOLD).
 */
function mergeSamePitchNotes(notes: mm.NoteSequence.INote[]): mm.NoteSequence.INote[] {
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
      if (note.startTime - current.endTime < MERGE_THRESHOLD || note.startTime <= current.endTime) {
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
function mergeDifferentPitchNotes(notes: mm.NoteSequence.INote[]): mm.NoteSequence.INote[] {
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
          const nearlyConsecutive = gap < MERGE_THRESHOLD && gap >= 0;

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
function cleanMidiTranscription(ns: mm.INoteSequence): mm.INoteSequence {
  // First, merge notes with the same pitch
  const samePitchMerged = mergeSamePitchNotes(ns.notes);
  // Next, process merging of notes with different pitches
  const allMerged = mergeDifferentPitchNotes(samePitchMerged);
  // Filter out notes that are too short
  const cleanedNotes = allMerged.filter(note => (note.endTime - note.startTime) >= MIN_NOTE_DURATION);
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

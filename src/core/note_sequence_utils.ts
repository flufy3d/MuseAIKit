import { INoteSequence, NoteSequence } from '../protobuf/index';


/**
 * Merge notes that share the same pitch.
 * For each group of same-pitch notes, the function sorts them by startTime and merges notes
 * that are overlapping or nearly consecutive (gap < MERGE_THRESHOLD).
 */
export function mergeSamePitchNotes(
  notes: NoteSequence.INote[],
  mergeThreshold: number
): NoteSequence.INote[] {
  // Group notes by pitch
  const groups: { [pitch: number]: NoteSequence.INote[] } = {};
  notes.forEach(note => {
    if (!groups[note.pitch]) {
      groups[note.pitch] = [];
    }
    groups[note.pitch].push(note);
  });

  const mergedNotes: NoteSequence.INote[] = [];
  // Iterate over each pitch group and merge notes
  Object.keys(groups).forEach(key => {
    const group = groups[+key].sort((a, b) => a.startTime - b.startTime);
    const mergedGroup: NoteSequence.INote[] = [];
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
export function mergeDifferentPitchNotes(
  notes: NoteSequence.INote[],
  mergeThreshold: number
): NoteSequence.INote[] {
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
 * Adaptive quantize notes by snapping note start and end times to the nearest grid defined by resolution,
 * and remove the initial silence before the first note.
 * If the original gap between two notes is smaller than the resolution,
 * shift the current note (and subsequent ones accordingly) so that its quantized start time
 * exactly equals the previous note's quantized end time.
 *
 * 自适应量化音符：
 * 1. 移除第一个音符前的静默（将所有音符平移，使得第一个音符的 startTime 为 0）。
 * 2. 根据给定分辨率对音符的起始和结束时间进行量化。
 * 3. 如果原始音符之间的 gap 小于一个网格，则将当前音符整体向前平移，
 *    使得当前音符的量化起始时间等于前一音符的量化结束时间，
 *    从而删除空 gap，同时保持该音符原有的时长。
 *
 * @param notes An array of note objects (NoteSequence.INote[])
 * @param resolution The grid resolution used for quantization
 * @returns New array of note objects with quantized time values
 */
export function quantizeNoteTimes(
  notes: NoteSequence.INote[],
  resolution: number
): NoteSequence.INote[] {
  if (notes.length === 0) return notes;

  // 1. Remove initial silence.
  const firstOnset = Math.min(...notes.map(note => note.startTime));
  const shiftedNotes = notes.map(note => ({
    ...note,
    startTime: note.startTime - firstOnset,  // remove initial silence
    endTime: note.endTime - firstOnset,        // remove initial silence
  }));

  // Sort notes by startTime for sequential processing.
  const sortedNotes = shiftedNotes.slice().sort((a, b) => a.startTime - b.startTime);

  const quantizedNotes: NoteSequence.INote[] = [];
  // cumulativeShift 用于累计前移的时间量，保证后续音符也整体前移。
  let cumulativeShift = 0;

  for (let i = 0; i < sortedNotes.length; i++) {
    // 2. Standard quantization: round start and end times to the nearest grid.
    let qStart = Math.round(sortedNotes[i].startTime / resolution) * resolution;
    let qEnd = Math.round(sortedNotes[i].endTime / resolution) * resolution;

    // Ensure a minimum duration of one grid unit.
    if (qEnd <= qStart) {
      qEnd = qStart + resolution;
    }

    // Apply the cumulative shift from previous gap removals.
    qStart = qStart - cumulativeShift;
    qEnd = qEnd - cumulativeShift;

    // 3. If the original gap between this note and the previous note is smaller than resolution,
    //    force the current note to be contiguous with the previous note.
    if (i > 0) {
      // original gap computed from shiftedNotes (移除静默后的时间差)
      const originalGap = sortedNotes[i].startTime - sortedNotes[i - 1].endTime;
      if (originalGap < resolution) {
        // Set desired start as the previous note's quantized end.
        const desiredStart = quantizedNotes[i - 1].endTime;
        // Calculate how much current note's quantized start is ahead of desiredStart.
        const shift = qStart - desiredStart;
        if (shift > 0) {
          // Shift current note left by 'shift', preserving its duration.
          qStart = qStart - shift;
          qEnd = qEnd - shift;
          // 累计偏移量也相应增加，确保后续的音符都一并前移。
          cumulativeShift += shift;
        }
      }
    }

    quantizedNotes.push({
      ...sortedNotes[i],
      startTime: qStart,
      endTime: qEnd,
    });
  }
  return quantizedNotes;
}

/**
 * Clean Note Sequence by first merging same-pitch notes and then merging different-pitch notes.
 * Then, filter out notes with duration less than MIN_NOTE_DURATION.
 * Finally, quantize note times to the nearest grid defined by resolution.
 */
export function cleanNoteSequence(
  ns: INoteSequence,
  minNoteDuration: number,
  mergeThreshold: number,
  quantizeResolution: number
): INoteSequence {
  // 创建防御性副本
  const clonedNotes = ns.notes.map(note => ({ ...note }));

  // 使用克隆后的数据进行处理
  const samePitchMerged = mergeSamePitchNotes(clonedNotes, mergeThreshold);
  const allMerged = mergeDifferentPitchNotes(samePitchMerged, mergeThreshold);

  const cleanedNotes = allMerged.filter(note =>
    (note.endTime - note.startTime) >= minNoteDuration
  );

  const quantized = quantizeNoteTimes(cleanedNotes, quantizeResolution);

  return {
    ...ns,
    notes: quantized
  };
}

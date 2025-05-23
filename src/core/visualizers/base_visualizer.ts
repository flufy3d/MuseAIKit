/**
 * @license
 * Copyright 2018 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { INoteSequence, NoteSequence } from '../../protobuf/index';

import { MAX_MIDI_PITCH, MIN_MIDI_PITCH, MIN_NOTE_LENGTH } from '../constants';
import * as sequences from '../sequences';
import { VisualizerConfig } from './config';

/**
 * Abstract base class for a `NoteSequence` visualizer.
 */
export abstract class BaseVisualizer {
  public noteSequence: INoteSequence;
  protected config: VisualizerConfig;
  protected height: number;
  protected width: number;
  protected parentElement: HTMLElement;

  /**
   * Redraws the entire note sequence, optionally painting a note as
   * active
   * @param activeNote (Optional) If specified, this `Note` will be painted
   * in the active color.
   * @param scrollIntoView (Optional) If specified and the note being painted is
   * offscreen, the parent container will be scrolled so that the note is
   * in view.
   * @returns The x position of the painted active note. Useful for
   * automatically advancing the visualization if the note was painted outside
   * of the screen.
   */
  public abstract redraw(
    activeNote?: NoteSequence.INote, scrollIntoView?: boolean): number;

  // Clears the current visualization.
  protected abstract clear(): void;

  // Clears the active notes in the visualization.
  public abstract clearActiveNotes(): void;
  /**
   * BaseVisualizer` constructor.
   *
   * @param sequence The `NoteSequence` to be visualized.
   * @param config (optional) Visualization configuration options.
   */
  constructor(sequence: INoteSequence, config: VisualizerConfig = {}) {
    // The core player (see player.ts:169) can only play unquantized sequences,
    // and will unquantize any quantized sequences. We must do the same here,
    // or else in the redrawing callback none of the visual notes will be found.
    const isQuantized = sequences.isQuantizedSequence(sequence);
    const qpm = (sequence.tempos && sequence.tempos.length > 0) ?
      sequence.tempos[0].qpm : undefined;
    this.noteSequence = isQuantized ?
      sequences.unquantizeSequence(sequence, qpm) : sequence;

    const defaultPixelsPerTimeStep = 30;
    this.config = {
      noteHeight: config.noteHeight || 6,
      noteSpacing: config.noteSpacing || 1,
      pixelsPerTimeStep: config.pixelsPerTimeStep || defaultPixelsPerTimeStep,
      noteRGB: config.noteRGB || '8, 41, 64',
      activeNoteRGB: config.activeNoteRGB || '240, 84, 119',
      minPitch: config.minPitch,
      maxPitch: config.maxPitch,
    };

    const size = this.getSize();
    this.width = size.width;
    this.height = size.height;
  }

  protected updateMinMaxPitches(noExtraPadding = false) {
    if (this.config.minPitch && this.config.maxPitch) {
      return;
    }

    // If the pitches haven't been specified already, figure them out
    // from the NoteSequence.
    if (this.config.minPitch === undefined) {
      this.config.minPitch = MAX_MIDI_PITCH;
    }
    if (this.config.maxPitch === undefined) {
      this.config.maxPitch = MIN_MIDI_PITCH;
    }
    // Find the smallest pitch so that we can scale the drawing correctly.
    for (const note of this.noteSequence.notes) {
      this.config.minPitch = Math.min(note.pitch, this.config.minPitch);
      this.config.maxPitch = Math.max(note.pitch, this.config.maxPitch);
    }

    // Add a little bit of padding at the top and the bottom.
    if (!noExtraPadding) {
      this.config.minPitch -= 2;
      this.config.maxPitch += 2;
    }
  }

  protected getSize(): { width: number; height: number } {
    this.updateMinMaxPitches();

    // Height of the canvas based on the range of pitches in the sequence.
    const height =
      (this.config.maxPitch - this.config.minPitch) * this.config.noteHeight;

    // Calculate a nice width based on the length of the sequence we're
    // playing.
    // Warn if there's no totalTime or quantized steps set, since it leads
    // to a bad size.
    const endTime = this.noteSequence.totalTime;
    if (!endTime) {
      throw new Error(
        'The sequence you are using with the visualizer does not have a ' +
        'totalQuantizedSteps or totalTime ' +
        'field set, so the visualizer can\'t be horizontally ' +
        'sized correctly.');
    }

    const width = (endTime * this.config.pixelsPerTimeStep);
    return { width, height };
  }

  protected getNotePosition(
    note: NoteSequence.INote,
    noteIndex: number
  ): { x: number; y: number, w: number, h: number } {
    // Size of this note.
    const duration = this.getNoteEndTime(note) - this.getNoteStartTime(note);
    const x = (this.getNoteStartTime(note) * this.config.pixelsPerTimeStep);
    const w = Math.max(
      this.config.pixelsPerTimeStep * duration - this.config.noteSpacing,
      MIN_NOTE_LENGTH);

    // The svg' y=0 is at the top, but a smaller pitch is actually
    // lower, so we're kind of painting backwards.
    const y = this.height -
      ((note.pitch - this.config.minPitch) * this.config.noteHeight);

    return { x, y, w, h: this.config.noteHeight };
  }

  protected scrollIntoViewIfNeeded(
    scrollIntoView: boolean, activeNotePosition: number) {
    if (scrollIntoView && this.parentElement) {
      // See if we need to scroll the container.
      const containerWidth = this.parentElement.getBoundingClientRect().width;
      if (activeNotePosition >
        (this.parentElement.scrollLeft + containerWidth)) {
        this.parentElement.scrollLeft = activeNotePosition - 20;
      }
    }
  }

  protected getNoteStartTime(note: NoteSequence.INote) {
    return Math.round(note.startTime * 100000000) / 100000000;
  }

  protected getNoteEndTime(note: NoteSequence.INote) {
    return Math.round(note.endTime * 100000000) / 100000000;
  }

  protected isPaintingActiveNote(
    note: NoteSequence.INote, playedNote: NoteSequence.INote): boolean {
    // A note is active if it's literally the same as the note we are
    // playing (aka activeNote), or if it overlaps because it's a held note.
    const isPlayedNote =
      this.getNoteStartTime(note) === this.getNoteStartTime(playedNote);
    const heldDownDuringPlayedNote =
      this.getNoteStartTime(note) <= this.getNoteStartTime(playedNote) &&
      this.getNoteEndTime(note) >= this.getNoteEndTime(playedNote);
    return isPlayedNote || heldDownDuringPlayedNote;
  }
}

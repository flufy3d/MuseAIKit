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
import { BaseVisualizer } from './base_visualizer';
import { VisualizerConfig } from './config';

/**
 * Displays a pianoroll on a canvas. Pitches are the vertical axis and time is
 * the horizontal. When connected to a player, the visualizer can also highlight
 * the notes being currently played.
 */
export class PianoRollCanvasVisualizer extends BaseVisualizer {
  protected ctx: CanvasRenderingContext2D;
  /**
   * PianoRollCanvasVisualizer` constructor.
   *
   * @param sequence The `NoteSequence` to be visualized.
   * @param canvas The element where the visualization should be displayed.
   * @param config (optional) Visualization configuration options.
   */
  constructor(
    sequence: INoteSequence, canvas: HTMLCanvasElement,
    config: VisualizerConfig = {}) {
    super(sequence, config);

    // Initialize the canvas.
    this.ctx = canvas.getContext('2d');
    this.parentElement = canvas.parentElement;

    // Use the correct device pixel ratio so that the canvas isn't blurry
    // on retina screens. See:
    // https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio
    const dpr = window.devicePixelRatio || 1;
    if (this.ctx) {
      this.ctx.canvas.width = dpr * this.width;
      this.ctx.canvas.height = dpr * this.height;

      // If we don't do this, then the canvas will look 2x bigger than we
      // want to.
      canvas.style.width = `${this.width}px`;
      canvas.style.height = `${this.height}px`;

      this.ctx.scale(dpr, dpr);
    }

    this.redraw();
  }

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
  redraw(activeNote?: NoteSequence.INote, scrollIntoView?: boolean): number {
    this.clear();

    let activeNotePosition;
    for (let i = 0; i < this.noteSequence.notes.length; i++) {
      const note = this.noteSequence.notes[i];
      const size = this.getNotePosition(note, i);

      // Color of this note.
      const opacityBaseline = 0.2;  // Shift all the opacities up a little.
      const opacity = note.velocity ? note.velocity / 100 + opacityBaseline : 1;

      const isActive =
        activeNote && this.isPaintingActiveNote(note, activeNote);
      const fill =
        `rgba(${isActive ? this.config.activeNoteRGB : this.config.noteRGB},
  ${opacity})`;

      this.redrawNote(size.x, size.y, size.w, size.h, fill);

      if (isActive && note === activeNote) {
        activeNotePosition = size.x;
      }
    }
    this.scrollIntoViewIfNeeded(scrollIntoView, activeNotePosition);
    return activeNotePosition;
  }

  protected clear() {
    this.ctx.clearRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
  }

  public clearActiveNotes() {
    this.redraw();
  }

  private redrawNote(x: number, y: number, w: number, h: number, fill: string) {
    this.ctx.fillStyle = fill;

    // Round values to the nearest integer to avoid partially filled pixels.
    this.ctx.fillRect(
      Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }
}

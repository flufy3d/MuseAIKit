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
import { BaseSVGVisualizer } from './base_svg_visualizer';
import { VisualizerConfig } from './config';
import { MIN_NOTE_LENGTH } from '../constants';

export interface WaterfallVisualizerConfig extends VisualizerConfig {
  whiteNoteHeight?: number;
  whiteNoteWidth?: number;
  blackNoteHeight?: number;
  blackNoteWidth?: number;
  // Set this to true if you don't want to see the full 88 keys piano
  // keyboard, and only want to see the octaves used in the NoteSequence.
  showOnlyOctavesUsed?: boolean;
}

/**
 * Displays a waterfall pianoroll as an SVG, on top of a piano keyboard. When
 * connected to a player, the visualizer can also highlight the notes being
 * currently played, by letting them "fall down" onto the piano keys that
 * match them. By default, a keyboard with 88 keys will be drawn, but this can
 * be overriden with the `showOnlyOctavesUsed` config parameter, in which case
 * only the octaves present in the NoteSequence will be used.
 *
 * The DOM created by this element is:
 *    <div>
 *      <svg class="waterfall-notes"></svg>
 *    </div>
 *    <svg class="waterfall-piano"></svg>
 *
 * In particular, the `div` created needs to make some default
 * styling decisions (such as its height, to hide the overlow, and how much
 * it should be initially overflown), that we don't recommend you override since
 * it has a high chance of breaking how the visualizer works.
 * If you want to style the waterfall area, style the element that you
 * pass in the `WaterfallSVGVisualizer` constructor. For example, if you
 * want to resize the height (by default it is 200px), you can do:
 *
 *   <style>
 *     #waterfall {
 *       height: 500px;
 *     }
 *   </style>
 *   <div id="waterfall"></div>
 *   <script>
 *      const viz = new mm.WaterfallSVGVisualizer(seq, waterfall);
 *   </script>
 *
 * If you want to style the piano keyboard, you can style the rects themselves:
 *
 *    <style>
 *     #waterfall svg.waterfall-notes rect.black {
 *       fill: hotpink;
 *     }
 *    </style>
 */
export class WaterfallSVGVisualizer extends BaseSVGVisualizer {
  private NOTES_PER_OCTAVE = 12;
  private WHITE_NOTES_PER_OCTAVE = 7;
  private LOW_C = 24;
  private firstDrawnOctave = 0;
  private lastDrawnOctave = 6;

  protected svgPiano: SVGSVGElement;
  declare protected config: WaterfallVisualizerConfig;

  /**
   * `WaterfallSVGVisualizer` constructor.
   *
   * @param sequence The `NoteSequence` to be visualized.
   * @param parentElement The parent element that will contain the
   * visualization.
   * @param config (optional) Visualization configuration options.
   */
  constructor(
    sequence: INoteSequence, parentElement: HTMLDivElement,
    config: WaterfallVisualizerConfig = {}) {
    super(sequence, config);

    if (!(parentElement instanceof HTMLDivElement)) {
      throw new Error(
        'This visualizer requires a <div> element to display the visualization');
    }

    // Some sensible defaults.
    this.config.whiteNoteWidth = config.whiteNoteWidth || 20;
    this.config.blackNoteWidth =
      config.blackNoteWidth || this.config.whiteNoteWidth * 2 / 3;
    this.config.whiteNoteHeight = config.whiteNoteHeight || 70;
    this.config.blackNoteHeight = config.blackNoteHeight || (2 * 70 / 3);
    this.config.showOnlyOctavesUsed = config.showOnlyOctavesUsed;

    this.setupDOM(parentElement);

    const size = this.getSize();
    this.width = size.width;
    this.height = size.height;

    // Make sure that if we've used this svg element before, it's now emptied.
    this.svg.style.width = `${this.width}px`;
    this.svg.style.height = `${this.height}px`;

    this.svgPiano.style.width = `${this.width}px`;
    this.svgPiano.style.height = `${this.config.whiteNoteHeight}px`;

    // Add a little bit of padding to the right, so that the scrollbar
    // doesn't overlap the last note on the piano.
    this.parentElement.style.width =
      `${this.width + this.config.whiteNoteWidth}px`;
    this.parentElement.scrollTop = this.parentElement.scrollHeight;

    this.clear(); // This will clear this.svg
    this.drawPiano();
    this.draw(); // This will draw notes into this.svg
  }

  private setupDOM(container: HTMLDivElement) {
    this.parentElement = document.createElement('div');
    this.parentElement.classList.add('waterfall-notes-container');

    const height = Math.max(container.getBoundingClientRect().height, 200);

    // Height and padding-top must match for this to work.
    this.parentElement.style.paddingTop =
      `${height - this.config.whiteNoteHeight}px`;
    this.parentElement.style.height =
      `${height - this.config.whiteNoteHeight}px`;

    this.parentElement.style.boxSizing = 'border-box';
    this.parentElement.style.overflowX = 'hidden';
    this.parentElement.style.overflowY = 'auto';

    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svgPiano =
      document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.classList.add('waterfall-notes');
    this.svgPiano.classList.add('waterfall-piano');

    this.parentElement.appendChild(this.svg);
    container.innerHTML = '';
    container.appendChild(this.parentElement);
    container.appendChild(this.svgPiano);
  }
  /**
   * Redraws the entire note sequence if it hasn't been drawn before,
   * optionally painting a note as active
   * @param activeNote (Optional) If specified, this `Note` will be painted
   * in the active color.
   * @param scrollIntoView (Optional) If specified and the note being
   * painted is offscreen, the parent container will be scrolled so that
   * the note is in view.
   * @returns The x position of the painted active note. Useful for
   * automatically advancing the visualization if the note was painted
   * outside of the screen.
   */
  redraw(activeNote?: NoteSequence.INote, scrollIntoView?: boolean): number {
    if (!this.drawn) {
      this.draw();
    }

    if (!activeNote) {
      return null;
    }

    // Remove the current active note, if one exists.
    this.clearActiveNotes();
    this.parentElement.style.paddingTop = this.parentElement.style.height;

    for (let i = 0; i < this.noteSequence.notes.length; i++) {
      const note = this.noteSequence.notes[i];
      const isActive =
        activeNote && this.isPaintingActiveNote(note, activeNote);

      // We're only looking to re-paint the active notes.
      if (!isActive) {
        continue;
      }

      // Activate this note.
      const el = this.svg.querySelector(`rect[data-index="${i}"]`);
      this.fillActiveRect(el, note);

      // And on the keyboard.
      const key =
        this.svgPiano.querySelector(`rect[data-pitch="${note.pitch}"]`);
      this.fillActiveRect(key, note);

      if (note === activeNote) {
        const y = parseFloat(el.getAttribute('y'));
        const height = parseFloat(el.getAttribute('height'));

        // Scroll the waterfall.
        if (y < (this.parentElement.scrollTop - height)) {
          this.parentElement.scrollTop = y + height;
        }

        // This is the note we wanted to draw.
        return y;
      }
    }
    return null;
  }

  protected getSize(): { width: number; height: number } {
    this.updateMinMaxPitches(true);

    let whiteNotesDrawn = 52;  // For a full piano.
    if (this.config.showOnlyOctavesUsed) {
      // Go through each C note and see which is the one right below and
      // above our sequence.
      let foundFirst = false, foundLast = false;
      for (let i = 1; i < 7; i++) {
        const c = this.LOW_C + this.NOTES_PER_OCTAVE * i;
        // Have we found the lowest pitch?
        if (!foundFirst && c > this.config.minPitch) {
          this.firstDrawnOctave = i - 1;
          foundFirst = true;
        }
        // Have we found the highest pitch?
        if (!foundLast && c > this.config.maxPitch) {
          this.lastDrawnOctave = i - 1;
          foundLast = true;
        }
      }

      whiteNotesDrawn = (this.lastDrawnOctave - this.firstDrawnOctave + 1) *
        this.WHITE_NOTES_PER_OCTAVE;
    }

    const width = whiteNotesDrawn * this.config.whiteNoteWidth;

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

    const height = Math.max(endTime * this.config.pixelsPerTimeStep,
      MIN_NOTE_LENGTH);
    return { width, height };
  }

  protected getNotePosition(
    note: NoteSequence.INote,
    noteIndex: number
  ): { x: number; y: number, w: number, h: number } {
    const rect =
      this.svgPiano.querySelector(`rect[data-pitch="${note.pitch}"]`);

    if (!rect) {
      return null;
    }

    // Size of this note.
    const len = this.getNoteEndTime(note) - this.getNoteStartTime(note);
    const x = Number(rect.getAttribute('x'));
    const w = Number(rect.getAttribute('width'));
    const h = Math.max(
      this.config.pixelsPerTimeStep * len - this.config.noteSpacing,
      MIN_NOTE_LENGTH);

    // The svg' y=0 is at the top, but a smaller pitch is actually
    // lower, so we're kind of painting backwards.
    const y = this.height -
      (this.getNoteStartTime(note) * this.config.pixelsPerTimeStep) - h;
    return { x, y, w, h };
  }

  private drawPiano() {
    this.svgPiano.innerHTML = '';

    const blackNoteOffset =
      this.config.whiteNoteWidth - this.config.blackNoteWidth / 2;
    const blackNoteIndexes = [1, 3, 6, 8, 10];

    // Dear future reader: I am sure there is a better way to do this, but
    // splitting it up makes it more readable and maintainable in case there's
    // an off by one key error somewhere.
    // Each note has an pitch. Pianos start on pitch 21 and end on 108.
    // First draw all the white notes, in this order:
    //    - if we're using all the octaves, pianos start on an A (so draw A,
    //    B)
    //    - ... the rest of the white keys per octave
    //    - if we started on an A, we end on an extra C.
    // Then draw all the black notes (so that these rects sit on top):
    //    - if the piano started on an A, draw the A sharp
    //    - ... the rest of the black keys per octave.

    let x = 0;
    let currentPitch = 0;
    if (this.config.showOnlyOctavesUsed) {
      // Starting on a C, and a bunch of octaves up.
      currentPitch =
        (this.firstDrawnOctave * this.NOTES_PER_OCTAVE) + this.LOW_C;
    } else {
      // Starting on the lowest A and B.
      currentPitch = this.LOW_C - 3;
      this.drawWhiteKey(currentPitch, x);
      this.drawWhiteKey(currentPitch + 2, x + this.config.whiteNoteWidth); // Corrected x offset
      currentPitch += 3;
      x = 2 * this.config.whiteNoteWidth;
    }

    // Draw the rest of the white notes.
    for (let o = this.firstDrawnOctave; o <= this.lastDrawnOctave; o++) {
      for (let i = 0; i < this.NOTES_PER_OCTAVE; i++) {
        // Black keys come later.
        if (blackNoteIndexes.indexOf(i) === -1) {
          this.drawWhiteKey(currentPitch, x);
          x += this.config.whiteNoteWidth;
        }
        currentPitch++;
      }
    }

    if (this.config.showOnlyOctavesUsed) {
      // Starting on a C, and a bunch of octaves up.
      currentPitch =
        (this.firstDrawnOctave * this.NOTES_PER_OCTAVE) + this.LOW_C;
      x = 0; // Reset x for black keys based on white key positions
    } else {
      // Before we reset, add an extra C at the end because pianos.
      this.drawWhiteKey(currentPitch, x);

      // This piano started on an A, so draw the A sharp black key.
      currentPitch = this.LOW_C - 3;
      this.drawBlackKey(currentPitch + 1, blackNoteOffset);
      currentPitch += 3;  // Next one is the LOW_C.
      x = this.config.whiteNoteWidth; // Initial x before the C-octaves for black keys.
      // First C is at x = 2*whiteNoteWidth if A,B were drawn
      // So first black key C# relative to that C.
      x = 2 * this.config.whiteNoteWidth; // Align with the start of the first full C octave
    }


    // Draw the rest of the black notes.
    // Reset x to the beginning of the relevant octaves for black key positioning
    if (this.config.showOnlyOctavesUsed) {
      x = 0;
    } else {
      // For full piano, A and B white keys take up 2 * whiteNoteWidth
      // The first C starts after them. Black keys are positioned relative to their white key neighbors.
      // A# is at whiteNoteWidth - blackNoteWidth/2
      // C# is at (2 * whiteNoteWidth) + whiteNoteWidth - blackNoteWidth/2 (if starting with A,B)
      // Or, more simply, re-calculate x based on the white keys already drawn.
      x = (this.config.showOnlyOctavesUsed ? 0 : 2 * this.config.whiteNoteWidth);
    }

    currentPitch = (this.config.showOnlyOctavesUsed ?
      (this.firstDrawnOctave * this.NOTES_PER_OCTAVE) + this.LOW_C :
      this.LOW_C - 3 + 3 // Start from the first C (pitch 24) after A, B
    );

    // If not showOnlyOctavesUsed, handle the first A# separately if needed (already done)
    // Then iterate through octaves.

    // Reset x for black key drawing pass
    let blackKey_x = 0;
    if (this.config.showOnlyOctavesUsed) {
      currentPitch = (this.firstDrawnOctave * this.NOTES_PER_OCTAVE) + this.LOW_C;
    } else {
      // Draw A#0 (pitch 22)
      this.drawBlackKey(this.LOW_C - 3 + 1, this.config.whiteNoteWidth - this.config.blackNoteWidth / 2);
      currentPitch = this.LOW_C; // Start C1 (pitch 24)
      blackKey_x = 2 * this.config.whiteNoteWidth; // Starting x for C1 octave
    }


    for (let o = this.firstDrawnOctave; o <= this.lastDrawnOctave; o++) {
      for (let i = 0; i < this.NOTES_PER_OCTAVE; i++) {
        if (blackNoteIndexes.indexOf(i) !== -1) {
          // Position black key relative to the white key it's "on top of" or preceding it.
          // The 'x' here should be the x of the white key that the black key group starts after.
          this.drawBlackKey(currentPitch, blackKey_x - (this.config.blackNoteWidth / 2));
        } else {
          // This 'else' advances x for the next white key position, which black keys use as a reference
          blackKey_x += this.config.whiteNoteWidth;
        }
        currentPitch++;
      }
    }
  }


  private drawWhiteKey(index: number, x: number) {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.dataset.pitch = String(index);
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', '0');
    rect.setAttribute('width', String(this.config.whiteNoteWidth));
    rect.setAttribute('height', String(this.config.whiteNoteHeight));
    rect.setAttribute('fill', 'white');
    rect.setAttribute('original-fill', 'white');
    rect.setAttribute('stroke', 'black');
    rect.setAttribute('stroke-width', '3px');
    rect.classList.add('white');
    this.svgPiano.appendChild(rect);
    return rect;
  }

  private drawBlackKey(index: number, x: number) {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.dataset.pitch = String(index);
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', '0');
    rect.setAttribute('width', String(this.config.blackNoteWidth));
    rect.setAttribute('height', String(this.config.blackNoteHeight));
    rect.setAttribute('fill', 'black');
    rect.setAttribute('original-fill', 'black');
    rect.setAttribute('stroke', 'black');
    rect.setAttribute('stroke-width', '3px');
    rect.classList.add('black');
    this.svgPiano.appendChild(rect);
    return rect;
  }

  public clearActiveNotes() {
    super.unfillActiveRect(this.svg);
    // And the piano.
    const els = this.svgPiano.querySelectorAll('rect.active');
    for (let i = 0; i < els.length; ++i) {
      const el = els[i];
      el.setAttribute('fill', el.getAttribute('original-fill'));
      el.classList.remove('active');
    }
  }

  protected clear() {
    super.clear(); // Clears this.svg
    if (this.svgPiano) {
      this.svgPiano.innerHTML = '';
    }
    // `drawn` is handled by super.clear()
  }
}

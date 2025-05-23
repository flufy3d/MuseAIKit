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
import { VisualizerConfig, DataAttribute, CSSProperty } from './config';

/**
 * Abstract base class for a `NoteSequence` SVG visualizer.
 */
export abstract class BaseSVGVisualizer extends BaseVisualizer {

  // This is the element used for drawing. You must set this property in
  // implementations of this class.
  protected svg: SVGSVGElement;
  protected drawn: boolean;

  /**
   * `SVGVisualizer` constructor.
   *
   * @param sequence The `NoteSequence` to be visualized.
   * @param config (optional) Visualization configuration options.
   */
  constructor(sequence: INoteSequence, config: VisualizerConfig = {}) {
    super(sequence, config);
    this.drawn = false;
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
    this.unfillActiveRect(this.svg);

    let activeNotePosition;
    for (let i = 0; i < this.noteSequence.notes.length; i++) {
      const note = this.noteSequence.notes[i];
      const isActive =
        activeNote && this.isPaintingActiveNote(note, activeNote);

      // We're only looking to re-paint the active notes.
      if (!isActive) {
        continue;
      }
      const el = this.svg.querySelector(`rect[data-index="${i}"]`);
      this.fillActiveRect(el, note);
      if (note === activeNote) {
        activeNotePosition = parseFloat(el.getAttribute('x'));
      }
    }
    this.scrollIntoViewIfNeeded(scrollIntoView, activeNotePosition);
    return activeNotePosition;
  }

  protected fillActiveRect(el: Element, note: NoteSequence.INote) {
    el.setAttribute('fill', this.getNoteFillColor(note, true));
    el.classList.add('active');
  }

  protected unfillActiveRect(svg: SVGSVGElement) {
    const els = svg.querySelectorAll('rect.active');
    for (let i = 0; i < els.length; ++i) {
      const el = els[i];
      const fill = this.getNoteFillColor(
        this.noteSequence.notes[parseInt(el.getAttribute('data-index'), 10)],
        false);
      el.setAttribute('fill', fill);
      el.classList.remove('active');
    }
  }

  protected draw() {
    for (let i = 0; i < this.noteSequence.notes.length; i++) {
      const note = this.noteSequence.notes[i];
      const size = this.getNotePosition(note, i);
      const fill = this.getNoteFillColor(note, false);
      const dataAttributes: DataAttribute[] = [
        ['index', i],
        ['instrument', note.instrument],
        ['program', note.program],
        ['isDrum', note.isDrum === true],
        ['pitch', note.pitch],
      ];
      const cssProperties: CSSProperty[] = [
        ['--midi-velocity',
          String(note.velocity !== undefined ? note.velocity : 127)]
      ];

      this.drawNote(size.x, size.y, size.w, size.h, fill,
        dataAttributes, cssProperties);
    }
    this.drawn = true;
  }

  private getNoteFillColor(note: NoteSequence.INote, isActive: boolean) {
    const opacityBaseline = 0.2;  // Shift all the opacities up a little.
    const opacity = note.velocity ? note.velocity / 100 + opacityBaseline : 1;
    const fill =
      `rgba(${isActive ? this.config.activeNoteRGB : this.config.noteRGB},
  ${opacity})`;
    return fill;
  }

  private drawNote(
    x: number, y: number, w: number, h: number, fill: string,
    dataAttributes: DataAttribute[], cssProperties: CSSProperty[]) {
    if (!this.svg) {
      return;
    }
    const rect: SVGRectElement =
      document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.classList.add('note');
    rect.setAttribute('fill', fill);

    // Round values to the nearest integer to avoid partially filled pixels.
    rect.setAttribute('x', `${Math.round(x)}`);
    rect.setAttribute('y', `${Math.round(y)}`);
    rect.setAttribute('width', `${Math.round(w)}`);
    rect.setAttribute('height', `${Math.round(h)}`);
    dataAttributes.forEach(([key, value]: DataAttribute) => {
      if (value !== undefined) {
        rect.dataset[key] = `${value}`;
      }
    });
    cssProperties.forEach(([key, value]: CSSProperty) => {
      rect.style.setProperty(key, value);
    });
    this.svg.appendChild(rect);
  }

  protected clear() {
    if (this.svg) {
      this.svg.innerHTML = '';
    }
    this.drawn = false;
  }

  public clearActiveNotes() {
    if (this.svg) {
      this.unfillActiveRect(this.svg);
    }
  }
}

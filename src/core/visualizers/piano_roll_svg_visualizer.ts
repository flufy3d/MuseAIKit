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

import { INoteSequence } from '../../protobuf/index';
import { BaseSVGVisualizer } from './base_svg_visualizer';
import { VisualizerConfig } from './config';

/**
 * Displays a pianoroll as an SVG. Pitches are the vertical axis and time is
 * the horizontal. When connected to a player, the visualizer can also highlight
 * the notes being currently played.
 *
 * Unlike PianoRollCanvasVisualizer which looks similar, PianoRollSVGVisualizer
 * does not redraw the entire sequence when activating a note.
 */
export class PianoRollSVGVisualizer extends BaseSVGVisualizer {
  /**
   * `PianoRollSVGVisualizer` constructor.
   *
   * @param sequence The `NoteSequence` to be visualized.
   * @param svg The element where the visualization should be displayed.
   * @param config (optional) Visualization configuration options.
   */
  constructor(
    sequence: INoteSequence, svg: SVGSVGElement,
    config: VisualizerConfig = {}) {
    super(sequence, config);

    if (!(svg instanceof SVGSVGElement)) {
      throw new Error(
        'This visualizer requires an <svg> element to display the visualization');
    }
    this.svg = svg;
    this.parentElement = svg.parentElement;

    const size = this.getSize();
    this.width = size.width;
    this.height = size.height;

    // Make sure that if we've used this svg element before, it's now emptied.
    this.svg.style.width = `${this.width}px`;
    this.svg.style.height = `${this.height}px`;

    this.clear();
    this.draw();
  }
}

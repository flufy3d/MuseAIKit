import * as jr from 'jianpurender';
import { INoteSequence, NoteSequence } from '../../protobuf/index';
import { BaseVisualizer } from './base_visualizer';
import { VisualizerConfig, ScrollType } from './config';


/**
 * An interface for providing extra configurable properties to a Visualizer
 * extending the basic configurable properties of `VisualizerConfig`.
 *
 * @param defaultKey The musical key the score must use to adapt the score to
 * the right accidentals. It can be overwritten with
 * `NoteSequence.keySignatures` value at time or step 0. If not assigned it
 * will be asumed C key.
 * @param instruments The subset of the `NoteSequence` instrument track
 * numbers which should be merged and displayed. If not assigned or equal to []
 * it will be used all instruments altogether.
 * @param scrollType Sets scrolling to follow scoreplaying in different ways
 * according to `ScrollType` enum values.
 */
export interface jianpuSVGVisualizerConfig extends VisualizerConfig {
  defaultKey?: number;
  instruments?: number[];
  scrollType?: ScrollType;
}

/**
 * Displays a `NoteSecuence` as a jianpu on a given SVG. jianpu is scaled to fit
 * vertically `config.noteHeight` and note horizontal position can behave in
 * two different ways: If `config.pixelsPerTimeStep` is greater than zero,
 * horizontal position will be proportional to its starting time, allowing to
 * pile several instances for different voices (parts). Otherwise, resulting
 * jianpu will display notes in a compact form, using minimum horizontal space
 * between musical symbols as regular paper jianpu does.
 *
 * Clef, key and time signature will be displayed at the leftmost side and the
 * rest of the jianpu will scroll under this initial signature area
 * accordingly. In case of proportional note positioning, given it starts at
 * pixel zero, the signature area will blink meanwhile it collides with
 * initial active notes. Key and time signature changes will be shown
 * accordingly through score.
 *
 * New configuration features have been introduced through
 * `jianpuSVGVisualizerConfig` over basic `VisualizerConfig`.
 *
 * When connected to a player, the visualizer can also highlight
 * the notes being currently played.
 *
 */
export class JianpuSVGVisualizer extends BaseVisualizer {
  private render: jr.JianpuSVGRender;  // The actual render.
  private instruments: number[];      // Instruments filter to be rendered.
  private drawnNotes: number;  // Number of drawn notes. Will redraw if changed.

  /**
   * `jianpuSVGVisualizer` constructor.
   *
   * @param sequence The `NoteSequence` to be visualized.
   * @param div The element where the visualization should be displayed.
   * @param config (optional) Visualization configuration options.
   */
  constructor(
    sequence: INoteSequence, div: HTMLDivElement,
    config: jianpuSVGVisualizerConfig = {}) {
    super(sequence, config);
    if (  // Overwritting super() value. Compact visualization as default.
      config.pixelsPerTimeStep === undefined ||
      config.pixelsPerTimeStep <= 0) {
      this.config.pixelsPerTimeStep = 0;
    }
    this.instruments = config.instruments || [];
    this.render = new jr.JianpuSVGRender(
      this.getJianpuInfo(sequence), {
      noteHeight: this.config.noteHeight,
      noteSpacingFactor: this.config.noteSpacing,
      pixelsPerTimeStep: this.config.pixelsPerTimeStep,
      noteColor: this.config.noteRGB,
      activeNoteColor: this.config.activeNoteRGB,
      defaultKey: config.defaultKey || 0,
      scrollType: config.scrollType || ScrollType.PAGE,
    },
      div);
    this.drawnNotes = sequence.notes.length;
    this.clear();
    this.redraw();
  }

  /**
   * Clears and resets the visualizer object for further redraws from scratch.
   */
  protected clear() {
    this.render.clear();
  }

  /**
   * Redraws the entire `noteSequence` in a jianpu if no `activeNote` is given,
   * highlighting on and off the appropriate notes otherwise. Should the
   * `noteSequence` had changed adding more notes at the end, calling this
   * method again would complete the redrawing from the very last note it was
   * drawn, maintaining the active note and the scroll position as they were.
   * This is handy for incremental compositions. Given the complexity of
   * adaption to a modified score, modifyied notes previously drawn will be
   * ignored (you can always `clear()` and `redraw()` for a full redraw).
   * Please have in mind `mm.Player` does not have this incremental capability
   * so, once the player had started, it will go on ignoring the changes.
   *
   * @param activeNote (Optional) If specified, this `Note` will be painted
   * in the active color and there won't be an actual redrawing, but a
   * re-colouring of the involved note heads, accidentals, dots and ties
   * (activated and de-activated ones). Otherwise, all musical symbols which
   * were not processed yet will be drawn to complete the score.
   * @param scrollIntoView (Optional) If specified and the active note to be
   * highlighted is not visualized in the container DIV, the latter will be
   * scrolled so that the note is viewed in the right place. This can be
   * altered by `AdvancedVisualizerConfig.scrollType`.
   * @returns The x position of the highlighted active note relative to the
   * beginning of the DIV, or -1 if there wasn't any given active note. Useful
   * for automatically advancing the visualization if needed.
   */
  public redraw(activeNote?: NoteSequence.INote, scrollIntoView?: boolean):
    number {
    if (this.drawnNotes !== this.noteSequence.notes.length) {
      this.render.jianpuInfo = this.getJianpuInfo(this.noteSequence);
      this.drawnNotes = this.noteSequence.notes.length; // Update drawnNotes after updating JianpuInfo
    }
    const activeNoteInfo =
      activeNote ? this.getNoteInfo(activeNote) : undefined;
    return this.render.redraw(activeNoteInfo, scrollIntoView);
  }

  private isNoteInInstruments(note: NoteSequence.INote): boolean {
    if (note.instrument === undefined || this.instruments.length === 0) {
      return true;  // No instrument information in note means no filtering.
    } else {        // Instrument filtering
      return this.instruments.indexOf(note.instrument) >= 0;
    }
  }

  private timeToQuarters(time: number): number {
    // Ensure there's at least one tempo, default to 120 qpm if not.
    const qpm = (this.noteSequence.tempos && this.noteSequence.tempos.length > 0 && this.noteSequence.tempos[0].qpm) ?
      this.noteSequence.tempos[0].qpm : 120;
    const q = time * qpm / 60;
    return Math.round(q * 16) / 16;  // Current resolution = 1/16 quarter.
  }

  private getNoteInfo(note: NoteSequence.INote): jr.NoteInfo {
    const startQ = this.timeToQuarters(note.startTime);
    const endQ = this.timeToQuarters(note.endTime);
    return {
      start: startQ,
      length: endQ - startQ,
      pitch: note.pitch,
      intensity: note.velocity
    };
  }

  private getJianpuInfo(sequence: INoteSequence): jr.JianpuInfo {
    const notesInfo: jr.NoteInfo[] = [];
    sequence.notes.forEach((note: NoteSequence.INote) => {
      if (this.isNoteInInstruments(note)) {
        notesInfo.push(this.getNoteInfo(note));
      }
    });
    return {
      notes: notesInfo,
      tempos: sequence.tempos ?
        sequence.tempos.map((t: NoteSequence.ITempo) => {
          return { start: this.timeToQuarters(t.time), qpm: t.qpm };
        }) :
        [],
      keySignatures: sequence.keySignatures ?
        sequence.keySignatures.map((ks: NoteSequence.IKeySignature) => {
          return { start: this.timeToQuarters(ks.time), key: ks.key };
        }) :
        [],
      timeSignatures: sequence.timeSignatures ?
        sequence.timeSignatures.map((ts: NoteSequence.ITimeSignature) => {
          return {
            start: this.timeToQuarters(ts.time),
            numerator: ts.numerator,
            denominator: ts.denominator
          };
        }) :
        []
    };
  }

  public clearActiveNotes() {
    this.redraw();
  }
}

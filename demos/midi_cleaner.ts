import * as tf from '@tensorflow/tfjs';
import * as mm from '../src/index';

import {
  cleanNoteSequence
} from '../src/core/note_sequence_utils';


import { CHECKPOINTS_DIR, writeMemory, writeNoteSeqs, writeTimer } from './common';


mm.logging.setVerbosity(mm.logging.Level.DEBUG);

const CKPT_URL = `${CHECKPOINTS_DIR}/transcription/onsets_frames_uni`;


let originalNs: mm.INoteSequence;


// 在文件顶部添加这些常量声明后
const minDurationSlider = document.getElementById('minDurationSlider') as HTMLInputElement;
const mergeThresholdSlider = document.getElementById('mergeThresholdSlider') as HTMLInputElement;
const quantizeResolutionSlider = document.getElementById('quantizeResolutionSlider') as HTMLInputElement;
const minDurationValue = document.getElementById('minDurationValue') as HTMLSpanElement;
const mergeThresholdValue = document.getElementById('mergeThresholdValue') as HTMLSpanElement;
const quantizeResolutionValue = document.getElementById('quantizeResolutionValue') as HTMLSpanElement;

// 添加滑块值变化监听器
minDurationSlider.addEventListener('input', () => {
  minDurationValue.textContent = minDurationSlider.value;
});

mergeThresholdSlider.addEventListener('input', () => {
  mergeThresholdValue.textContent = mergeThresholdSlider.value;
});

quantizeResolutionSlider.addEventListener('input', () => {
  quantizeResolutionValue.textContent = quantizeResolutionSlider.value;
});

// 在滑块监听器后面添加重置按钮处理
const resetBtn = document.getElementById('resetBtn') as HTMLButtonElement;
resetBtn.addEventListener('click', () => {
  minDurationSlider.value = '0.1';
  mergeThresholdSlider.value = '0.08';
  quantizeResolutionSlider.value = '0.5';
  minDurationValue.textContent = '0.1';
  mergeThresholdValue.textContent = '0.08';
  quantizeResolutionValue.textContent = '0.5';
});



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





document.getElementById('optimizeBtn').addEventListener('click', (e: any) => {
  let prefix = 'optimize';
  if (originalNs) {
    setLoadingMessage(prefix);
    const start = performance.now();
    const minDuration = parseFloat(minDurationSlider.value);
    const mergeThreshold = parseFloat(mergeThresholdSlider.value);
    const quantizeResolution = parseFloat(quantizeResolutionSlider.value);
    const cleanedNs = cleanNoteSequence(originalNs, minDuration, mergeThreshold, quantizeResolution);
    writeTimer(`${prefix}-time`, start);
    writeNoteSeqs(`${prefix}-results`, [cleanedNs], true, true);
  }
  return false;
});


import path from 'node:path';

import { AudioContext, OscillatorNode, AudioWorkletNode } from '../index.mjs';
import { sleep } from '@ircam/sc-utils';

const latencyHint = process.env.WEB_AUDIO_LATENCY === 'playback' ? 'playback' : 'interactive';
const audioContext = new AudioContext({ latencyHint });

await audioContext.audioWorklet.addModule(path.join('examples', 'worklets', 'bitcrusher.js')); // relative to cwd
await audioContext.audioWorklet.addModule(path.join('worklets', 'white-noise.js')); // relative path to call site

const sine = new OscillatorNode(audioContext, { type: 'sawtooth', frequency: 5000 });
const bitCrusher = new AudioWorkletNode(audioContext, 'bitcrusher', {
  processorOptions: { msg: 'hello world' },
});

bitCrusher.port.on('message', (event) => console.log('main recv', event));
bitCrusher.port.postMessage({ hello: 'from main' });

sine
  .connect(bitCrusher)
  .connect(audioContext.destination);

const paramBitDepth =  bitCrusher.parameters.get('bitDepth');
const paramReduction =  bitCrusher.parameters.get('frequencyReduction');

paramBitDepth.setValueAtTime(1, 0);

paramReduction.setValueAtTime(0.01, 0.);
paramReduction.linearRampToValueAtTime(0.1, 4.);
paramReduction.exponentialRampToValueAtTime(0.01, 8.);

sine.start();
sine.stop(8);

const whiteNoise = new AudioWorkletNode(audioContext, 'white-noise');
whiteNoise.connect(audioContext.destination);

audioContext.renderCapacity.addEventListener('update', e => {
  const { timestamp, averageLoad, peakLoad, underrunRatio } = e;
  console.log('AudioRenderCapacityEvent:', { timestamp, averageLoad, peakLoad, underrunRatio });
});
audioContext.renderCapacity.start({ updateInterval: 1. });

await sleep(8);

await audioContext.close();

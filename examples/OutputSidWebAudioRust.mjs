
//const { AudioContext, OfflineAudioContext, OscillatorNode, AudioWorkletNode } = require("../index.mjs");

import { AudioContext, OfflineAudioContext, OscillatorNode, AudioWorkletNode } from '../index.mjs';

export default class OutputSidWebAudioRust  {

    audioContext = null;
    scriptNode = null;


    async init() {
        this.audioContext = new AudioContext();
        await this.audioContext.audioWorklet.addModule("worklets/SimpleWorklet.js");
        this.scriptNode = await new AudioWorkletNode(this.audioContext, 'simpleWorklet');
        this.scriptNode.connect(this.audioContext.destination);
    }


    start() {
        if (this.audioContext.state=="suspended") {
            this.audioContext.resume();
        }
    }

}

(async()=>{
    const output = new OutputSidWebAudioRust();
    await output.init();
    output.start();

})();






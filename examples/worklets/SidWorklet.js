const allEqual = arr => arr.every(val => val === arr[0]);

class SidWorklet extends AudioWorkletProcessor {


      
    constructor(options) {
        super(options);
        this.sidVoice = options.processorOptions.sidVoice;
        this.memory = new Array(25).fill(0);
        this.memory[24] = 0x0F; 

        //const        
        this.C64_PAL_CPUCLK = 985248; //Hz
        this.SID_CHANNEL_AMOUNT = 1;//1 seule voix TODO debuger pour avoir les 3 voix
        this.OUTPUT_SCALEDOWN = 0x10000 * this.SID_CHANNEL_AMOUNT * 16;
        this.GATE_BITMASK = 0x01;
        this.SYNC_BITMASK = 0x02;
        this.RING_BITMASK = 0x04;
        this.TEST_BITMASK = 0x08;
        this.TRI_BITMASK = 0x10;
        this.SAW_BITMASK = 0x20;
        this.PULSE_BITMASK = 0x40;
        this.NOISE_BITMASK = 0x80;
        this.HOLDZERO_BITMASK = 0x10;
        this.DECAYSUSTAIN_BITMASK = 0x40;
        this.ATTACK_BITMASK = 0x80;
        this.FILTSW = [1, 2, 4, 1, 2, 4, 1, 2, 4];
        this.LOWPASS_BITMASK = 0x10;
        this.BANDPASS_BITMASK = 0x20;
        this.HIGHPASS_BITMASK = 0x40;
        this.OFF3_BITMASK = 0x80;
        
        
        //vars

        this.samplerate = 44100;//null;
        this.clk_ratio = this.C64_PAL_CPUCLK / this.samplerate;
        this.framecnt = 1;
        this.mix = 0;		//utilisé ?
        this.ADSRstate = [0, 0, 0];//, 0, 0, 0, 0, 0, 0];
        this.ratecnt =  [0, 0, 0];//, 0, 0, 0, 0, 0, 0];
        this.envcnt = [0, 0, 0];//, 0, 0, 0, 0, 0, 0];
        this.expcnt = [0, 0, 0];//, 0, 0, 0, 0, 0, 0];
        this.prevSR = [0, 0, 0];//, 0, 0, 0, 0, 0, 0];
        this.phaseaccu = [0, 0, 0];//, 0, 0, 0, 0, 0, 0];
        this.prevaccu = [0, 0, 0];//, 0, 0, 0, 0, 0, 0];
        this.sourceMSBrise = [0, 0, 0];
        this.sourceMSB = [0, 0, 0];
        this.noise_LFSR = new Array(3).fill(0x7FFFF8);//[0x7FFFF8, 0x7FFFF8, 0x7FFFF8, 0x7FFFF8, 0x7FFFF8, 0x7FFFF8, 0x7FFFF8, 0x7FFFF8, 0x7FFFF8];
        this.prevwfout = [0, 0, 0];//, 0, 0, 0, 0, 0, 0];
        this.prevwavdata = [0, 0, 0];//, 0, 0, 0, 0, 0, 0];
	    this.combiwf=this.prevgate=this.ctrl=this.wf=this.test=this.period=this.step=this.AD=this.SR=this.gate=this.accuadd=this.MSB=this.tmp=this.pw=this.lim=this.wfout=this.cutoff=this.resonance=this.filtin=this.output=null;
        //this.combiwf=null;
        this.prevlowpass = [0, 0, 0];
        this.prevbandpass = [0, 0, 0];
        this.cutoff_ratio_8580 = -2 * 3.14 * (12500 / 256) / this.samplerate;
        this.cutoff_ratio_6581 = -2 * 3.14 * (20000 / 256) / this.samplerate;
        this.period0 = Math.max(this.clk_ratio, 9);
        this.ADSRperiods = [this.period0, 32 * 1, 63 * 1, 95 * 1, 149 * 1, 220 * 1, 267 * 1, 313 * 1, 392 * 1, 977 * 1, 1954 * 1, 3126 * 1, 3907 * 1, 11720 * 1, 19532 * 1, 31251 * 1];
	    this.ADSRstep = [Math.ceil(this.period0 / 9)].concat(new Array(15).fill(1));

        //prescaler values that slow down the envelope-counter as it decays and approaches zero level
	    let ADSR_exptable_filler = [1,1,6,30,8,16,12,8,28,4,39,2,162,1];
        this.ADSR_exptable= new Array(256);        
        let start_exptable = 0;
        for(let i=0;i<ADSR_exptable_filler.length;i+=2) {
            this.ADSR_exptable.fill(ADSR_exptable_filler[i+1], start_exptable);
            start_exptable += ADSR_exptable_filler[i];
        }
        this.frameIterator = 0;
        //this.iterate = 0;
        
        this.port.onmessage=(e)=>{
           /* if(e.data.samplerate !== null) {
                this.samplerate = e.data.samplerate;
                this.clk_ratio = this.C64_PAL_CPUCLK / this.samplerate;
                this.cutoff_ratio_8580 = -2 * 3.14 * (12500 / 256) / this.samplerate;
                this.cutoff_ratio_6581 = -2 * 3.14 * (20000 / 256) / this.samplerate;
            }*/
           if (e.data.length>0) {
                for (let i=0; i<e.data.length;i+=2) {
                   // if (this.ALLOWED_REGISTERS[this.sidVoice].includes(e.data[i])) {
                        this.memory[e.data[i]] = e.data[i+1];
                   // }                    
                }            
                if (this.sidVoice>0) {
                    for (let j =0;j<7;j++) {//on pass sur le voix 1 car les 2 autres ne fonctionnent pas :(
                        this.memory[j]=this.memory[(7*this.sidVoice)+j];
                    }                
                }
                
               //console.log(JSON.stringify(this.memory));    
            }
        };
    }


    
    process (inputs, outputs, parameters) {
        let output = outputs[0];
	    let outputChannel = output[0];
        for (let i=0; i<outputChannel.length; i++) {
            outputChannel[i] = this.play();
        }
        return true;
    }  
    
    
    play() {
        let sample = this.mixx();
        if (sample!=0) {
           // console.log(sample);
        }
        return sample;        
    }

    mixx(a) {
        
        //debug.iterate++;
        this.filtin = 0;
        this.output = 0;
        //this.iterate++;

        for (let chnadd = 0; chnadd < this.SID_CHANNEL_AMOUNT; chnadd++) {
            this.prevgate = (this.ADSRstate[chnadd] & this.GATE_BITMASK);
            this.ctrl = this.memory[chnadd + 4];//ctrl = waveform/gate | TODO : set on the fly
            this.wf = this.ctrl & 0xF0;
            this.test = this.ctrl & this.TEST_BITMASK;
            this.SR = this.memory[chnadd + 6];//SR = Sustain/Release | TODO : set on the fly
            this.tmp = 0;
            this.AD = this.memory[chnadd + 5];
            //this.gate = this.mixer.voice[chnadd].getGate();



            //ADSR envelope generator:
            if (this.prevgate != (this.ctrl & this.GATE_BITMASK)) { //gatebit-change?   
                /*if (this.ctrl & this.GATE_BITMASK == 1) {
                    Chrono.point('gatebit change');
                    Chrono.average();
                }*/
                if (this.prevgate) {
                    this.ADSRstate[chnadd] &= 0xFF - (this.GATE_BITMASK | this.ATTACK_BITMASK | this.DECAYSUSTAIN_BITMASK);
                } else {
                    this.ADSRstate[chnadd] = (this.GATE_BITMASK | this.ATTACK_BITMASK | this.DECAYSUSTAIN_BITMASK); //rising edge, also sets hold_zero_bit=0
                    if ((this.SR & 0xF) > (this.prevSR[chnadd] & 0xF)) {
                        this.tmp = 1;
                    }
                }
            }
            this.prevSR[chnadd] = this.SR;
            this.ratecnt[chnadd] += this.clk_ratio;
            if (this.ratecnt[chnadd] >= 0x8000) {
                this.ratecnt[chnadd] -= 0x8000;
            }
            
            //set ADSR period that should be checked against rate-counter (depending on ADSR state Attack/DecaySustain/Release) 
            if (this.ADSRstate[chnadd] & this.ATTACK_BITMASK) {
                this.step = this.AD >> 4;
                this.period = this.ADSRperiods[this.step];
            } else if (this.ADSRstate[chnadd] & this.DECAYSUSTAIN_BITMASK) {
                this.step = this.AD & 0xF;
                this.period = this.ADSRperiods[this.step];
            } else {
                this.step = this.SR & 0xF;
                this.period = this.ADSRperiods[this.step];
            }
            this.step = this.ADSRstep[this.step];

            if (this.ratecnt[chnadd] >= this.period && this.ratecnt[chnadd] < this.period + this.clk_ratio && this.tmp == 0) { //ratecounter shot (matches rateperiod) (in genuine SID ratecounter is LFSR)
                this.ratecnt[chnadd] -= this.period; //compensation for timing instead of simply setting 0 on rate-counter overload
                if ((this.ADSRstate[chnadd] & this.ATTACK_BITMASK) || ++this.expcnt[chnadd] == this.ADSR_exptable[this.envcnt[chnadd]]) {
                    if (!(this.ADSRstate[chnadd] & this.HOLDZERO_BITMASK)) {
                        if (this.ADSRstate[chnadd] & this.ATTACK_BITMASK) {
                            this.envcnt[chnadd] += this.step;
                            if (this.envcnt[chnadd] >= 0xFF) {
                                this.envcnt[chnadd] = 0xFF;
                                this.ADSRstate[chnadd] &= 0xFF - this.ATTACK_BITMASK;
                            }
                        } else if (!(this.ADSRstate[chnadd] & this.DECAYSUSTAIN_BITMASK) || this.envcnt[chnadd] > (this.SR >> 4) + (this.SR & 0xF0)) {
                            this.envcnt[chnadd] -= this.step;
                            if (this.envcnt[chnadd] <= 0 && this.envcnt[chnadd] + this.step != 0) {
                                this.envcnt[chnadd] = 0;
                                this.ADSRstate[chnadd] |= this.HOLDZERO_BITMASK;
                            }
                        }
                    }
                    this.expcnt[chnadd] = 0;
                }
            }
            
            this.envcnt[chnadd] &= 0xFF; //'envcnt' may wrap around in some cases, mostly 0 -> FF (e.g.: Cloudless Rain, Boombox Alley)

            //(memory[chnadd] + memory[chnadd + 1] * 256);// fr�quence SID : | TODO : set on the fly

            //WAVE generation codes (phase accumulator and waveform-selector):  (They are explained in resid source, I won't go in details, the code speaks for itself.)
            this.accuadd = (this.memory[chnadd] + this.memory[chnadd + 1] * 256)* this.clk_ratio; //this.mixer.voice[chnadd].freq * this.clk_ratio;

            if (this.test || ((this.ctrl & this.SYNC_BITMASK) && this.sourceMSBrise[0])) {
                this.phaseaccu[chnadd] = 0;
            } else {
                this.phaseaccu[chnadd] += this.accuadd;
                if (this.phaseaccu[chnadd] > 0xFFFFFF) {
                    this.phaseaccu[chnadd] -= 0x1000000;
                }
            }
            this.MSB = this.phaseaccu[chnadd] & 0x800000;
            this.sourceMSBrise[0] = (this.MSB > (this.prevaccu[chnadd] & 0x800000)) ? 1 : 0; //phaseaccu[chnadd] &= 0xFFFFFF;

            //waveform-selector:
            if (this.wf & this.NOISE_BITMASK) { //noise waveform
                this.tmp = this.noise_LFSR[chnadd];
                if (((this.phaseaccu[chnadd] & 0x100000) != (this.prevaccu[chnadd] & 0x100000)) || this.accuadd >= 0x100000) { //clock LFSR all time if clockrate exceeds observable at given samplerate
                    this.step = (this.tmp & 0x400000) ^ ((this.tmp & 0x20000) << 5);
                    this.tmp = ((this.tmp << 1) + (this.step > 0 || this.test)) & 0x7FFFFF;
                    this.noise_LFSR[chnadd] = this.tmp;
                }
                //we simply zero output when other waveform is mixed with noise. On real SID LFSR continuously gets filled by zero and locks up. ($C1 waveform with pw<8 can keep it for a while...)
                this.wfout = (this.wf & 0x70) ? 0 : ((this.tmp & 0x100000) >> 5) + ((this.tmp & 0x40000) >> 4) + ((this.tmp & 0x4000) >> 1) + ((this.tmp & 0x800) << 1) + ((this.tmp & 0x200) << 2) + ((this.tmp & 0x20) << 5) + ((this.tmp & 0x04) << 7) + ((this.tmp & 0x01) << 8);
            } else if (this.wf & this.PULSE_BITMASK) { //simple pulse
                this.pw = (this.memory[chnadd + 2] + (this.memory[chnadd + 3] & 0xF)) *16 ;//this.mixer.voice[chnadd].pw * 16; //(memory[chnadd + 2] + (memory[chnadd + 3] & 0xF) * 256) * 16;//pw = pulsewidth (+'0')| TODO : set on the fly

                this.tmp = this.accuadd >> 9;
                if (0 < this.pw && this.pw < this.tmp) {
                    this.pw = this.tmp;
                }
                this.tmp ^= 0xFFFF;
                if (this.pw > this.tmp) {
                    this.pw = this.tmp;
                }
                this.tmp = this.phaseaccu[chnadd] >> 8;
                if (this.wf == this.PULSE_BITMASK) {
                    this.step = 256 / (this.accuadd >> 16); 
                    if (this.test) {
                        this.wfout = 0xFFFF;
                    } else if (this.tmp < this.pw) {
                        this.lim = (0xFFFF - this.pw) * this.step;
                        if (this.lim > 0xFFFF) {
                            this.lim = 0xFFFF;
                        }
                        this.wfout = this.lim - (this.pw - this.tmp) * this.step;
                        if (this.wfout < 0) {
                            this.wfout = 0;
                        }
                    } //rising edge
                    else {
                        this.lim = this.pw * this.step;
                        if (this.lim > 0xFFFF) {
                            this.lim = 0xFFFF;
                        }
                        this.wfout = (0xFFFF - this.tmp) * this.step - this.lim;
                        if (this.wfout >= 0) {
                            this.wfout = 0xFFFF;
                        }
                        this.wfout &= 0xFFFF;
                    } //falling edge
                }/* else { //combined pulse
                    this.wfout = (this.tmp >= this.pw || this.test) ? 0xFFFF : 0; //(this would be enough for simple but aliased-at-high-pitches pulse)
                    if (this.wf & this.TRI_BITMASK) {
                        if (this.wf & this.SAW_BITMASK) {
                            this.wfout = (this.wfout) ? this.createCombinedWF(c, this.PulseTriSaw_8580, this.tmp >> 4, 1) : 0;
                        } //pulse+saw+triangle (waveform nearly identical to tri+saw)
                        else {
                            this.tmp = this.phaseaccu[chnadd] ^ (this.ctrl & this.RING_BITMASK ? this.sourceMSB[0] : 0);
                            this.wfout = (this.wfout) ? this.createCombinedWF(c, this.PulseSaw_8580, (this.tmp ^ (this.tmp & 0x800000 ? 0xFFFFFF : 0)) >> 11, 0) : 0;
                        }
                    } //pulse+triangle
                    else if (this.wf & this.SAW_BITMASK) {
                        this.wfout = (this.wfout) ? this.createCombinedWF(c, this.PulseSaw_8580, this.tmp >> 4, 1) : 0; //pulse+saw
                    }
                }*/
            } else if (this.wf & this.SAW_BITMASK) { //saw
                this.wfout = this.phaseaccu[chnadd] >> 8; //saw (this row would be enough for simple but aliased-at-high-pitch saw)
               if (this.wf & this.TRI_BITMASK) {
                    this.wfout = this.createCombinedWF(c, this.TriSaw_8580, this.wfout >> 4, 1); //saw+triangle
                } else {
                    this.step = this.accuadd / 0x1200000;
                    this.wfout += this.wfout * this.step;
                    if (this.wfout > 0xFFFF) {
                        this.wfout = 0xFFFF - (this.wfout - 0x10000) / this.step;
                    }
                } //simple cleaned (bandlimited) saw
            } else if (this.wf & this.TRI_BITMASK) { //triangle (this waveform has no harsh edges, so it doesn't suffer from strong aliasing at high pitches)
                this.tmp = this.phaseaccu[chnadd] ^ (this.ctrl & this.RING_BITMASK ? this.sourceMSB[0] : 0);
                this.wfout = (this.tmp ^ (this.tmp & 0x800000 ? 0xFFFFFF : 0)) >> 7;
            }

            if (this.wf) {
                this.prevwfout[chnadd] = this.wfout;
            } else {
                this.wfout = this.prevwfout[chnadd];
            } //emulate waveform 00 floating wave-DAC (on real SID waveform00 decays after 15s..50s depending on temperature?)
            this.prevaccu[chnadd] = this.phaseaccu[chnadd];
            this.sourceMSB[0] = this.MSB; //(So the decay is not an exact value. Anyway, we just simply keep the value to avoid clicks and support SounDemon digi later...)

            //routing the c signal to either the filter or the unfiltered master output depending on filter-switch SID-registers
                        
                
            if (this.memory[23] & this.FILTSW[chnadd]) {
                this.filtin += (this.wfout - 0x8000) * (this.envcnt[chnadd] / 256);    
            } else if ((chnadd % this.SID_CHANNEL_AMOUNT) != 2 || !(this.memory[24] & this.OFF3_BITMASK)) {
                this.output += (this.wfout - 0x8000) * (this.envcnt[chnadd] / 256);
            }
        }

        this.cutoff = (this.memory[21] & 7) / 8 + this.memory[22] + 0.2;

        this.cutoff = 1 - Math.exp(this.cutoff * this.cutoff_ratio_8580);
        this.resonance = Math.pow(2, ((4 - (this.memory[23] >> 4)) / 8));
        
        this.tmp = this.filtin + this.prevbandpass[0] * this.resonance + this.prevlowpass[0];
        if (this.memory[24] & this.HIGHPASS_BITMASK) {
            this.output -= this.tmp;
        }
        this.tmp = this.prevbandpass[0] - this.tmp * this.cutoff;
        this.prevbandpass[0] = this.tmp;
        if (this.memory[24] & this.BANDPASS_BITMASK) {
            this.output -= this.tmp;
        }
        this.tmp = this.prevlowpass[0] + this.tmp * this.cutoff;
        this.prevlowpass[0] = this.tmp;
        if (this.memory[24] & this.LOWPASS_BITMASK) {
            this.output += this.tmp;
        }
       
        
        return (this.output / this.OUTPUT_SCALEDOWN) * (this.memory[24] & 0xF); // SID output
    }

    createCombinedWF(wfarray, bitmul, bitstrength, treshold) { //I found out how the combined waveform works (neighboring bits affect each other recursively)
        for (var i = 0; i < 4096; i++) {
            wfarray[i] = 0; //neighbour-bit strength and DAC MOSFET treshold is approximately set by ears'n'trials
            for (var j = 0; j < 12; j++) {
                var bitlevel = 0;
                for (var k = 0; k < 12; k++) {
                    bitlevel += (bitmul / Math.pow(bitstrength, Math.abs(k - j))) * (((i >> k) & 1) - 0.5);
                }
                wfarray[i] += (bitlevel >= treshold) ? Math.pow(2, j) : 0;
            }
            wfarray[i] *= 12;
        }
    }
}


registerProcessor('SidWorklet', SidWorklet);
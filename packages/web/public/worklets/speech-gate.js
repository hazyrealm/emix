/* global sampleRate, registerProcessor, AudioWorkletProcessor */
/**
 * Emix "High" noise suppression, second stage: a speech gate that runs after
 * RNNoise. RNNoise removes steady noise well but lets short sharp sounds
 * (key presses, mouse clicks, a cup on a desk) through between words. This
 * gate follows the room's noise floor and turns the microphone down by 24 dB
 * (never fully off, which sounds unnatural) while nobody is speaking, opening
 * within a few milliseconds when speech starts and holding open through the
 * ends of words.
 *
 * Runs on the audio thread, in 128-sample blocks: no added latency beyond the
 * 3 ms attack ramp, and a few multiplications per sample.
 */
class SpeechGateProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.floor = 0.001;
    this.gain = 1;
    this.holdSamples = 0;
    this.attack = 1 - Math.exp(-1 / (0.003 * sampleRate));
    this.release = 1 - Math.exp(-1 / (0.12 * sampleRate));
    this.holdLength = Math.round(0.3 * sampleRate);
    this.closedGain = 0.063; // -24 dB
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0 || !output) return true;
    const frames = input[0].length;
    const channels = Math.min(input.length, output.length);

    let sum = 0;
    for (let c = 0; c < channels; c++) {
      const data = input[c];
      for (let i = 0; i < frames; i++) sum += data[i] * data[i];
    }
    const rms = Math.sqrt(sum / (frames * channels || 1));

    // The floor drops fast to quiet blocks and rises slowly, so speech never
    // drags it up but a louder room is learned within a few seconds.
    if (rms < this.floor) this.floor += (rms - this.floor) * 0.2;
    else this.floor += (rms - this.floor) * 0.0008;
    if (this.floor < 0.00005) this.floor = 0.00005;

    // Open well above the floor (about +11 dB, and never for sounds below
    // -50 dBFS); close at a lower level so the gate does not chatter.
    const openAt = Math.max(this.floor * 3.5, 0.0032);
    const closeAt = Math.max(this.floor * 2.2, 0.002);
    if (rms > openAt) this.holdSamples = this.holdLength;
    else if (rms < closeAt) this.holdSamples = Math.max(0, this.holdSamples - frames);
    const target = this.holdSamples > 0 ? 1 : this.closedGain;

    const coef = target > this.gain ? this.attack : this.release;
    let g = this.gain;
    for (let i = 0; i < frames; i++) {
      g += (target - g) * coef;
      for (let c = 0; c < channels; c++) output[c][i] = input[c][i] * g;
    }
    this.gain = g;
    return true;
  }
}

registerProcessor('emix-speech-gate', SpeechGateProcessor);

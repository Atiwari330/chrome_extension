// audio-worklet-processor.js - AudioWorklet for low-latency PCM extraction

class PCMProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        
        // Configuration
        this.targetSampleRate = 16000; // Deepgram expects 16kHz
        this.bufferSize = 4096; // ~256ms at 16kHz
        this.buffer = new Float32Array(this.bufferSize);
        this.bufferIndex = 0;
        
        // Downsampling ratio (48kHz -> 16kHz = 3:1)
        this.inputSampleRate = sampleRate; // Global AudioContext sample rate
        this.downsampleRatio = this.inputSampleRate / this.targetSampleRate;
        
        console.log('[AudioWorklet] PCMProcessor initialized', {
            inputSampleRate: this.inputSampleRate,
            targetSampleRate: this.targetSampleRate,
            downsampleRatio: this.downsampleRatio
        });
    }
    
    process(inputs, outputs, parameters) {
        const input = inputs[0];
        
        // Check if we have input
        if (!input || !input[0]) {
            return true;
        }
        
        const inputChannel = input[0]; // Mono channel
        
        // Downsample and accumulate samples
        for (let i = 0; i < inputChannel.length; i += this.downsampleRatio) {
            // Simple downsampling - take every Nth sample
            const sampleIndex = Math.floor(i);
            if (sampleIndex < inputChannel.length) {
                this.buffer[this.bufferIndex++] = inputChannel[sampleIndex];
                
                // When buffer is full, send it
                if (this.bufferIndex >= this.bufferSize) {
                    this.sendPCMData();
                }
            }
        }
        
        return true; // Keep processor alive
    }
    
    sendPCMData() {
        // Convert Float32Array to Int16Array (PCM16)
        const pcm16 = new Int16Array(this.bufferIndex);
        
        for (let i = 0; i < this.bufferIndex; i++) {
            // Clamp to [-1, 1] range
            const sample = Math.max(-1, Math.min(1, this.buffer[i]));
            // Convert to 16-bit PCM
            pcm16[i] = Math.floor(sample * 32767);
        }
        
        // Send PCM data to main thread
        this.port.postMessage({
            type: 'pcm',
            data: pcm16.buffer,
            sampleCount: this.bufferIndex,
            timestamp: currentTime
        }, [pcm16.buffer]); // Transfer ownership for efficiency
        
        // Reset buffer
        this.bufferIndex = 0;
    }
}

// Register the processor
registerProcessor('pcm-processor', PCMProcessor);
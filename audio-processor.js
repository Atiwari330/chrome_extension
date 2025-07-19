// audio-processor.js - Coordinates dual audio stream processing

class AudioProcessor {
    constructor() {
        this.logger = window.logger;
        this.audioContext = null;
        this.micWorklet = null;
        this.tabWorklet = null;
        this.micStream = null;
        this.tabStream = null;
        this.isProcessing = false;
        
        this.logger.info('AudioProcessor', 'Audio processor initialized');
    }
    
    async initialize() {
        try {
            // Create AudioContext
            this.audioContext = new AudioContext({ sampleRate: 48000 });
            
            // Load AudioWorklet module
            await this.audioContext.audioWorklet.addModule(
                chrome.runtime.getURL('audio-worklet-processor.js')
            );
            
            this.logger.info('AudioProcessor', 'AudioWorklet module loaded');
        } catch (error) {
            this.logger.error('AudioProcessor', 'Failed to initialize', error);
            throw error;
        }
    }
    
    async startMicrophoneProcessing(stream) {
        try {
            this.micStream = stream;
            
            // Create audio source from microphone stream
            const source = this.audioContext.createMediaStreamSource(stream);
            
            // Create AudioWorkletNode for PCM processing
            this.micWorklet = new AudioWorkletNode(this.audioContext, 'pcm-processor');
            
            // Handle PCM data from worklet
            this.micWorklet.port.onmessage = (event) => {
                if (event.data.type === 'pcm') {
                    this.handlePCMData('user', event.data);
                }
            };
            
            // Connect audio graph
            source.connect(this.micWorklet);
            
            // Calculate and display audio levels
            this.setupAudioLevelMonitoring(source, 'user');
            
            this.logger.info('AudioProcessor', 'Microphone processing started');
        } catch (error) {
            this.logger.error('AudioProcessor', 'Failed to start microphone processing', error);
            throw error;
        }
    }
    
    async startTabAudioProcessing(streamId) {
        try {
            // Get the MediaStream from tab capture
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    mandatory: {
                        chromeMediaSource: 'tab',
                        chromeMediaSourceId: streamId
                    }
                }
            });
            
            this.tabStream = stream;
            
            // Create audio source from tab stream
            const source = this.audioContext.createMediaStreamSource(stream);
            
            // Create AudioWorkletNode for PCM processing
            this.tabWorklet = new AudioWorkletNode(this.audioContext, 'pcm-processor');
            
            // Handle PCM data from worklet
            this.tabWorklet.port.onmessage = (event) => {
                if (event.data.type === 'pcm') {
                    this.handlePCMData('others', event.data);
                }
            };
            
            // Connect audio graph
            source.connect(this.tabWorklet);
            
            // Calculate and display audio levels
            this.setupAudioLevelMonitoring(source, 'others');
            
            this.logger.info('AudioProcessor', 'Tab audio processing started');
        } catch (error) {
            this.logger.error('AudioProcessor', 'Failed to start tab audio processing', error);
            throw error;
        }
    }
    
    setupAudioLevelMonitoring(source, type) {
        // Create analyser for audio level monitoring
        const analyser = this.audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        
        source.connect(analyser);
        
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        // Monitor audio levels
        const checkLevel = () => {
            if (!this.isProcessing) return;
            
            analyser.getByteFrequencyData(dataArray);
            
            // Calculate average level
            let sum = 0;
            for (let i = 0; i < bufferLength; i++) {
                sum += dataArray[i];
            }
            const average = sum / bufferLength;
            const normalizedLevel = average / 255; // Normalize to 0-1
            
            // Send level update to UI via content script
            if (window.floatingUI) {
                window.floatingUI.updateAudioLevel(type, normalizedLevel);
            }
            
            // Continue monitoring
            requestAnimationFrame(checkLevel);
        };
        
        this.isProcessing = true;
        checkLevel();
    }
    
    handlePCMData(source, data) {
        // Log PCM data reception
        this.logger.debug('AudioProcessor', `PCM data received from ${source}`, {
            byteLength: data.data.byteLength,
            sampleCount: data.sampleCount,
            timestamp: data.timestamp
        });
        
        // Convert ArrayBuffer to base64 for message passing
        const base64Data = this.arrayBufferToBase64(data.data);
        
        // Send PCM data to service worker for Deepgram streaming
        chrome.runtime.sendMessage({
            type: 'AUDIO_DATA',
            source: source,
            data: base64Data,
            byteLength: data.data.byteLength
        }).then(() => {
            this.logger.debug('AudioProcessor', 'Audio data sent to service worker');
        }).catch(error => {
            this.logger.error('AudioProcessor', 'Failed to send audio data', error);
        });
    }
    
    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }
    
    async stop() {
        this.isProcessing = false;
        
        // Disconnect worklets
        if (this.micWorklet) {
            this.micWorklet.disconnect();
            this.micWorklet = null;
        }
        
        if (this.tabWorklet) {
            this.tabWorklet.disconnect();
            this.tabWorklet = null;
        }
        
        // Stop streams
        if (this.micStream) {
            this.micStream.getTracks().forEach(track => track.stop());
            this.micStream = null;
        }
        
        if (this.tabStream) {
            this.tabStream.getTracks().forEach(track => track.stop());
            this.tabStream = null;
        }
        
        // Close audio context
        if (this.audioContext && this.audioContext.state !== 'closed') {
            await this.audioContext.close();
            this.audioContext = null;
        }
        
        this.logger.info('AudioProcessor', 'Audio processing stopped');
    }
}
// offscreen.js - Handles tab audio capture in offscreen document
console.log('[Offscreen] Offscreen document loaded');

let audioContext = null;
let audioWorklet = null;
let tabStream = null;
let isProcessing = false;

// Listen for messages from service worker
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[Offscreen] Message received:', request.type);
    
    switch (request.type) {
        case 'START_TAB_CAPTURE':
            startTabCapture(request.streamId)
                .then(() => sendResponse({ success: true }))
                .catch(error => {
                    console.error('[Offscreen] Tab capture failed:', error);
                    sendResponse({ success: false, error: error.message });
                });
            return true; // Keep message channel open
            
        case 'STOP_TAB_CAPTURE':
            stopTabCapture();
            sendResponse({ success: true });
            break;
            
        default:
            sendResponse({ error: 'Unknown message type' });
    }
});

async function startTabCapture(streamId) {
    try {
        console.log('[Offscreen] Starting tab capture with streamId:', streamId);
        
        // Get the MediaStream using the streamId
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                mandatory: {
                    chromeMediaSource: 'tab',
                    chromeMediaSourceId: streamId
                }
            }
        });
        
        tabStream = stream;
        console.log('[Offscreen] Tab stream obtained:', {
            streamId: stream.id,
            active: stream.active,
            audioTracks: stream.getAudioTracks().length
        });
        
        // Create AudioContext for processing
        if (!audioContext) {
            audioContext = new AudioContext({
                sampleRate: 48000
            });
        }
        
        // Create source from stream
        const source = audioContext.createMediaStreamSource(stream);
        
        // Load AudioWorklet module
        await audioContext.audioWorklet.addModule('audio-worklet-processor.js');
        
        // Create AudioWorkletNode for PCM processing
        audioWorklet = new AudioWorkletNode(audioContext, 'pcm-processor');
        
        // Handle PCM data from worklet
        audioWorklet.port.onmessage = (event) => {
            if (event.data.type === 'pcm' && isProcessing) {
                // Send PCM data to service worker
                chrome.runtime.sendMessage({
                    type: 'TAB_AUDIO_DATA',
                    data: arrayBufferToBase64(event.data.data),
                    byteLength: event.data.data.byteLength,
                    sampleCount: event.data.sampleCount,
                    timestamp: event.data.timestamp
                });
            }
        };
        
        // Connect audio graph
        source.connect(audioWorklet);
        
        isProcessing = true;
        console.log('[Offscreen] Tab audio processing started');
        
    } catch (error) {
        console.error('[Offscreen] Failed to start tab capture:', error);
        throw error;
    }
}

function stopTabCapture() {
    console.log('[Offscreen] Stopping tab capture');
    
    isProcessing = false;
    
    if (tabStream) {
        const tracks = tabStream.getTracks();
        tracks.forEach(track => track.stop());
        tabStream = null;
    }
    
    if (audioWorklet) {
        audioWorklet.disconnect();
        audioWorklet = null;
    }
    
    if (audioContext && audioContext.state !== 'closed') {
        audioContext.close();
        audioContext = null;
    }
    
    console.log('[Offscreen] Tab capture stopped');
}

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}
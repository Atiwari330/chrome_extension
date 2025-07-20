// offscreen.js - Handles tab audio capture in offscreen document
console.log('[Offscreen] Offscreen document loaded');

let audioContext = null;
let audioWorklet = null;
let tabStream = null;
let isProcessing = false;
let sourceNode = null;
let gainNode = null;
let hiddenAudioElement = null;
let audioWorkletPromise = null; // Cache the worklet loading promise

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
        
        // Check for Web Audio API support
        if (!('AudioContext' in self || 'webkitAudioContext' in self)) {
            throw new Error('Web Audio API not supported');
        }
        
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
        
        // Try Web Audio API routing first
        try {
            await routeTabAudio(stream);
        } catch (audioError) {
            console.warn('[Offscreen] Web Audio routing failed, falling back to audio element:', audioError);
            fallbackToHiddenAudio(stream);
        }
        
        isProcessing = true;
        console.log('[Offscreen] Tab audio processing started');
        
    } catch (error) {
        console.error('[Offscreen] Failed to start tab capture:', error);
        chrome.runtime.sendMessage({
            type: 'CAPTURE_ERROR',
            error: error.message,
            code: 'TAB_CAPTURE_FAILED'
        });
        throw error;
    }
}

async function routeTabAudio(stream) {
    console.log('[Offscreen] Setting up Web Audio routing');
    
    // Create AudioContext for processing
    if (!audioContext || audioContext.state === 'closed') {
        audioContext = new AudioContext({
            sampleRate: 48000
        });
    }
    
    // Handle AudioContext state changes
    audioContext.onstatechange = () => {
        console.log('[Offscreen] AudioContext state:', audioContext.state);
        if (audioContext.state === 'suspended') {
            audioContext.resume().then(() => {
                console.log('[Offscreen] AudioContext resumed');
            }).catch(err => {
                console.error('[Offscreen] Failed to resume AudioContext:', err);
            });
        }
    };
    
    // Resume context if suspended
    if (audioContext.state === 'suspended') {
        await audioContext.resume();
    }
    
    // Create source from stream
    sourceNode = audioContext.createMediaStreamSource(stream);
    
    // Create gain node for volume control (to speakers)
    gainNode = audioContext.createGain();
    gainNode.gain.value = 1.0; // Full volume
    
    // Load AudioWorklet module for transcription (cache the promise)
    if (!audioWorkletPromise) {
        audioWorkletPromise = audioContext.audioWorklet.addModule('audio-worklet-processor.js');
    }
    await audioWorkletPromise;
    
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
    
    // Connect audio graph - Direct dual connection (no splitter needed)
    // Source -> AudioWorklet (for transcription)
    sourceNode.connect(audioWorklet);
    
    // Source -> Gain -> Destination (for playback)
    sourceNode.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Handle track end
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length > 0) {
        audioTracks[0].onended = () => {
            console.log('[Offscreen] Audio track ended, attempting to restart...');
            chrome.runtime.sendMessage({
                type: 'TRACK_ENDED',
                message: 'Tab audio track ended unexpectedly'
            });
        };
    }
    
    console.log('[Offscreen] Audio routing established - transcription and playback active');
}

function fallbackToHiddenAudio(stream) {
    console.log('[Offscreen] Using hidden audio element fallback');
    
    try {
        // Create hidden audio element if not exists
        if (!hiddenAudioElement) {
            hiddenAudioElement = new Audio();
            hiddenAudioElement.style.display = 'none';
            document.body.appendChild(hiddenAudioElement);
        }
        
        // Set the stream as source
        hiddenAudioElement.srcObject = stream;
        
        // Play the audio
        hiddenAudioElement.play().then(() => {
            console.log('[Offscreen] Hidden audio element playing');
        }).catch(err => {
            console.error('[Offscreen] Failed to play hidden audio:', err);
            chrome.runtime.sendMessage({
                type: 'PLAYBACK_ERROR',
                error: err.message,
                code: 'HIDDEN_AUDIO_FAILED'
            });
        });
        
        // Still set up transcription using basic Web Audio
        setupBasicTranscription(stream);
        
    } catch (error) {
        console.error('[Offscreen] Fallback audio failed:', error);
        chrome.runtime.sendMessage({
            type: 'PLAYBACK_ERROR',
            error: error.message,
            code: 'FALLBACK_FAILED'
        });
    }
}

async function setupBasicTranscription(stream) {
    try {
        // Check if Web Audio API is supported before attempting transcription
        if (!('AudioContext' in self || 'webkitAudioContext' in self)) {
            console.warn('[Offscreen] Web Audio API not supported, transcription disabled in fallback mode');
            chrome.runtime.sendMessage({
                type: 'FALLBACK_MODE',
                transcriptionEnabled: false,
                message: 'Transcription unavailable in fallback mode (Web Audio not supported)'
            });
            return;
        }
        
        if (!audioContext || audioContext.state === 'closed') {
            audioContext = new AudioContext({
                sampleRate: 48000
            });
        }
        
        const source = audioContext.createMediaStreamSource(stream);
        
        // Load AudioWorklet module (use cached promise if available)
        if (!audioWorkletPromise) {
            audioWorkletPromise = audioContext.audioWorklet.addModule('audio-worklet-processor.js');
        }
        await audioWorkletPromise;
        
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
        
        // Connect for transcription only
        source.connect(audioWorklet);
        
        // Notify that we're in fallback mode
        chrome.runtime.sendMessage({
            type: 'FALLBACK_MODE',
            transcriptionEnabled: true,
            message: 'Audio playback using fallback mode'
        });
        
    } catch (error) {
        console.error('[Offscreen] Failed to setup basic transcription:', error);
        chrome.runtime.sendMessage({
            type: 'FALLBACK_MODE',
            transcriptionEnabled: false,
            message: 'Transcription failed in fallback mode'
        });
    }
}

function stopTabCapture() {
    console.log('[Offscreen] Stopping tab capture');
    
    isProcessing = false;
    
    // Stop the stream
    if (tabStream) {
        const tracks = tabStream.getTracks();
        tracks.forEach(track => track.stop());
        tabStream = null;
    }
    
    // Disconnect audio nodes
    if (sourceNode) {
        sourceNode.disconnect();
        sourceNode = null;
    }
    
    if (gainNode) {
        gainNode.disconnect();
        gainNode = null;
    }
    
    if (audioWorklet) {
        audioWorklet.disconnect();
        audioWorklet = null;
    }
    
    // Close audio context
    if (audioContext && audioContext.state !== 'closed') {
        audioContext.close();
        audioContext = null;
    }
    
    // Stop hidden audio if exists
    if (hiddenAudioElement) {
        hiddenAudioElement.pause();
        hiddenAudioElement.srcObject = null;
        hiddenAudioElement.remove();
        hiddenAudioElement = null;
    }
    
    console.log('[Offscreen] Tab capture stopped');
}

// Volume control function
function setPlaybackVolume(volume) {
    if (gainNode) {
        // Clamp volume between 0 and 1
        const clampedVolume = Math.max(0, Math.min(1, volume));
        gainNode.gain.value = clampedVolume;
        console.log('[Offscreen] Playback volume set to:', clampedVolume);
    }
}

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}
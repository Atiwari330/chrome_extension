// permission.js - Handles microphone permission request in iframe context

(async function() {
    const statusElement = document.getElementById('status');
    
    try {
        // Request microphone permission
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });
        
        // Permission granted - clean up the stream immediately
        stream.getTracks().forEach(track => track.stop());
        
        // Update UI
        statusElement.className = 'status granted';
        statusElement.textContent = 'Microphone permission granted! You can close this window.';
        
        // Store permission state
        await chrome.storage.local.set({ micPermissionGranted: true });
        
        // Notify parent window
        window.parent.postMessage({
            type: 'PERMISSION_RESULT',
            granted: true
        }, 'https://meet.google.com');
        
        // Auto-close after 2 seconds
        setTimeout(() => {
            window.parent.postMessage({
                type: 'CLOSE_PERMISSION_IFRAME'
            }, 'https://meet.google.com');
        }, 2000);
        
    } catch (error) {
        console.error('Microphone permission error:', error);
        
        // Update UI
        statusElement.className = 'status denied';
        
        if (error.name === 'NotAllowedError') {
            statusElement.textContent = 'Microphone permission denied. Please enable it in your browser settings.';
        } else if (error.name === 'NotFoundError') {
            statusElement.textContent = 'No microphone found. Please connect a microphone and try again.';
        } else {
            statusElement.textContent = `Error: ${error.message}`;
        }
        
        // Store permission state
        await chrome.storage.local.set({ 
            micPermissionGranted: false,
            micPermissionError: error.name
        });
        
        // Notify parent window
        window.parent.postMessage({
            type: 'PERMISSION_RESULT',
            granted: false,
            error: error.name
        }, 'https://meet.google.com');
    }
})();
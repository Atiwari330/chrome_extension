// content.js - Main content script for Google Meet pages

class MeetTranscriptionExtension {
    constructor() {
        this.logger = window.logger;
        this.permissionIframe = null;
        this.floatingUI = null;
        this.isTranscribing = false;
        this.micStream = null;
        this.tabStream = null;
        this.audioProcessor = null;
        
        this.logger.info('Content', 'MeetTranscriptionExtension initialized');
        this.init();
    }

    async init() {
        try {
            // Check if we're on a Google Meet page with a meeting
            if (!this.isInMeeting()) {
                this.logger.info('Content', 'Not in a meeting yet, waiting...');
                this.watchForMeeting();
                return;
            }

            // Check microphone permission status
            const permissionStatus = await this.checkMicPermission();
            
            if (!permissionStatus.granted) {
                this.logger.info('Content', 'Microphone permission not granted, requesting...');
                await this.requestMicPermission();
            } else {
                this.logger.info('Content', 'Microphone permission already granted');
                this.createFloatingUI();
            }

            // Set up DOM mutation observer
            this.setupDOMObserver();
            
            // Listen for messages from other parts of the extension
            this.setupMessageListeners();
            
        } catch (error) {
            this.logger.error('Content', 'Initialization error', error);
        }
    }

    isInMeeting() {
        // Check for common Meet UI elements that indicate we're in a meeting
        const meetingIndicators = [
            '[data-meeting-code]',
            '[data-meeting-title]',
            '[jsname="Qx7uuf"]', // Meeting controls
            '[data-call-state="joined"]'
        ];
        
        return meetingIndicators.some(selector => 
            document.querySelector(selector) !== null
        );
    }

    watchForMeeting() {
        const observer = new MutationObserver(() => {
            if (this.isInMeeting()) {
                this.logger.info('Content', 'Meeting detected, initializing...');
                observer.disconnect();
                this.init();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    async checkMicPermission() {
        try {
            const result = await chrome.storage.local.get(['micPermissionGranted']);
            return { granted: result.micPermissionGranted === true };
        } catch (error) {
            this.logger.error('Content', 'Error checking permission', error);
            return { granted: false };
        }
    }

    async requestMicPermission() {
        return new Promise((resolve) => {
            // Create hidden iframe for permission request
            this.permissionIframe = document.createElement('iframe');
            this.permissionIframe.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 400px;
                height: 250px;
                z-index: 2147483647;
                border: none;
                border-radius: 8px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            `;
            this.permissionIframe.setAttribute('allow', 'microphone');
            this.permissionIframe.src = chrome.runtime.getURL('permission.html');
            
            // Listen for permission result
            const messageHandler = (event) => {
                if (event.origin !== chrome.runtime.getURL('').slice(0, -1)) return;
                
                if (event.data.type === 'PERMISSION_RESULT') {
                    this.logger.info('Content', 'Permission result received', event.data);
                    
                    if (event.data.granted) {
                        this.createFloatingUI();
                    } else {
                        this.showPermissionError(event.data.error);
                    }
                } else if (event.data.type === 'CLOSE_PERMISSION_IFRAME') {
                    this.removePermissionIframe();
                    window.removeEventListener('message', messageHandler);
                    resolve();
                }
            };
            
            window.addEventListener('message', messageHandler);
            document.body.appendChild(this.permissionIframe);
            
            this.logger.info('Content', 'Permission iframe injected');
        });
    }

    removePermissionIframe() {
        if (this.permissionIframe && this.permissionIframe.parentNode) {
            this.permissionIframe.parentNode.removeChild(this.permissionIframe);
            this.permissionIframe = null;
            this.logger.info('Content', 'Permission iframe removed');
        }
    }

    createFloatingUI() {
        if (this.floatingUI) {
            this.logger.warn('Content', 'Floating UI already exists');
            return;
        }

        // Create container for the floating UI
        const container = document.createElement('div');
        container.id = 'meet-transcription-container';
        
        // Add inline styles to ensure visibility
        container.style.cssText = `
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: 100% !important;
            pointer-events: none !important;
            z-index: 2147483647 !important;
            display: block !important;
        `;
        
        // Create shadow root for style isolation
        const shadow = container.attachShadow({ mode: 'open' });
        
        // Load styles
        const styleLink = document.createElement('link');
        styleLink.rel = 'stylesheet';
        styleLink.href = chrome.runtime.getURL('styles.css');
        shadow.appendChild(styleLink);
        
        // Append container to body first
        document.body.appendChild(container);
        
        // Initialize floating UI after a small delay to ensure DOM is ready
        setTimeout(() => {
            try {
                this.floatingUI = new FloatingUI(shadow, this);
                // Make floatingUI accessible to other scripts
                window.floatingUI = this.floatingUI;
                this.logger.info('Content', 'Floating UI created');
                
                // Force a reflow to ensure visibility
                container.style.display = 'none';
                container.offsetHeight; // Force reflow
                container.style.display = 'block';
            } catch (error) {
                this.logger.error('Content', 'Failed to create FloatingUI', error);
            }
        }, 100);
    }

    showPermissionError(error) {
        // Create a simple error message
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #f44336;
            color: white;
            padding: 16px;
            border-radius: 4px;
            z-index: 2147483647;
            max-width: 300px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        `;
        errorDiv.innerHTML = `
            <strong>Microphone Permission Required</strong><br>
            <span style="font-size: 14px;">Please enable microphone access for this extension in your browser settings.</span>
            <br><br>
            <a href="chrome://settings/content/microphone" target="_blank" style="color: white; text-decoration: underline;">
                Open Settings
            </a>
        `;
        
        document.body.appendChild(errorDiv);
        
        // Auto-remove after 10 seconds
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.parentNode.removeChild(errorDiv);
            }
        }, 10000);
    }

    setupDOMObserver() {
        // Watch for DOM changes that might remove our UI
        const observer = new MutationObserver((mutations) => {
            const container = document.getElementById('meet-transcription-container');
            if (!container && this.floatingUI) {
                this.logger.warn('Content', 'Floating UI was removed, re-injecting...');
                this.createFloatingUI();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: false
        });
        
        this.logger.info('Content', 'DOM observer set up');
    }

    setupMessageListeners() {
        // Listen for messages from popup, service worker, etc.
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            this.logger.debug('Content', 'Message received', request);
            
            switch (request.type) {
                case 'START_TRANSCRIPTION':
                    this.startTranscription();
                    sendResponse({ success: true });
                    break;
                    
                case 'STOP_TRANSCRIPTION':
                    this.stopTranscription();
                    sendResponse({ success: true });
                    break;
                    
                case 'GET_STATUS':
                    sendResponse({
                        isTranscribing: this.isTranscribing,
                        hasPermission: this.checkMicPermission()
                    });
                    break;
                    
                default:
                    sendResponse({ error: 'Unknown message type' });
            }
            
            return true; // Keep message channel open for async response
        });
    }

    async startTranscription() {
        if (this.isTranscribing) {
            this.logger.warn('Content', 'Already transcribing');
            return;
        }

        try {
            this.logger.info('Content', 'Starting transcription...');
            
            // Request mic stream
            this.micStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 16000
                }
            });
            
            this.logger.info('Content', 'Microphone stream obtained');
            
            // Request tab audio from service worker
            const response = await chrome.runtime.sendMessage({
                type: 'REQUEST_TAB_AUDIO'
            });
            
            if (response.streamId) {
                this.logger.info('Content', 'Tab audio stream ID received', { streamId: response.streamId });
                // Tab audio will be handled by service worker
            }
            
            // Update UI
            if (this.floatingUI) {
                this.floatingUI.setTranscribing(true);
            }
            
            this.isTranscribing = true;
            
            // Start audio processing
            await this.startAudioProcessing();
            
        } catch (error) {
            this.logger.error('Content', 'Error starting transcription', error);
            this.stopTranscription();
        }
    }

    async startAudioProcessing() {
        try {
            // Initialize audio processor (already loaded by manifest)
            this.audioProcessor = new AudioProcessor();
            await this.audioProcessor.initialize();
            
            // Notify service worker to start mic processing
            await chrome.runtime.sendMessage({
                type: 'START_MIC_PROCESSING'
            });
            
            // Start microphone processing
            await this.audioProcessor.startMicrophoneProcessing(this.micStream);
            
            // Request tab audio stream ID from service worker
            const response = await chrome.runtime.sendMessage({
                type: 'REQUEST_TAB_AUDIO'
            });
            
            if (response.streamId) {
                // Start tab audio processing
                await this.audioProcessor.startTabAudioProcessing(response.streamId);
            }
            
            this.logger.info('Content', 'Audio processing started successfully');
        } catch (error) {
            this.logger.error('Content', 'Failed to start audio processing', error);
            throw error;
        }
    }

    stopTranscription() {
        this.logger.info('Content', 'Stopping transcription...');
        
        // Stop audio processor
        if (this.audioProcessor) {
            this.audioProcessor.stop();
            this.audioProcessor = null;
        }
        
        // Stop mic stream (backup in case audio processor didn't)
        if (this.micStream) {
            this.micStream.getTracks().forEach(track => track.stop());
            this.micStream = null;
        }
        
        // Notify service worker
        chrome.runtime.sendMessage({
            type: 'STOP_TRANSCRIPTION'
        });
        
        // Update UI
        if (this.floatingUI) {
            this.floatingUI.setTranscribing(false);
        }
        
        this.isTranscribing = false;
    }
}

// Initialize the extension
new MeetTranscriptionExtension();
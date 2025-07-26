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
        this.uiVisible = false; // Track UI visibility state
        
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

            // Load UI visibility state from storage
            await this.loadUIVisibilityState();

            // Check microphone permission status
            const permissionStatus = await this.checkMicPermission();
            
            if (!permissionStatus.granted) {
                this.logger.info('Content', 'Microphone permission not granted, requesting...');
                await this.requestMicPermission();
            } else {
                this.logger.info('Content', 'Microphone permission already granted');
                // Only create UI if it should be visible
                if (this.uiVisible) {
                    this.createFloatingUI();
                }
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

    async loadUIVisibilityState() {
        try {
            const result = await chrome.storage.local.get(['uiVisible']);
            // Default to false (hidden) if not set
            this.uiVisible = result.uiVisible === true;
            this.logger.info('Content', `UI visibility state loaded: ${this.uiVisible}`);
        } catch (error) {
            this.logger.error('Content', 'Error loading UI visibility state', error);
            this.uiVisible = false; // Default to hidden on error
        }
    }

    async saveUIVisibilityState() {
        try {
            await chrome.storage.local.set({ uiVisible: this.uiVisible });
            this.logger.info('Content', `UI visibility state saved: ${this.uiVisible}`);
        } catch (error) {
            this.logger.error('Content', 'Error saving UI visibility state', error);
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
                        // Only create UI if it should be visible
                        if (this.uiVisible) {
                            this.createFloatingUI();
                        }
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
        
        // Inject styles directly to avoid caching issues
        this.logger.info('Content', 'Starting style injection into Shadow DOM');
        const style = document.createElement('style');
        
        // Log to verify what we're about to inject
        console.log('CONTENT.JS: About to inject CSS with length:', style.textContent ? style.textContent.length : 0);
        
        style.textContent = `
            /* Yuna UI - Styles for the floating transcription widget */

            :host {
                all: initial;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
                --primary-color: #7C3AED;
                --primary-hover: #6D28D9;
                --secondary-color: #4C1D95;
                --success-color: #10B981;
                --danger-color: #EF4444;
                --warning-color: #F59E0B;
                --bg-dark: rgba(17, 24, 39, 0.95);
                --bg-darker: rgba(9, 12, 20, 0.98);
                --bg-light: rgba(255, 255, 255, 0.95);
                --text-primary: #F9FAFB;
                --text-secondary: #D1D5DB;
                --text-muted: #9CA3AF;
                --border-color: rgba(255, 255, 255, 0.1);
                --purple-gradient: linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%);
                --glass-bg: rgba(31, 41, 55, 0.8);
                --glass-border: rgba(255, 255, 255, 0.08);
            }

            * {
                box-sizing: border-box;
            }

            #floating-widget {
                position: fixed !important;
                width: 380px;
                min-height: 480px;
                max-height: 80vh;
                background: var(--bg-darker) !important;
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                border-radius: 20px;
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3), 
                            0 10px 10px -5px rgba(0, 0, 0, 0.04),
                            0 0 0 1px var(--glass-border);
                z-index: 2147483647 !important;
                display: flex !important;
                flex-direction: column;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                pointer-events: auto !important;
                visibility: visible !important;
                opacity: 1 !important;
                overflow: hidden;
            }
            
            #floating-widget.yuna-widget {
                font-size: 14px;
            }
            
            /* === FLEXIBLE HEIGHT — replaces old 600 px rule === */
            :root {
                --yuna-widget-min-h: 550px;
                --yuna-widget-max-h: 80vh;
            }
            
            #floating-widget.transcription-mode {
                min-height: var(--yuna-widget-min-h);
                max-height: var(--yuna-widget-max-h);
                height: auto;
                display: flex;
                flex-direction: column;
                overflow-x: hidden;
            }
            
            /* === INNER FLEX CHAIN (scoped) === */
            #floating-widget.transcription-mode .transcription-screen {
                display: flex;
                flex-direction: column;
                height: 100%;
            }
            
            #floating-widget.transcription-mode .transcription-section {
                flex: 1;
                margin: 8px 16px 0;
                min-height: 0;
                display: flex;
                flex-direction: column;
            }
            
            #floating-widget.transcription-mode .transcription-pane {
                flex: 1;
                display: flex;
                flex-direction: column;
                height: 100%;
            }
            
            #floating-widget.transcription-mode .transcription-content {
                flex: 1;
                overflow-y: auto;
                min-height: 0;
            }
            
            /* Critical: Constrain widget-body in transcription mode */
            #floating-widget.transcription-mode .widget-body {
                height: 100%;
                overflow: hidden;
                padding: 0; /* Remove the 20px padding that adds to height */
            }
            
            /* Override the old min-height */
            #floating-widget.transcription-mode .transcription-screen .transcription-section {
                min-height: 0 !important; /* Override the 200px minimum */
            }
            
            /* BRUTE FORCE FIX - Fixed heights with !important */
            #floating-widget.transcription-mode {
                height: 80vh !important;  /* Fixed height, not min/max */
                max-height: 80vh !important;
                overflow: hidden !important;  /* CRITICAL: Clip ALL overflow */
                position: fixed !important;
            }
            
            /* Ensure the entire chain respects the height */
            #floating-widget.transcription-mode .widget-body {
                height: calc(100% - 50px) !important;  /* Account for header */
                overflow: hidden !important;
            }
            
            /* Only the transcript content should scroll */
            #floating-widget.transcription-mode .transcription-content {
                height: 300px !important;  /* Fixed height for transcript area */
                overflow-y: auto !important;
                overflow-x: hidden !important;
            }

            #floating-widget:hover {
                opacity: 1 !important;
            }

            #floating-widget.minimized {
                min-height: auto;
                height: auto;
                width: 200px;
                overflow: hidden;
            }

            #floating-widget.minimized .widget-body {
                display: none;
            }

            #floating-widget.minimized .widget-header {
                border-radius: 16px;
            }

            /* Header */
            .widget-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 20px 24px;
                background: transparent;
                color: var(--text-primary);
                cursor: grab;
                user-select: none;
                position: relative;
                overflow: hidden;
                border-bottom: 1px solid var(--glass-border);
            }

            .widget-header::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(255, 255, 255, 0.1);
                opacity: 0;
                transition: opacity 0.3s ease;
            }

            .widget-header:hover::before {
                opacity: 1;
            }

            .widget-header:active {
                cursor: grabbing;
            }

            .header-title {
                display: flex;
                align-items: center;
                gap: 10px;
                font-weight: 600;
                font-size: 15px;
                letter-spacing: 0.3px;
            }

            .status-indicator {
                width: 10px;
                height: 10px;
                border-radius: 50%;
                background: var(--text-muted);
                transition: all 0.3s ease;
                box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.2);
            }

            .status-indicator.active {
                background: var(--success-color);
                box-shadow: 0 0 0 2px rgba(59, 165, 92, 0.3),
                            0 0 10px rgba(59, 165, 92, 0.5);
                animation: pulse 2s infinite;
            }

            @keyframes pulse {
                0% { opacity: 1; }
                50% { opacity: 0.5; }
                100% { opacity: 1; }
            }

            .header-controls {
                display: flex;
                gap: 4px;
            }

            .control-btn {
                width: 32px;
                height: 32px;
                border: none;
                background: rgba(255, 255, 255, 0.1);
                color: var(--text-primary);
                border-radius: 8px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.3s ease;
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
            }

            .control-btn:hover {
                background: rgba(255, 255, 255, 0.2);
                transform: scale(1.1);
            }

            .control-btn:active {
                transform: scale(0.95);
            }

            /* Body */
            .widget-body {
                flex: 1;
                display: flex;
                flex-direction: column;
                padding: 20px;
                background: transparent;
                overflow: hidden;
                color: #FFFFFF !important; /* Ensure text is visible */
            }

            /* Controls Section */
            .controls-section {
                display: flex;
                flex-direction: column;
                gap: 12px;
                margin-bottom: 16px;
            }

            .primary-btn {
                padding: 12px 24px;
                border: none;
                background: linear-gradient(135deg, #5865F2, #4752C4) !important;
                color: #FFFFFF !important;
                border-radius: 10px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                position: relative;
                overflow: hidden;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            .primary-btn::before {
                content: '';
                position: absolute;
                top: 0;
                left: -100%;
                width: 100%;
                height: 100%;
                background: rgba(255, 255, 255, 0.2);
                transition: left 0.3s ease;
            }

            .primary-btn:hover::before {
                left: 100%;
            }

            .primary-btn:hover {
                background: linear-gradient(135deg, #4350E8, #363CC0);
                transform: translateY(-1px);
                box-shadow: 0 4px 12px rgba(88, 101, 242, 0.4);
            }

            .primary-btn.recording {
                background: linear-gradient(135deg, var(--danger-color), #C42B2F);
                animation: recording-pulse 1.5s ease-in-out infinite;
            }

            @keyframes recording-pulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.02); }
            }

            .primary-btn.recording:hover {
                background: linear-gradient(135deg, #E53935, #B71C1C);
            }

            /* Audio Indicators */
            .audio-indicators {
                display: flex;
                gap: 12px;
                margin-top: 12px;
            }

            .indicator {
                flex: 1;
                background: rgba(255, 255, 255, 0.05);
                padding: 10px 14px;
                border-radius: 10px;
                border: 1px solid var(--border-color);
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
                transition: all 0.3s ease;
            }

            .indicator:hover {
                background: rgba(255, 255, 255, 0.08);
                border-color: rgba(255, 255, 255, 0.2);
            }

            .indicator-label {
                font-size: 11px;
                color: var(--text-secondary);
                display: block;
                margin-bottom: 6px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                font-weight: 600;
            }

            .level-meter {
                height: 6px;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 3px;
                overflow: hidden;
                position: relative;
            }

            .level-bar {
                height: 100%;
                width: 0;
                background: linear-gradient(90deg, var(--primary-color), var(--success-color));
                transition: width 0.1s ease;
                border-radius: 3px;
                box-shadow: 0 0 10px rgba(88, 101, 242, 0.5);
            }

            /* Transcription Section */
            .transcription-section {
                flex: 1;
                display: flex;
                gap: 16px;
                min-height: 0;
                margin-top: 16px;
                overflow: hidden;
            }

            .transcription-pane {
                flex: 1;
                background: rgba(255, 255, 255, 0.05) !important;
                border: 1px solid rgba(255, 255, 255, 0.1) !important;
                border-radius: 12px;
                padding: 16px;
                display: flex;
                flex-direction: column;
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
                transition: all 0.3s ease;
                min-height: 0;
            }
            
            .transcription-pane.unified {
                width: 100%;
            }

            .transcription-pane:hover {
                background: rgba(255, 255, 255, 0.08);
                border-color: rgba(255, 255, 255, 0.2);
            }

            .pane-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 12px;
            }

            .transcription-pane h3 {
                margin: 0;
                font-size: 12px;
                font-weight: 700;
                color: var(--text-secondary);
                text-transform: uppercase;
                letter-spacing: 1px;
                opacity: 0.8;
            }

            .clear-btn {
                width: 24px;
                height: 24px;
                border: none;
                background: rgba(255, 255, 255, 0.05);
                color: var(--text-muted);
                border-radius: 6px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.3s ease;
                opacity: 0.6;
            }

            .clear-btn:hover {
                background: rgba(255, 255, 255, 0.1);
                color: var(--text-secondary);
                opacity: 1;
                transform: scale(1.1);
            }

            .clear-btn:active {
                transform: scale(0.95);
            }

            .transcription-content {
                flex: 1;
                overflow-y: auto;
                font-size: 14px;
                line-height: 1.6;
                color: var(--text-primary);
                padding-right: 8px;
            }

            .transcription-content::-webkit-scrollbar {
                width: 8px;
            }

            .transcription-content::-webkit-scrollbar-track {
                background: rgba(255, 255, 255, 0.05);
                border-radius: 4px;
            }

            .transcription-content::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.2);
                border-radius: 4px;
                transition: background 0.3s ease;
            }

            .transcription-content::-webkit-scrollbar-thumb:hover {
                background: rgba(255, 255, 255, 0.3);
            }

            .transcription-entry {
                margin-bottom: 12px;
                padding: 10px 16px;
                background: rgba(255, 255, 255, 0.03);
                border-radius: 8px;
                transition: all 0.2s ease;
                animation: slideIn 0.3s ease-out;
                line-height: 1.5;
            }

            .transcription-entry:hover {
                background: rgba(255, 255, 255, 0.06);
                transform: translateX(2px);
            }

            .transcription-entry.interim {
                opacity: 0.7;
                background: rgba(255, 255, 255, 0.02);
                border: 1px dashed rgba(255, 255, 255, 0.2);
            }

            .timestamp {
                display: inline-block;
                font-size: 11px;
                color: var(--text-muted);
                margin-right: 8px;
                font-weight: 500;
            }
            
            .speaker {
                display: inline-block;
                font-weight: 600;
                margin-right: 8px;
                font-size: 13px;
            }
            
            .speaker-provider {
                color: #5865F2; /* Blue for Provider */
            }
            
            .speaker-client {
                color: #3BA55C; /* Green for Client */
            }

            .transcription-text {
                display: inline;
                color: var(--text-primary);
                word-wrap: break-word;
            }

            @keyframes slideIn {
                from {
                    opacity: 0;
                    transform: translateY(10px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }

            .placeholder {
                color: var(--text-muted);
                font-style: italic;
                text-align: center;
                padding: 20px;
                opacity: 0.6;
            }


            /* Log Section */
            .log-section {
                margin-top: 12px;
                background: rgba(255, 255, 255, 0.05);
                border-radius: 10px;
                border: 1px solid var(--border-color);
                overflow: hidden;
                transition: all 0.3s ease;
                backdrop-filter: blur(10px);
            }

            .log-section.collapsed {
                height: 36px;
            }

            .log-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 8px 12px;
                background: rgba(255, 255, 255, 0.05);
                border-bottom: 1px solid var(--border-color);
            }

            .toggle-btn {
                display: flex;
                align-items: center;
                gap: 4px;
                border: none;
                background: none;
                font-size: 12px;
                color: var(--text-secondary);
                cursor: pointer;
            }

            .toggle-btn svg {
                transition: transform 0.3s ease;
            }

            .log-section:not(.collapsed) .toggle-btn svg {
                transform: rotate(180deg);
            }

            .export-btn {
                padding: 4px 8px;
                border: 1px solid var(--border-color);
                background: rgba(255, 255, 255, 0.05);
                border-radius: 4px;
                font-size: 11px;
                color: var(--text-secondary);
                cursor: pointer;
                transition: all 0.2s ease;
            }

            .export-btn:hover {
                background: rgba(255, 255, 255, 0.1);
                border-color: rgba(255, 255, 255, 0.2);
            }

            .log-content {
                height: 150px;
                overflow-y: auto;
                padding: 8px 12px;
                font-family: 'Consolas', 'Monaco', monospace;
                font-size: 11px;
                line-height: 1.4;
                background: rgba(0, 0, 0, 0.2);
            }

            .log-entry {
                margin-bottom: 4px;
                display: flex;
                gap: 8px;
                color: var(--text-secondary);
            }

            .log-time {
                color: var(--text-muted);
            }

            .log-level {
                font-weight: 500;
            }

            .log-entry.debug .log-level { color: var(--text-muted); }
            .log-entry.info .log-level { color: #2196f3; }
            .log-entry.warn .log-level { color: var(--warning-color); }
            .log-entry.error .log-level { color: var(--danger-color); }

            .log-component {
                color: var(--primary-color);
            }

            .log-message {
                flex: 1;
                color: var(--text-secondary);
            }

            /* Settings Modal */
            .settings-modal {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.8);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 2147483648;
                backdrop-filter: blur(10px);
            }

            .modal-content {
                background: var(--bg-dark);
                padding: 24px;
                border-radius: 12px;
                width: 400px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
                border: 1px solid var(--border-color);
            }

            .modal-content h2 {
                margin: 0 0 20px 0;
                font-size: 18px;
                color: var(--text-primary);
            }

            .setting-group {
                margin-bottom: 16px;
            }

            .setting-group label {
                display: block;
                margin-bottom: 8px;
                font-size: 14px;
                color: var(--text-secondary);
            }

            .setting-group input[type="password"],
            .setting-group input[type="text"] {
                width: 100%;
                padding: 8px 12px;
                border: 1px solid var(--border-color);
                background: rgba(255, 255, 255, 0.05);
                color: var(--text-primary);
                border-radius: 6px;
                font-size: 14px;
                margin-bottom: 8px;
            }

            .setting-group input:focus {
                outline: none;
                border-color: var(--primary-color);
                background: rgba(255, 255, 255, 0.1);
            }

            .setting-group button {
                padding: 8px 16px;
                border: none;
                background: var(--primary-color);
                color: white;
                border-radius: 6px;
                font-size: 14px;
                cursor: pointer;
                transition: all 0.2s ease;
            }

            .setting-group button:hover {
                background: var(--secondary-color);
                transform: translateY(-1px);
            }

            .close-btn {
                width: 100%;
                padding: 10px;
                border: 1px solid var(--border-color);
                background: rgba(255, 255, 255, 0.05);
                color: var(--text-secondary);
                border-radius: 6px;
                font-size: 14px;
                cursor: pointer;
                margin-top: 12px;
                transition: all 0.2s ease;
            }

            .close-btn:hover {
                background: rgba(255, 255, 255, 0.1);
                border-color: rgba(255, 255, 255, 0.2);
            }

            /* Resize Handle */
            .resize-handle {
                position: absolute;
                bottom: 0;
                right: 0;
                width: 16px;
                height: 16px;
                cursor: nwse-resize;
            }

            .resize-handle::after {
                content: '';
                position: absolute;
                bottom: 3px;
                right: 3px;
                width: 6px;
                height: 6px;
                border-right: 2px solid var(--text-muted);
                border-bottom: 2px solid var(--text-muted);
            }
            
            /* Yuna-specific styles */
            .yuna-logo {
                width: 24px;
                height: 24px;
                background: var(--purple-gradient);
                border-radius: 6px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-weight: 700;
                font-size: 14px;
                color: white;
                margin-right: 8px;
            }
            
            .yuna-avatar-section {
                display: flex;
                justify-content: center;
                padding: 40px 0 30px;
            }
            
            .yuna-avatar {
                width: 120px;
                height: 120px;
                background: var(--purple-gradient);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 8px 16px rgba(124, 58, 237, 0.3);
            }
            
            .avatar-icon {
                font-size: 48px;
                font-weight: 700;
                color: white;
            }
            
            /* Section styles */
            .section-title {
                font-size: 11px;
                font-weight: 600;
                letter-spacing: 1.5px;
                text-transform: uppercase;
                color: var(--text-muted);
                margin: 0 0 12px 0;
            }
            
            .context-section,
            .settings-section {
                padding: 0 24px 24px;
            }
            
            .context-btn {
                width: 100%;
                padding: 16px;
                background: var(--glass-bg);
                border: 1px solid var(--glass-border);
                border-radius: 12px;
                color: var(--text-secondary);
                font-size: 14px;
                cursor: pointer;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .context-btn:hover {
                background: rgba(124, 58, 237, 0.1);
                border-color: rgba(124, 58, 237, 0.3);
                color: var(--text-primary);
            }
            
            .plus-icon {
                width: 20px;
                height: 20px;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 50%;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-size: 16px;
            }
            
            .settings-link {
                background: none;
                border: none;
                color: var(--text-muted);
                font-size: 13px;
                cursor: pointer;
                padding: 0;
                text-decoration: underline;
                transition: color 0.2s ease;
            }
            
            .settings-link:hover {
                color: var(--text-secondary);
            }
            
            .action-section {
                padding: 24px;
                margin-top: auto;
                border-top: 1px solid var(--glass-border);
            }
            
            .start-encounter-btn {
                width: 100%;
                padding: 16px;
                background: var(--purple-gradient);
                border: none;
                border-radius: 12px;
                color: white;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 4px 12px rgba(124, 58, 237, 0.3);
            }
            
            .start-encounter-btn:hover {
                transform: translateY(-1px);
                box-shadow: 0 6px 20px rgba(124, 58, 237, 0.4);
            }
            
            /* Context screen styles */
            .context-screen .widget-body {
                display: flex;
                flex-direction: column;
            }
            
            .context-input-section {
                padding: 0 24px;
                flex: 1;
            }
            
            .context-input-wrapper {
                position: relative;
            }
            
            .context-textarea {
                width: 100%;
                padding: 16px;
                padding-right: 48px;
                background: var(--glass-bg);
                border: 1px solid var(--glass-border);
                border-radius: 12px;
                color: var(--text-primary);
                font-size: 14px;
                resize: none;
                transition: all 0.2s ease;
                line-height: 1.5;
            }
            
            .context-textarea:focus {
                outline: none;
                border-color: rgba(124, 58, 237, 0.5);
                background: rgba(124, 58, 237, 0.05);
            }
            
            .context-textarea::placeholder {
                color: var(--text-muted);
            }
            
            .mic-icon {
                position: absolute;
                right: 16px;
                top: 50%;
                transform: translateY(-50%);
                pointer-events: none;
            }
            
            /* Transcription screen styles */
            .transcription-screen {
                display: flex;
                flex-direction: column;
                height: 100%;
            }
            
            .patient-context-box {
                margin: 16px 16px 0;
                padding: 16px;
                background: var(--glass-bg);
                border: 1px solid var(--glass-border);
                border-radius: 12px;
            }
            
            .patient-context-box h4 {
                margin: 0 0 8px 0;
                font-size: 12px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                color: var(--text-muted);
            }
            
            .patient-context-box p {
                margin: 0;
                font-size: 14px;
                color: var(--text-secondary);
                line-height: 1.5;
            }
            
            .permission-notice {
                margin: 16px;
                padding: 12px 16px;
                background: rgba(245, 158, 11, 0.1);
                border: 1px solid rgba(245, 158, 11, 0.3);
                border-radius: 8px;
                font-size: 13px;
                color: var(--warning-color);
                text-align: center;
            }
            
            .transcription-screen .transcription-section {
                flex: 1;
                margin: 16px;
                min-height: 200px;
            }
            
            .transcription-screen .transcription-pane {
                height: 100%;
                background: var(--glass-bg);
                border-color: var(--glass-border);
            }
            
            .transcription-screen .controls-section {
                padding: 16px;
                border-top: 1px solid var(--glass-border);
                margin: 0;
            }
            
            .end-session-btn {
                width: 100%;
                padding: 12px;
                background: rgba(239, 68, 68, 0.1);
                border: 1px solid rgba(239, 68, 68, 0.3);
                border-radius: 10px;
                color: var(--danger-color);
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            
            .end-session-btn:hover {
                background: rgba(239, 68, 68, 0.2);
                transform: translateY(-1px);
            }
            
            /* Update transcription entry styles */
            .transcription-entry {
                margin-bottom: 16px;
                padding: 12px 16px;
                background: rgba(255, 255, 255, 0.02);
                border-radius: 8px;
                border-left: none;
                transition: all 0.2s ease;
                animation: slideIn 0.3s ease-out;
                line-height: 1.6;
            }
            
            .transcription-entry .timestamp {
                display: inline-block;
                font-size: 11px;
                color: var(--text-muted);
                margin-right: 12px;
                font-family: 'SF Mono', Monaco, monospace;
            }
            
            .transcription-entry .speaker {
                display: inline-block;
                font-weight: 600;
                margin-right: 8px;
                font-size: 13px;
            }
            
            .transcription-entry .speaker-provider {
                color: #818CF8;
            }
            
            .transcription-entry .speaker-client {
                color: #34D399;
            }
            
            /* Update audio indicators */
            .transcription-screen .audio-indicators {
                display: flex;
                gap: 12px;
                margin: 0 16px 16px;
            }
            
            .transcription-screen .indicator {
                background: var(--glass-bg);
                border-color: var(--glass-border);
            }
            
            /* Update primary button styles */
            .primary-btn {
                padding: 12px 24px;
                border: none;
                background: var(--purple-gradient);
                color: white;
                border-radius: 10px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                position: relative;
                overflow: hidden;
                text-transform: none;
                letter-spacing: normal;
            }
            
            .primary-btn:hover {
                background: var(--purple-gradient);
                transform: translateY(-1px);
                box-shadow: 0 4px 12px rgba(124, 58, 237, 0.4);
            }
        `;
        
        // Log the actual CSS content length and first few characters
        console.log('CONTENT.JS: CSS length after assignment:', style.textContent.length);
        console.log('CONTENT.JS: First 200 chars of CSS:', style.textContent.substring(0, 200));
        console.log('CONTENT.JS: CSS contains dark background?', style.textContent.includes('rgba(32, 34, 37, 0.95)'));
        
        shadow.appendChild(style);
        this.logger.info('Content', 'Style element appended to shadow DOM', {
            styleLength: style.textContent.length,
            shadowChildren: shadow.children.length
        });
        
        // Verify the style element is actually in the shadow DOM
        console.log('CONTENT.JS: Style elements in shadow after append:', shadow.querySelectorAll('style').length);
        
        // Append container to body first
        document.body.appendChild(container);
        this.logger.info('Content', 'Container appended to body');
        
        // Initialize floating UI after a delay to ensure styles are processed
        setTimeout(() => {
            try {
                // Force style recalculation
                shadow.offsetHeight;
                
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
        }, 200); // Increased delay to ensure styles are processed
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
                    
                case 'PERMISSION_GRANTED':
                    this.logger.info('Content', 'Tab permission granted, can now capture tab audio');
                    
                    // Show a notification to the user
                    const notificationDiv = document.createElement('div');
                    notificationDiv.style.cssText = `
                        position: fixed;
                        top: 20px;
                        right: 20px;
                        background: #4caf50;
                        color: white;
                        padding: 16px 24px;
                        border-radius: 8px;
                        z-index: 2147483647;
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
                        font-size: 14px;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                    `;
                    notificationDiv.textContent = 'Tab audio permission granted!';
                    document.body.appendChild(notificationDiv);
                    
                    // If we're currently transcribing, retry tab audio capture
                    if (this.isTranscribing && this.audioProcessor && !this.audioProcessor.tabStream) {
                        this.logger.info('Content', 'Retrying tab audio capture after permission grant');
                        notificationDiv.textContent += ' Enabling audio from others...';
                        
                        // Request tab audio again
                        chrome.runtime.sendMessage({
                            type: 'REQUEST_TAB_AUDIO'
                        }).then(async (response) => {
                            if (response && response.streamId) {
                                this.logger.info('Content', 'Tab audio retry successful', { streamId: response.streamId });
                                
                                try {
                                    // Start tab audio processing
                                    await this.audioProcessor.startTabAudioProcessing(response.streamId);
                                    notificationDiv.textContent = 'Tab audio permission granted! Now recording audio from others.';
                                    notificationDiv.style.background = '#2196f3';
                                } catch (error) {
                                    this.logger.error('Content', 'Failed to start tab audio after retry', error);
                                }
                            } else {
                                this.logger.error('Content', 'Tab audio retry failed', response);
                            }
                        });
                    }
                    
                    setTimeout(() => {
                        if (notificationDiv.parentNode) {
                            notificationDiv.parentNode.removeChild(notificationDiv);
                        }
                    }, 4000);
                    
                    sendResponse({ success: true });
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
            
            this.logger.info('Content', 'Tab audio request response:', {
                success: response?.success,
                hasStreamId: !!response?.streamId,
                error: response?.error,
                fullResponse: JSON.stringify(response)
            });
            
            if (response.success) {
                console.log('[Content] Tab audio capture response:', {
                    success: response.success,
                    message: response.message,
                    receiveTime: Date.now(),
                    context: 'content-script'
                });
                
                this.logger.info('Content', 'Tab audio capture started in service worker');
                // Tab audio is now being processed entirely in the service worker
            } else if (response.error) {
                this.logger.error('Content', 'Tab audio capture failed', { error: response.error });
                
                // Show error to user if it's a permission issue
                if (response.error.includes('permission not granted') || response.error.includes('not been invoked')) {
                    const errorDiv = document.createElement('div');
                    errorDiv.style.cssText = `
                        position: fixed;
                        bottom: 20px;
                        right: 20px;
                        background: #ff9800;
                        color: white;
                        padding: 16px 24px;
                        border-radius: 8px;
                        z-index: 2147483647;
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
                        font-size: 14px;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                        max-width: 400px;
                    `;
                    errorDiv.innerHTML = `
                        <strong>Tab Audio Permission Required</strong><br>
                        <span style="font-size: 13px;">Click the extension icon in the toolbar to grant permission for capturing audio from others in this meeting.</span>
                    `;
                    document.body.appendChild(errorDiv);
                    
                    setTimeout(() => {
                        if (errorDiv.parentNode) {
                            errorDiv.parentNode.removeChild(errorDiv);
                        }
                    }, 6000);
                }
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
            
            this.logger.info('Content', 'AudioProcessor tab audio request response:', {
                success: response?.success,
                hasStreamId: !!response?.streamId,
                streamId: response?.streamId,
                error: response?.error
            });
            
            if (response.success) {
                console.log('[Content] Tab audio is being processed in service worker');
                this.logger.info('Content', 'Tab audio processing delegated to service worker');
                // Tab audio is now handled entirely in the service worker
                // No need to process it in the content script
            } else {
                this.logger.error('Content', 'Cannot start tab audio processing', {
                    error: response.error
                });
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
// floating-ui.js - Floating UI component for transcription display

class FloatingUI {
    constructor(shadowRoot, contentScript) {
        this.shadowRoot = shadowRoot;
        this.contentScript = contentScript;
        this.logger = window.logger;
        this.isMinimized = false;
        this.isDragging = false;
        this.dragOffset = { x: 0, y: 0 };
        this.position = { x: 20, y: 20 };
        this.transcriptions = {
            user: [],
            others: []
        };
        this.hasTabPermission = false;
        
        // Yuna UI state management
        this.currentScreen = 'initial'; // 'initial', 'context', 'transcription'
        this.sessionContext = ''; // Store patient context
        
        this.logger.info('FloatingUI', 'Initializing floating UI');
        
        // Debug: Check what styles are in the shadow root
        const styles = this.shadowRoot.querySelectorAll('style');
        const links = this.shadowRoot.querySelectorAll('link');
        
        console.log('FLOATING-UI: Found styles in shadow:', styles.length);
        if (styles[0]) {
            console.log('FLOATING-UI: First style content preview:', styles[0].textContent.substring(0, 200));
            console.log('FLOATING-UI: Style contains dark bg?', styles[0].textContent.includes('rgba(32, 34, 37, 0.95)'));
        }
        
        this.logger.info('FloatingUI', 'Shadow DOM style elements', {
            styleCount: styles.length,
            linkCount: links.length,
            firstStyleLength: styles[0] ? styles[0].textContent.length : 0
        });
        
        // Force browser to process styles before rendering
        this.shadowRoot.offsetHeight;
        
        this.render();
        
        // Set up delegated event listeners (survives all re-renders)
        this.setupDelegatedListeners();
        
        // Set up transcription message listener
        this.setupTranscriptionListener();
        
        this.logger.info('FloatingUI', 'Yuna UI initialized with delegated listeners');
    }

    render() {
        // Save existing style elements before innerHTML wipes them out
        const existingStyles = Array.from(this.shadowRoot.querySelectorAll('style'));
        
        // Render appropriate screen based on current state
        if (this.currentScreen === 'initial') {
            this.renderInitialScreen();
        } else if (this.currentScreen === 'context') {
            this.renderContextScreen();
        } else if (this.currentScreen === 'transcription') {
            this.renderTranscriptionScreen();
        }
        
        // Re-append the saved style elements
        existingStyles.forEach(style => {
            this.shadowRoot.appendChild(style);
        });
        
        this.widget = this.shadowRoot.getElementById('floating-widget');
        this.logger.info('FloatingUI', `UI rendered - screen: ${this.currentScreen}`);
    }

    renderInitialScreen() {
        const html = `
            <div id="floating-widget" class="yuna-widget" style="left: ${this.position.x}px; top: ${this.position.y}px; display: block !important; visibility: visible !important;">
                <div class="widget-header">
                    <div class="header-title">
                        <span class="yuna-logo">Y</span>
                        <span class="title-text">Yuna</span>
                    </div>
                    <div class="header-controls">
                        <button data-action="minimize" class="control-btn" title="Minimize">
                            <svg width="16" height="16" viewBox="0 0 16 16">
                                <path d="M4 8h8v1H4z" fill="currentColor"/>
                            </svg>
                        </button>
                    </div>
                </div>
                
                <div class="widget-body initial-screen">
                    <div class="yuna-avatar-section">
                        <div class="yuna-avatar">
                            <span class="avatar-icon">Y</span>
                        </div>
                    </div>
                    
                    <div class="context-section">
                        <h3 class="section-title">CONTEXT</h3>
                        <button data-action="add-context" class="context-btn">
                            <span class="plus-icon">+</span>
                            Add context
                        </button>
                    </div>
                    
                    <div class="settings-section">
                        <h3 class="section-title">SETTINGS</h3>
                        <button data-action="open-settings" class="settings-link">
                            Configure API key and preferences
                        </button>
                    </div>
                    
                    <div class="action-section">
                        <button data-action="start-encounter" class="primary-btn start-encounter-btn">
                            <svg width="16" height="16" viewBox="0 0 16 16" style="margin-right: 8px;">
                                <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z" fill="currentColor"/>
                            </svg>
                            Start encounter
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        this.shadowRoot.innerHTML = html;
    }

    renderContextScreen() {
        const html = `
            <div id="floating-widget" class="yuna-widget" style="left: ${this.position.x}px; top: ${this.position.y}px; display: block !important; visibility: visible !important;">
                <div class="widget-header">
                    <div class="header-title">
                        <span class="yuna-logo">Y</span>
                        <span class="title-text">Yuna</span>
                    </div>
                    <div class="header-controls">
                        <button data-action="back-to-initial" class="control-btn" title="Back">
                            <svg width="16" height="16" viewBox="0 0 16 16">
                                <path d="M11 8H5.41l2.3-2.29a1 1 0 1 0-1.42-1.42l-4 4a1 1 0 0 0 0 1.42l4 4a1 1 0 0 0 1.42-1.42L5.41 10H11a1 1 0 0 0 0-2z" fill="currentColor"/>
                            </svg>
                        </button>
                    </div>
                </div>
                
                <div class="widget-body context-screen">
                    <div class="yuna-avatar-section">
                        <div class="yuna-avatar">
                            <span class="avatar-icon">Y</span>
                        </div>
                    </div>
                    
                    <div class="context-input-section">
                        <h3 class="section-title">CONTEXT</h3>
                        <div class="context-input-wrapper">
                            <textarea 
                                id="context-textarea"
                                class="context-textarea"
                                placeholder="Patient name, age, presenting concerns, session type..."
                                rows="4"
                            >${this.sessionContext}</textarea>
                            <div class="mic-icon">
                                <svg width="20" height="20" viewBox="0 0 20 20">
                                    <path d="M10 12a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v4a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H3a7 7 0 0 0 6 6.93V19h2v-3.07A7 7 0 0 0 17 9h-2z" fill="currentColor" opacity="0.5"/>
                                </svg>
                            </div>
                        </div>
                    </div>
                    
                    <div class="action-section">
                        <button data-action="start-encounter" class="primary-btn start-encounter-btn">
                            <svg width="16" height="16" viewBox="0 0 16 16" style="margin-right: 8px;">
                                <path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z" fill="currentColor"/>
                            </svg>
                            Start encounter
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        this.shadowRoot.innerHTML = html;
        
        // Set up context textarea listener
        const textarea = this.shadowRoot.getElementById('context-textarea');
        if (textarea) {
            textarea.addEventListener('input', (e) => {
                this.sessionContext = e.target.value;
            });
        }
    }

    renderTranscriptionScreen() {
        const html = `
            <div id="floating-widget" class="yuna-widget transcription-mode" style="left: ${this.position.x}px; top: ${this.position.y}px; display: block !important; visibility: visible !important;">
                <div class="widget-header">
                    <div class="header-title">
                        <span class="status-indicator active"></span>
                        <span class="yuna-logo">Y</span>
                        <span class="title-text">Yuna</span>
                    </div>
                    <div class="header-controls">
                        <button data-action="minimize" class="control-btn" title="Minimize">
                            <svg width="16" height="16" viewBox="0 0 16 16">
                                <path d="M4 8h8v1H4z" fill="currentColor"/>
                            </svg>
                        </button>
                    </div>
                </div>
                
                <div class="widget-body transcription-screen">
                    ${this.sessionContext ? `
                        <div class="patient-context-box">
                            <h4>Patient context</h4>
                            <p>${this.sessionContext}</p>
                        </div>
                    ` : ''}
                    
                    ${!this.hasTabPermission ? `
                        <div id="permission-notice" class="permission-notice">
                            ⚠️ Click extension icon to enable audio from others
                        </div>
                    ` : ''}
                    
                    <div class="transcription-section">
                        <div class="transcription-pane unified">
                            <div class="pane-header">
                                <h3>Transcript</h3>
                                <button data-action="clear-transcript" class="clear-btn" title="Clear">
                                    <svg width="14" height="14" viewBox="0 0 14 14">
                                        <path d="M14 1.41L12.59 0L7 5.59L1.41 0L0 1.41L5.59 7L0 12.59L1.41 14L7 8.41L12.59 14L14 12.59L8.41 7L14 1.41Z" fill="currentColor"/>
                                    </svg>
                                </button>
                            </div>
                            <div class="transcription-content" id="unified-transcription">
                                <p class="placeholder">Transcription will appear here...</p>
                            </div>
                        </div>
                    </div>
                    
                    <div class="audio-indicators">
                        <div class="indicator" id="mic-indicator">
                            <span class="indicator-label">Your mic</span>
                            <div class="level-meter">
                                <div class="level-bar"></div>
                            </div>
                        </div>
                        <div class="indicator" id="tab-indicator">
                            <span class="indicator-label">Client audio</span>
                            <div class="level-meter">
                                <div class="level-bar"></div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="controls-section">
                        <button data-action="end-session" class="primary-btn end-session-btn">
                            End session
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        this.shadowRoot.innerHTML = html;
    }

    setupDelegatedListeners() {
        // Single click handler for all buttons using event delegation
        this.shadowRoot.addEventListener('click', (e) => {
            // Handle button clicks by data-action attribute
            const button = e.target.closest('button[data-action]');
            if (button) {
                e.preventDefault();
                e.stopPropagation();
                
                const action = button.dataset.action;
                this.logger.info('FloatingUI', `Button clicked: ${action}`);
                
                switch(action) {
                    case 'add-context':
                        this.currentScreen = 'context';
                        this.render();
                        break;
                        
                    case 'back-to-initial':
                        this.currentScreen = 'initial';
                        this.render();
                        break;
                        
                    case 'start-encounter':
                        // If we're on context screen, grab the textarea value first
                        if (this.currentScreen === 'context') {
                            const textarea = this.shadowRoot.getElementById('context-textarea');
                            if (textarea) {
                                this.sessionContext = textarea.value;
                            }
                        }
                        
                        if (this.sessionContext.trim()) {
                            this.currentScreen = 'transcription';
                            this.render();
                            this.contentScript.startTranscription();
                        } else {
                            // If no context, go to context screen
                            this.currentScreen = 'context';
                            this.render();
                        }
                        break;
                        
                    case 'end-session':
                        this.contentScript.stopTranscription();
                        this.currentScreen = 'initial';
                        this.sessionContext = '';
                        this.render();
                        break;
                        
                    case 'open-settings':
                        this.openSettings();
                        break;
                        
                    case 'minimize':
                        this.toggleMinimize();
                        break;
                        
                    case 'clear-transcript':
                        this.clearTranscription('unified-transcription');
                        break;
                        
                    case 'toggle-logs':
                        this.toggleLogs();
                        break;
                        
                    case 'export-logs':
                        this.exportLogs();
                        break;
                }
            }
        });
        
        // Keep existing drag functionality
        document.addEventListener('mousemove', this.drag.bind(this));
        document.addEventListener('mouseup', this.stopDrag.bind(this));
        
        // Drag handler for header (delegated)
        this.shadowRoot.addEventListener('mousedown', (e) => {
            const header = e.target.closest('.widget-header');
            if (header && !e.target.closest('.control-btn')) {
                this.startDrag(e);
            }
        });
        
        this.logger.info('FloatingUI', 'Delegated event listeners attached');
    }

    setupEventListeners() {
        // Get all elements first and verify they exist
        const header = this.shadowRoot.querySelector('.widget-header');
        const minimizeBtn = this.shadowRoot.getElementById('minimize-btn');
        const settingsBtn = this.shadowRoot.getElementById('settings-btn');
        const startStopBtn = this.shadowRoot.getElementById('start-stop-btn');
        const toggleLogsBtn = this.shadowRoot.getElementById('toggle-logs');
        const exportLogsBtn = this.shadowRoot.getElementById('export-logs');
        
        // Log what we found
        this.logger.debug('FloatingUI', 'Elements found', {
            header: !!header,
            minimizeBtn: !!minimizeBtn,
            settingsBtn: !!settingsBtn,
            startStopBtn: !!startStopBtn,
            toggleLogsBtn: !!toggleLogsBtn,
            exportLogsBtn: !!exportLogsBtn
        });
        
        // Drag functionality
        if (header) {
            header.addEventListener('mousedown', this.startDrag.bind(this));
        }
        
        // Control buttons
        if (minimizeBtn) {
            minimizeBtn.addEventListener('click', (e) => {
                this.logger.info('FloatingUI', 'Minimize button clicked');
                this.toggleMinimize();
            });
        }
        
        if (settingsBtn) {
            settingsBtn.addEventListener('click', (e) => {
                this.logger.info('FloatingUI', 'Settings button clicked');
                this.openSettings();
            });
        }
        
        // Start/Stop button
        if (startStopBtn) {
            startStopBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.logger.info('FloatingUI', 'Start/Stop button clicked');
                this.toggleRecording();
            });
            
            // Also add pointer-events to ensure it's clickable
            startStopBtn.style.pointerEvents = 'auto';
        }
        
        // Log controls
        if (toggleLogsBtn) {
            toggleLogsBtn.addEventListener('click', (e) => {
                this.logger.info('FloatingUI', 'Toggle logs button clicked');
                this.toggleLogs();
            });
        }
        
        if (exportLogsBtn) {
            exportLogsBtn.addEventListener('click', (e) => {
                this.logger.info('FloatingUI', 'Export logs button clicked');
                this.exportLogs();
            });
        }
        
        // Global mouse events for dragging
        document.addEventListener('mousemove', this.drag.bind(this));
        document.addEventListener('mouseup', this.stopDrag.bind(this));
        
        // Clear buttons
        const clearButtons = this.shadowRoot.querySelectorAll('.clear-btn');
        clearButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetId = btn.getAttribute('data-target');
                this.clearTranscription(targetId);
            });
        });
    }
    
    clearTranscription(targetId) {
        const element = this.shadowRoot.getElementById(targetId);
        if (element) {
            element.innerHTML = '<p class="placeholder">Transcription will appear here...</p>';
            this.logger.info('FloatingUI', `Cleared transcriptions for ${targetId}`);
        }
    }

    setupTranscriptionListener() {
        // Listen for transcription updates from service worker
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.type === 'TRANSCRIPTION_UPDATE') {
                if (request.source === 'others') {
                    this.logger.info('FloatingUI', 'Received OTHERS transcription message', {
                        source: request.source,
                        text: request.text.substring(0, 50) + '...',
                        isFinal: request.isFinal
                    });
                }
                this.updateTranscription(request.source, request.text, request.isFinal);
            } else if (request.type === 'AUDIO_LEVEL_UPDATE') {
                this.updateAudioLevel(request.source, request.level);
            } else if (request.type === 'CONNECTION_STATUS') {
                this.updateConnectionStatus(request.status, request.message);
            } else if (request.type === 'PERMISSION_GRANTED') {
                this.logger.info('FloatingUI', 'Tab permission granted notification received');
                this.setTabPermission(true);
            } else if (request.type === 'AUDIO_ERROR') {
                this.logger.error('FloatingUI', `Audio error for ${request.source}:`, request.error);
                this.updateConnectionStatus('error', `${request.source === 'tab' ? 'Tab' : 'Mic'} audio error: ${request.error}`);
                // Add error indication to UI
                if (request.source === 'tab') {
                    this.setTabPermission(false, request.error);
                }
            } else if (request.type === 'FALLBACK_MODE') {
                this.logger.info('FloatingUI', 'Fallback mode notification', request);
                this.showFallbackNotice(request.message, request.transcriptionEnabled);
            }
        });
        
        // Listen for log updates
        window.logger.addListener((entry) => {
            this.addLogEntry(entry);
        });
    }
    
    updateConnectionStatus(status, message) {
        const statusIndicator = this.shadowRoot.querySelector('.status-indicator');
        const titleText = this.shadowRoot.querySelector('.title-text');
        
        switch (status) {
            case 'connecting':
                statusIndicator.style.background = '#ff9800';
                statusIndicator.title = 'Connecting to Deepgram...';
                break;
            case 'connected':
                statusIndicator.style.background = '#4caf50';
                statusIndicator.title = 'Connected to Deepgram';
                break;
            case 'error':
                statusIndicator.style.background = '#f44336';
                statusIndicator.title = message || 'Connection error';
                break;
            case 'disconnected':
                statusIndicator.style.background = '#ccc';
                statusIndicator.title = 'Disconnected';
                break;
        }
    }

    startDrag(e) {
        if (e.target.closest('.control-btn')) return;
        
        this.isDragging = true;
        const rect = this.widget.getBoundingClientRect();
        this.dragOffset = {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
        this.widget.style.cursor = 'grabbing';
    }

    drag(e) {
        if (!this.isDragging) return;
        
        const x = e.clientX - this.dragOffset.x;
        const y = e.clientY - this.dragOffset.y;
        
        // Keep widget within viewport
        const maxX = window.innerWidth - this.widget.offsetWidth;
        const maxY = window.innerHeight - this.widget.offsetHeight;
        
        this.position.x = Math.max(0, Math.min(x, maxX));
        this.position.y = Math.max(0, Math.min(y, maxY));
        
        this.widget.style.left = this.position.x + 'px';
        this.widget.style.top = this.position.y + 'px';
    }

    stopDrag() {
        this.isDragging = false;
        this.widget.style.cursor = '';
    }

    toggleMinimize() {
        this.isMinimized = !this.isMinimized;
        this.widget.classList.toggle('minimized', this.isMinimized);
        this.logger.info('FloatingUI', `Widget ${this.isMinimized ? 'minimized' : 'expanded'}`);
    }

    openSettings() {
        // Create settings modal
        const modal = document.createElement('div');
        modal.className = 'settings-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <h2>Settings</h2>
                <div class="setting-group">
                    <label for="api-key">Deepgram API Key:</label>
                    <input type="password" id="api-key" placeholder="Enter your API key">
                    <button id="save-api-key">Save</button>
                </div>
                <div class="setting-group">
                    <label>
                        <input type="checkbox" id="show-timestamps">
                        Show timestamps in transcription
                    </label>
                </div>
                <button class="close-btn" id="close-settings">Close</button>
            </div>
        `;
        
        this.shadowRoot.appendChild(modal);
        
        // Load saved settings
        chrome.storage.local.get(['deepgramApiKey', 'showTimestamps'], (result) => {
            if (result.deepgramApiKey) {
                this.shadowRoot.getElementById('api-key').value = result.deepgramApiKey;
            }
            if (result.showTimestamps) {
                this.shadowRoot.getElementById('show-timestamps').checked = result.showTimestamps;
            }
        });
        
        // Save API key
        this.shadowRoot.getElementById('save-api-key').addEventListener('click', async () => {
            const apiKey = this.shadowRoot.getElementById('api-key').value.trim();
            
            if (!apiKey) {
                alert('Please enter an API key');
                return;
            }
            
            // Save to storage
            await chrome.storage.local.set({ deepgramApiKey: apiKey });
            this.logger.info('FloatingUI', 'API key saved');
            
            // Notify service worker to reload
            chrome.runtime.sendMessage({ type: 'RELOAD_API_KEY' }, () => {
                alert('API key saved successfully!');
            });
        });
        
        // Close modal
        this.shadowRoot.getElementById('close-settings').addEventListener('click', () => {
            modal.remove();
        });
    }

    async toggleRecording() {
        // This method is deprecated in the new UI but kept for compatibility
        this.logger.info('FloatingUI', 'toggleRecording called (deprecated method)');
        
        if (this.contentScript.isTranscribing) {
            // Stop recording
            this.contentScript.stopTranscription();
            this.setTranscribing(false);
        } else {
            // Start recording
            this.contentScript.startTranscription();
            this.setTranscribing(true);
        }
    }

    setTranscribing(isTranscribing) {
        // In the new UI, we don't have a start-stop-btn, but we do have status indicator
        const statusIndicator = this.shadowRoot.querySelector('.status-indicator');
        
        if (statusIndicator) {
            if (isTranscribing) {
                statusIndicator.classList.add('active');
            } else {
                statusIndicator.classList.remove('active');
            }
        }
        
        // Log the transcription state
        this.logger.info('FloatingUI', `Transcription state changed: ${isTranscribing}`);
    }

    getTimestamp() {
        const now = new Date();
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        return `${minutes}:${seconds}`;
    }

    updateTranscription(source, text, isFinal) {
        this.logger.info('FloatingUI', 'Updating transcription', { source, text, isFinal });
        
        const element = this.shadowRoot.getElementById('unified-transcription');
        
        if (!element) {
            this.logger.error('FloatingUI', 'Transcription element not found');
            return;
        }
        
        // Remove placeholder if exists
        const placeholder = element.querySelector('.placeholder');
        if (placeholder) {
            placeholder.remove();
        }
        
        // Determine speaker label
        const speakerLabel = source === 'user' ? 'You' : 'Client';
        const speakerClass = source === 'user' ? 'speaker-provider' : 'speaker-client';
        
        if (isFinal) {
            // Remove any interim transcription for this source
            const interim = element.querySelector(`.interim[data-source="${source}"]`);
            if (interim) {
                interim.remove();
            }
            
            // Add final transcription with timestamp and speaker
            const transcriptionDiv = document.createElement('div');
            transcriptionDiv.className = 'transcription-entry';
            transcriptionDiv.setAttribute('data-source', source);
            
            const timestamp = document.createElement('span');
            timestamp.className = 'timestamp';
            timestamp.textContent = this.getTimestamp();
            
            const speaker = document.createElement('span');
            speaker.className = `speaker ${speakerClass}`;
            speaker.textContent = `${speakerLabel}:`;
            
            const textSpan = document.createElement('span');
            textSpan.className = 'transcription-text';
            textSpan.textContent = text;
            
            transcriptionDiv.appendChild(timestamp);
            transcriptionDiv.appendChild(speaker);
            transcriptionDiv.appendChild(textSpan);
            element.appendChild(transcriptionDiv);
            
            // Auto-scroll to bottom
            element.scrollTop = element.scrollHeight;
            
            this.logger.info('FloatingUI', 'Added final transcription', { source, speaker: speakerLabel, text });
        } else {
            // Update or create interim transcription
            let interim = element.querySelector(`.interim[data-source="${source}"]`);
            if (!interim) {
                interim = document.createElement('div');
                interim.className = 'transcription-entry interim';
                interim.setAttribute('data-source', source);
                
                const timestamp = document.createElement('span');
                timestamp.className = 'timestamp';
                timestamp.textContent = this.getTimestamp();
                
                const speaker = document.createElement('span');
                speaker.className = `speaker ${speakerClass}`;
                speaker.textContent = `${speakerLabel}:`;
                
                const textSpan = document.createElement('span');
                textSpan.className = 'transcription-text';
                
                interim.appendChild(timestamp);
                interim.appendChild(speaker);
                interim.appendChild(textSpan);
                
                element.appendChild(interim);
            }
            
            // Update the text content
            const textSpan = interim.querySelector('.transcription-text');
            if (textSpan) {
                textSpan.textContent = text;
            }
            
            // Update timestamp for interim
            const timestampSpan = interim.querySelector('.timestamp');
            if (timestampSpan) {
                timestampSpan.textContent = this.getTimestamp();
            }
            
            // Auto-scroll to bottom
            element.scrollTop = element.scrollHeight;
            
            this.logger.debug('FloatingUI', 'Updated interim transcription', { source, speaker: speakerLabel, text });
        }
    }

    updateAudioLevel(source, level) {
        const indicatorId = source === 'user' ? 'mic-indicator' : 'tab-indicator';
        const indicator = this.shadowRoot.getElementById(indicatorId);
        
        // Null guard - element may not exist on current screen
        if (!indicator) {
            return;
        }
        
        const levelBar = indicator.querySelector('.level-bar');
        if (!levelBar) {
            return;
        }
        
        // Update level bar width (0-100%)
        levelBar.style.width = `${Math.min(100, level * 100)}%`;
        
        // Update color based on level
        if (level > 0.7) {
            levelBar.style.backgroundColor = '#f44336';
        } else if (level > 0.3) {
            levelBar.style.backgroundColor = '#ff9800';
        } else {
            levelBar.style.backgroundColor = '#4caf50';
        }
    }

    toggleLogs() {
        const logSection = this.shadowRoot.getElementById('log-section');
        logSection.classList.toggle('collapsed');
        
        if (!logSection.classList.contains('collapsed')) {
            this.refreshLogs();
        }
    }

    refreshLogs() {
        const logContent = this.shadowRoot.getElementById('log-content');
        const logs = window.logger.getLogs({ level: 'INFO' });
        
        logContent.innerHTML = logs.slice(-50).map(log => `
            <div class="log-entry ${log.level.toLowerCase()}">
                <span class="log-time">${new Date(log.timestamp).toLocaleTimeString()}</span>
                <span class="log-level">[${log.level}]</span>
                <span class="log-component">[${log.component}]</span>
                <span class="log-message">${log.message}</span>
            </div>
        `).join('');
        
        logContent.scrollTop = logContent.scrollHeight;
    }

    addLogEntry(entry) {
        const logContent = this.shadowRoot.getElementById('log-content');
        if (!logContent || this.shadowRoot.getElementById('log-section').classList.contains('collapsed')) {
            return;
        }
        
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${entry.level.toLowerCase()}`;
        logEntry.innerHTML = `
            <span class="log-time">${new Date(entry.timestamp).toLocaleTimeString()}</span>
            <span class="log-level">[${entry.level}]</span>
            <span class="log-component">[${entry.component}]</span>
            <span class="log-message">${entry.message}</span>
        `;
        
        logContent.appendChild(logEntry);
        
        // Keep only last 50 entries
        while (logContent.children.length > 50) {
            logContent.removeChild(logContent.firstChild);
        }
        
        logContent.scrollTop = logContent.scrollHeight;
    }

    exportLogs() {
        const { url, filename } = window.logger.exportLogs();
        
        // Create download link
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        
        // Clean up
        setTimeout(() => URL.revokeObjectURL(url), 100);
        
        this.logger.info('FloatingUI', 'Logs exported', { filename });
    }
    
    setTabPermission(hasPermission, errorMessage = null) {
        this.hasTabPermission = hasPermission;
        const permissionNotice = this.shadowRoot.getElementById('permission-notice');
        
        if (permissionNotice) {
            if (hasPermission) {
                // Hide the notice
                permissionNotice.style.display = 'none';
            } else {
                // Show the notice with error message if provided
                permissionNotice.style.display = 'block';
                if (errorMessage) {
                    permissionNotice.innerHTML = `⚠️ Tab audio error: ${errorMessage}`;
                    permissionNotice.style.color = '#f44336';
                    permissionNotice.style.borderColor = 'rgba(244, 67, 54, 0.3)';
                    permissionNotice.style.backgroundColor = 'rgba(244, 67, 54, 0.1)';
                }
            }
        }
        
        this.logger.info('FloatingUI', 'Tab permission status updated', { hasPermission, errorMessage });
    }
    
    showFallbackNotice(message, transcriptionEnabled) {
        // Create or update fallback notice
        let fallbackNotice = this.shadowRoot.getElementById('fallback-notice');
        
        if (!fallbackNotice) {
            // Create the notice element
            fallbackNotice = document.createElement('div');
            fallbackNotice.id = 'fallback-notice';
            fallbackNotice.style.cssText = `
                background: rgba(255, 193, 7, 0.1);
                border: 1px solid rgba(255, 193, 7, 0.3);
                border-radius: 8px;
                padding: 10px;
                margin-bottom: 12px;
                font-size: 13px;
                color: #ffc107;
                text-align: center;
            `;
            
            // Insert after permission notice or at the beginning of controls section
            const controlsSection = this.shadowRoot.querySelector('.controls-section');
            const permissionNotice = this.shadowRoot.getElementById('permission-notice');
            
            if (permissionNotice && permissionNotice.nextSibling) {
                controlsSection.insertBefore(fallbackNotice, permissionNotice.nextSibling);
            } else {
                controlsSection.insertBefore(fallbackNotice, controlsSection.firstChild);
            }
        }
        
        // Update the notice content
        fallbackNotice.innerHTML = `⚠️ ${message}`;
        fallbackNotice.style.display = 'block';
        
        // Auto-hide after 10 seconds
        setTimeout(() => {
            if (fallbackNotice) {
                fallbackNotice.style.display = 'none';
            }
        }, 10000);
        
        this.logger.info('FloatingUI', 'Showing fallback notice', { message, transcriptionEnabled });
    }
}
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
        
        // Wait for DOM to be ready before setting up event listeners
        setTimeout(() => {
            this.setupEventListeners();
            this.setupTranscriptionListener();
            this.logger.info('FloatingUI', 'Event listeners set up');
        }, 100);
    }

    render() {
        const html = `
            <div id="floating-widget" style="left: ${this.position.x}px; top: ${this.position.y}px; display: block !important; visibility: visible !important;">
                <div class="widget-header">
                    <div class="header-title">
                        <span class="status-indicator"></span>
                        <span class="title-text">Meet Transcription</span>
                    </div>
                    <div class="header-controls">
                        <button id="minimize-btn" class="control-btn" title="Minimize">
                            <svg width="16" height="16" viewBox="0 0 16 16">
                                <path d="M4 8h8v1H4z" fill="currentColor"/>
                            </svg>
                        </button>
                        <button id="settings-btn" class="control-btn" title="Settings">
                            <svg width="16" height="16" viewBox="0 0 16 16">
                                <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z" fill="currentColor"/>
                                <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.32zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115l.094-.319z" fill="currentColor"/>
                            </svg>
                        </button>
                    </div>
                </div>
                
                <div class="widget-body">
                    <div class="controls-section">
                        <button id="start-stop-btn" class="primary-btn">
                            Start Recording
                        </button>
                        <div class="audio-indicators">
                            <div class="indicator" id="mic-indicator">
                                <span class="indicator-label">Mic</span>
                                <div class="level-meter">
                                    <div class="level-bar"></div>
                                </div>
                            </div>
                            <div class="indicator" id="tab-indicator">
                                <span class="indicator-label">Tab</span>
                                <div class="level-meter">
                                    <div class="level-bar"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="transcription-section">
                        <div class="transcription-pane">
                            <div class="pane-header">
                                <h3>You</h3>
                                <button class="clear-btn" data-target="user-transcription" title="Clear">
                                    <svg width="14" height="14" viewBox="0 0 14 14">
                                        <path d="M14 1.41L12.59 0L7 5.59L1.41 0L0 1.41L5.59 7L0 12.59L1.41 14L7 8.41L12.59 14L14 12.59L8.41 7L14 1.41Z" fill="currentColor"/>
                                    </svg>
                                </button>
                            </div>
                            <div class="transcription-content" id="user-transcription">
                                <p class="placeholder">Your speech will appear here...</p>
                            </div>
                        </div>
                        <div class="divider"></div>
                        <div class="transcription-pane">
                            <div class="pane-header">
                                <h3>Others</h3>
                                <button class="clear-btn" data-target="others-transcription" title="Clear">
                                    <svg width="14" height="14" viewBox="0 0 14 14">
                                        <path d="M14 1.41L12.59 0L7 5.59L1.41 0L0 1.41L5.59 7L0 12.59L1.41 14L7 8.41L12.59 14L14 12.59L8.41 7L14 1.41Z" fill="currentColor"/>
                                    </svg>
                                </button>
                            </div>
                            <div class="transcription-content" id="others-transcription">
                                <p class="placeholder">Others' speech will appear here...</p>
                            </div>
                        </div>
                    </div>
                    
                    <div class="log-section collapsed" id="log-section">
                        <div class="log-header">
                            <button id="toggle-logs" class="toggle-btn">
                                <svg width="12" height="12" viewBox="0 0 12 12">
                                    <path d="M3 5l3 3 3-3" stroke="currentColor" fill="none"/>
                                </svg>
                                <span>Logs</span>
                            </button>
                            <button id="export-logs" class="export-btn">Export</button>
                        </div>
                        <div class="log-content" id="log-content"></div>
                    </div>
                </div>
                
                <div class="resize-handle"></div>
            </div>
        `;
        
        // Check styles before innerHTML
        console.log('FLOATING-UI: Style elements BEFORE innerHTML:', this.shadowRoot.querySelectorAll('style').length);
        
        // Save existing style elements before innerHTML wipes them out
        const existingStyles = Array.from(this.shadowRoot.querySelectorAll('style'));
        
        // Set innerHTML (this will clear everything)
        this.shadowRoot.innerHTML = html;
        
        // Re-append the saved style elements
        existingStyles.forEach(style => {
            this.shadowRoot.appendChild(style);
        });
        
        // Check styles after innerHTML - should be restored now!
        console.log('FLOATING-UI: Style elements AFTER innerHTML:', this.shadowRoot.querySelectorAll('style').length);
        
        this.widget = this.shadowRoot.getElementById('floating-widget');
        
        // Debug: Check computed styles
        setTimeout(() => {
            if (this.widget) {
                const computedStyle = window.getComputedStyle(this.widget);
                const rootComputedStyle = window.getComputedStyle(this.shadowRoot.host);
                
                console.log('FLOATING-UI: Widget element exists:', !!this.widget);
                console.log('FLOATING-UI: Widget computed backgroundColor:', computedStyle.backgroundColor);
                console.log('FLOATING-UI: Widget inline style:', this.widget.getAttribute('style'));
                
                // Check if any styles are actually applied to the widget
                const allStyles = this.shadowRoot.querySelectorAll('style');
                console.log('FLOATING-UI: Total style elements in shadow at render time:', allStyles.length);
                
                this.logger.info('FloatingUI', 'Widget computed styles', {
                    background: computedStyle.background,
                    backgroundColor: computedStyle.backgroundColor,
                    opacity: computedStyle.opacity,
                    visibility: computedStyle.visibility,
                    display: computedStyle.display,
                    cssVarBgDark: computedStyle.getPropertyValue('--bg-dark'),
                    rootCssVarBgDark: rootComputedStyle.getPropertyValue('--bg-dark')
                });
            }
        }, 100);
        
        this.logger.info('FloatingUI', 'UI rendered');
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
            element.innerHTML = '<p class="placeholder">Cleared. New transcriptions will appear here...</p>';
            this.logger.info('FloatingUI', `Cleared transcriptions for ${targetId}`);
        }
    }

    setupTranscriptionListener() {
        // Listen for transcription updates from service worker
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.type === 'TRANSCRIPTION_UPDATE') {
                this.updateTranscription(request.source, request.text, request.isFinal);
            } else if (request.type === 'AUDIO_LEVEL_UPDATE') {
                this.updateAudioLevel(request.source, request.level);
            } else if (request.type === 'CONNECTION_STATUS') {
                this.updateConnectionStatus(request.status, request.message);
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
        this.logger.info('FloatingUI', 'toggleRecording called');
        const btn = this.shadowRoot.getElementById('start-stop-btn');
        
        this.logger.debug('FloatingUI', 'Current state', {
            isTranscribing: this.contentScript.isTranscribing,
            contentScriptExists: !!this.contentScript
        });
        
        if (this.contentScript.isTranscribing) {
            // Stop recording
            this.contentScript.stopTranscription();
            btn.textContent = 'Start Recording';
            btn.classList.remove('recording');
            this.shadowRoot.querySelector('.status-indicator').classList.remove('active');
        } else {
            // Check for API key first
            const { deepgramApiKey } = await chrome.storage.local.get(['deepgramApiKey']);
            if (!deepgramApiKey) {
                // Show inline error instead of alert
                const errorDiv = document.createElement('div');
                errorDiv.style.cssText = `
                    position: absolute;
                    top: 60px;
                    left: 10px;
                    right: 10px;
                    background: #f44336;
                    color: white;
                    padding: 10px;
                    border-radius: 4px;
                    font-size: 12px;
                    z-index: 1000;
                `;
                errorDiv.textContent = 'API key required! Click Settings to add it.';
                this.widget.appendChild(errorDiv);
                
                setTimeout(() => errorDiv.remove(), 3000);
                return;
            }
            
            // Start recording
            this.contentScript.startTranscription();
            btn.textContent = 'Stop Recording';
            btn.classList.add('recording');
            this.shadowRoot.querySelector('.status-indicator').classList.add('active');
        }
    }

    setTranscribing(isTranscribing) {
        const btn = this.shadowRoot.getElementById('start-stop-btn');
        if (isTranscribing) {
            btn.textContent = 'Stop Recording';
            btn.classList.add('recording');
            this.shadowRoot.querySelector('.status-indicator').classList.add('active');
        } else {
            btn.textContent = 'Start Recording';
            btn.classList.remove('recording');
            this.shadowRoot.querySelector('.status-indicator').classList.remove('active');
        }
    }

    updateTranscription(source, text, isFinal) {
        this.logger.info('FloatingUI', 'Updating transcription', { source, text, isFinal });
        
        const elementId = source === 'user' ? 'user-transcription' : 'others-transcription';
        const element = this.shadowRoot.getElementById(elementId);
        
        if (!element) {
            this.logger.error('FloatingUI', 'Transcription element not found', { elementId });
            return;
        }
        
        // Remove placeholder if exists
        const placeholder = element.querySelector('.placeholder');
        if (placeholder) {
            placeholder.remove();
        }
        
        if (isFinal) {
            // Remove any interim transcription
            const interim = element.querySelector('.interim');
            if (interim) {
                interim.remove();
            }
            
            // Add final transcription with timestamp
            const transcriptionDiv = document.createElement('div');
            transcriptionDiv.className = 'transcription-entry';
            
            const timestamp = document.createElement('span');
            timestamp.className = 'timestamp';
            timestamp.textContent = new Date().toLocaleTimeString('en-US', { 
                hour: '2-digit', 
                minute: '2-digit',
                second: '2-digit'
            });
            
            const textSpan = document.createElement('span');
            textSpan.className = 'transcription-text';
            textSpan.textContent = text;
            
            transcriptionDiv.appendChild(timestamp);
            transcriptionDiv.appendChild(textSpan);
            element.appendChild(transcriptionDiv);
            
            // Auto-scroll to bottom
            element.scrollTop = element.scrollHeight;
            
            this.logger.info('FloatingUI', 'Added final transcription', { source, text });
        } else {
            // Update or create interim transcription
            let interim = element.querySelector('.interim');
            if (!interim) {
                // Remove any existing interim first
                const existingInterim = element.querySelector('.interim');
                if (existingInterim) {
                    existingInterim.remove();
                }
                
                interim = document.createElement('div');
                interim.className = 'transcription-entry interim';
                
                const textSpan = document.createElement('span');
                textSpan.className = 'transcription-text';
                interim.appendChild(textSpan);
                
                element.appendChild(interim);
            }
            
            const textSpan = interim.querySelector('.transcription-text');
            if (textSpan) {
                textSpan.textContent = text;
            }
            
            // Auto-scroll to bottom
            element.scrollTop = element.scrollHeight;
            
            this.logger.debug('FloatingUI', 'Updated interim transcription', { source, text });
        }
    }

    updateAudioLevel(source, level) {
        const indicatorId = source === 'user' ? 'mic-indicator' : 'tab-indicator';
        const indicator = this.shadowRoot.getElementById(indicatorId);
        const levelBar = indicator.querySelector('.level-bar');
        
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
}
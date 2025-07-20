// service-worker.js - Background service worker for WebSocket management

console.log('[Service Worker] Service worker loaded');

class TranscriptionService {
    constructor() {
        this.micSocket = null;
        this.tabSocket = null;
        this.keepAliveInterval = null;
        this.apiKey = null;
        this.tabStreamId = null;
        this.audioContext = null;
        this.isTranscribing = false;
        this.activeTabId = null; // Track the tab that's transcribing
        
        console.log('[Service Worker] TranscriptionService initialized');
        this.init();
    }

    async init() {
        // Check permissions
        console.log('[Service Worker] Checking extension permissions...');
        const manifest = chrome.runtime.getManifest();
        console.log('[Service Worker] Extension permissions:', {
            permissions: manifest.permissions,
            hasTabCapture: manifest.permissions.includes('tabCapture'),
            hostPermissions: manifest.host_permissions
        });
        
        // Load granted tabs from storage
        try {
            const stored = await chrome.storage.session.get(['grantedTabs']);
            if (stored.grantedTabs && Array.isArray(stored.grantedTabs)) {
                stored.grantedTabs.forEach(tabId => grantedTabs.add(tabId));
                console.log('[Service Worker] Loaded granted tabs from storage:', stored.grantedTabs);
            }
        } catch (error) {
            console.log('[Service Worker] Could not load granted tabs:', error);
        }
        
        // Load API key from storage
        const result = await chrome.storage.local.get(['deepgramApiKey']);
        this.apiKey = result.deepgramApiKey;
        
        // Hardcode API key
        this.apiKey = 'ea2f05e0565364f93936d157fc4b7d20ac06691b';
        
        if (this.apiKey) {
            console.log('[Service Worker] API key loaded successfully');
        } else {
            console.warn('[Service Worker] No API key found in storage');
        }
        
        // Set up alarm for keepalive (backup for WebSocket activity)
        chrome.alarms.create('keepAlive', { periodInMinutes: 0.25 }); // Every 15 seconds
        
        console.log('[Service Worker] Initialization complete');
    }

    async connectToDeepgram(source) {
        if (!this.apiKey) {
            console.error('[Service Worker] No API key available');
            this.sendConnectionStatus('error', 'No API key configured');
            throw new Error('Deepgram API key not configured');
        }

        const url = 'wss://api.deepgram.com/v1/listen?' + new URLSearchParams({
            model: 'nova-3',
            language: 'en-US',
            smart_format: true,
            encoding: 'linear16',
            sample_rate: '16000',
            channels: '1',
            interim_results: true,
            endpointing: 300,
            vad_events: true
        });

        console.log(`[Service Worker] Connecting to Deepgram for ${source}...`);
        this.sendConnectionStatus('connecting', 'Connecting to Deepgram...');
        
        const socket = new WebSocket(url, ['token', this.apiKey]);
        
        socket.onopen = () => {
            console.log(`[Service Worker] WebSocket connected for ${source}`);
            this.sendLogToContent('INFO', 'Deepgram', `Connected for ${source} audio`);
            
            // Send connection status to UI
            this.sendConnectionStatus('connected', 'Connected to Deepgram');
            
            // Start keepalive
            if (!this.keepAliveInterval) {
                this.startKeepAlive();
            }
        };

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                
                if (source === 'others') {
                    console.log(`[Service Worker] TAB WebSocket message received:`, {
                        type: data.type,
                        hasTranscript: !!data.channel?.alternatives?.[0]?.transcript,
                        isFinal: data.is_final
                    });
                }
                
                if (data.type === 'Results') {
                    const transcript = data.channel?.alternatives?.[0]?.transcript;
                    
                    if (transcript) {
                        // Send transcription to content script
                        this.sendTranscriptionUpdate(source, transcript, data.is_final);
                        
                        if (source === 'others') {
                            console.log(`[Service Worker] TAB Transcription (${source}): "${transcript}" (final: ${data.is_final})`);
                        } else {
                            console.log(`[Service Worker] Transcription (${source}): ${transcript}`);
                        }
                    } else if (source === 'others') {
                        console.log(`[Service Worker] TAB WebSocket Results with no transcript`);
                    }
                } else if (data.type === 'Metadata') {
                    console.log(`[Service Worker] Metadata received for ${source}:`, data);
                }
            } catch (error) {
                console.error(`[Service Worker] Error parsing ${source} message:`, error);
            }
        };

        socket.onerror = (error) => {
            console.error(`[Service Worker] WebSocket error for ${source}:`, error);
            this.sendLogToContent('ERROR', 'Deepgram', `WebSocket error for ${source}`, error);
            this.sendConnectionStatus('error', 'WebSocket error');
        };

        socket.onclose = (event) => {
            console.log(`[Service Worker] WebSocket closed for ${source}:`, event.code, event.reason);
            this.sendLogToContent('WARN', 'Deepgram', `Disconnected from ${source}`, {
                code: event.code,
                reason: event.reason
            });
            
            this.sendConnectionStatus('disconnected', event.reason || 'Connection closed');
            
            // Attempt reconnection if it was an unexpected closure
            if (this.isTranscribing && event.code !== 1000) {
                setTimeout(() => {
                    console.log(`[Service Worker] Attempting to reconnect ${source}...`);
                    this.reconnectSocket(source);
                }, 1000);
            }
        };

        return socket;
    }

    startKeepAlive() {
        // Send keepalive message every 20 seconds
        this.keepAliveInterval = setInterval(() => {
            if (this.micSocket?.readyState === WebSocket.OPEN) {
                this.micSocket.send(JSON.stringify({ type: 'KeepAlive' }));
                console.log('[Service Worker] KeepAlive sent to mic socket');
            }
            
            if (this.tabSocket?.readyState === WebSocket.OPEN) {
                this.tabSocket.send(JSON.stringify({ type: 'KeepAlive' }));
                console.log('[Service Worker] KeepAlive sent to tab socket');
            }
        }, 20000);
    }

    stopKeepAlive() {
        if (this.keepAliveInterval) {
            clearInterval(this.keepAliveInterval);
            this.keepAliveInterval = null;
        }
    }

    async reconnectSocket(source) {
        try {
            if (source === 'user' && this.isTranscribing) {
                this.micSocket = await this.connectToDeepgram('user');
            } else if (source === 'others' && this.isTranscribing) {
                this.tabSocket = await this.connectToDeepgram('others');
            }
        } catch (error) {
            console.error(`[Service Worker] Reconnection failed for ${source}:`, error);
        }
    }
    

    async handleTabAudioCapture() {
        try {
            // Get the current tab
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            
            if (!tab.id) {
                throw new Error('No active tab found');
            }
            
            // Check if tab has been granted permission
            if (!grantedTabs.has(tab.id)) {
                console.error('[Service Worker] Tab permission not granted. User must click extension icon first.');
                throw new Error('Tab permission not granted. Please click the extension icon to grant permission for this tab.');
            }
            
            // Check if URL is capturable
            const isSpecialUrl = tab.url.startsWith('chrome://') || 
                               tab.url.startsWith('chrome-extension://') || 
                               tab.url.startsWith('edge://') ||
                               tab.url.startsWith('about:') ||
                               tab.url.startsWith('file://');
            
            console.log('[Service Worker] TAB AUDIO CAPTURE - Tab details:', {
                tabId: tab.id,
                url: tab.url,
                title: tab.title,
                active: tab.active,
                audible: tab.audible,
                isSpecialUrl: isSpecialUrl,
                protocol: new URL(tab.url).protocol,
                hasPermission: grantedTabs.has(tab.id)
            });
            
            if (isSpecialUrl) {
                console.warn('[Service Worker] WARNING: Attempting to capture audio from special URL:', tab.url);
            }
            
            // Get media stream ID for tab capture
            console.log('[Service Worker] CONTEXT CHECK - Running in:', {
                context: 'service-worker',
                globalThis: typeof globalThis,
                self: typeof self,
                hasNavigator: typeof navigator !== 'undefined',
                hasMediaDevices: typeof navigator !== 'undefined' && navigator.mediaDevices !== undefined,
                timestamp: Date.now()
            });
            
            return new Promise((resolve, reject) => {
                const captureStartTime = Date.now();
                
                chrome.tabCapture.getMediaStreamId({
                    targetTabId: tab.id
                }, (streamId) => {
                    if (chrome.runtime.lastError) {
                        // Log the error message directly first
                        const errorMessage = chrome.runtime.lastError.message || String(chrome.runtime.lastError) || 'Unknown error';
                        console.error('[Service Worker] TAB CAPTURE ERROR MESSAGE:', errorMessage);
                        
                        // Then log full details
                        console.error('[Service Worker] TAB CAPTURE ERROR DETAILS:', {
                            message: errorMessage,
                            rawError: chrome.runtime.lastError,
                            errorString: String(chrome.runtime.lastError),
                            errorJSON: JSON.stringify(chrome.runtime.lastError),
                            targetTabId: tab.id,
                            tabUrl: tab.url,
                            tabTitle: tab.title,
                            tabAudible: tab.audible
                        });
                        reject(new Error(errorMessage));
                        return;
                    }
                    
                    this.tabStreamId = streamId;
                    const captureEndTime = Date.now();
                    
                    console.log('[Service Worker] TAB AUDIO CAPTURE SUCCESS - Stream ID Details:', {
                        streamId: streamId,
                        streamIdLength: streamId.length,
                        streamIdType: typeof streamId,
                        generationTime: captureEndTime - captureStartTime,
                        timestamp: captureEndTime,
                        context: 'service-worker',
                        tabId: tab.id,
                        tabUrl: tab.url
                    });
                    
                    this.sendLogToContent('INFO', 'TabCapture', 'Tab audio stream ID obtained');
                    resolve(streamId);
                });
            });
            
        } catch (error) {
            console.error('[Service Worker] Tab capture error:', error);
            this.sendLogToContent('ERROR', 'TabCapture', 'Failed to capture tab audio', error);
            throw error;
        }
    }

    async sendAudioToDeepgram(audioData, source) {
        const socket = source === 'user' ? this.micSocket : this.tabSocket;
        
        if (socket?.readyState === WebSocket.OPEN) {
            socket.send(audioData);
            if (source === 'others') {
                console.log(`[Service Worker] TAB audio sent to Deepgram:`, audioData.byteLength, 'bytes');
            } else {
                console.log(`[Service Worker] Sent audio chunk to ${source} socket:`, audioData.byteLength, 'bytes');
            }
        } else {
            console.warn(`[Service Worker] Socket not ready for ${source}`, {
                socketExists: !!socket,
                readyState: socket?.readyState,
                readyStateText: socket ? ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][socket.readyState] : 'NO_SOCKET',
                micSocketOpen: this.micSocket?.readyState === WebSocket.OPEN,
                tabSocketOpen: this.tabSocket?.readyState === WebSocket.OPEN,
                isTabSource: source === 'others'
            });
        }
    }

    sendTranscriptionUpdate(source, text, isFinal) {
        if (!this.activeTabId) {
            console.warn('[Service Worker] No active tab ID to send transcription to');
            return;
        }
        
        const mappedSource = source === 'user' ? 'user' : 'others';
        
        if (source === 'others') {
            console.log(`[Service Worker] Sending TAB transcription to content script:`, {
                activeTabId: this.activeTabId,
                source: mappedSource,
                text: text.substring(0, 50) + '...',
                isFinal: isFinal
            });
        }
        
        chrome.tabs.sendMessage(this.activeTabId, {
            type: 'TRANSCRIPTION_UPDATE',
            source: mappedSource,
            text,
            isFinal
        }).then(() => {
            if (source === 'others') {
                console.log(`[Service Worker] TAB transcription sent successfully`);
            }
        }).catch(err => {
            console.warn(`[Service Worker] Failed to send ${source} transcription update:`, err);
        });
    }

    sendLogToContent(level, component, message, data = null) {
        chrome.runtime.sendMessage({
            type: 'LOG_ENTRY',
            entry: {
                timestamp: new Date().toISOString(),
                level,
                component,
                message,
                data
            }
        }).catch(err => {
            // Content script might not be ready
        });
    }
    
    sendConnectionStatus(status, message) {
        if (!this.activeTabId) {
            console.log('[Service Worker] No active tab ID for connection status');
            return;
        }
        
        chrome.tabs.sendMessage(this.activeTabId, {
            type: 'CONNECTION_STATUS',
            status,
            message
        }).catch(err => {
            // Content script might not be ready
            console.log('[Service Worker] Failed to send connection status:', err);
        });
    }

    async handleMessage(request, sender, sendResponse) {
        console.log('[Service Worker] Received message:', request.type);
        
        // Log the sender info
        if (request.type === 'AUDIO_DATA') {
            console.log('[Service Worker] Audio data received from:', sender.tab?.id, 'Size:', request.data?.byteLength);
        }
        
        switch (request.type) {
            case 'REQUEST_TAB_AUDIO':
                try {
                    console.log('[Service Worker] REQUEST_TAB_AUDIO received from:', {
                        senderTabId: sender.tab?.id,
                        senderUrl: sender.tab?.url,
                        senderFrameId: sender.frameId,
                        currentActiveTabId: this.activeTabId
                    });
                    
                    // Store the tab ID if not already set
                    if (!this.activeTabId && sender.tab && sender.tab.id) {
                        this.activeTabId = sender.tab.id;
                        console.log('[Service Worker] Active tab ID set from REQUEST_TAB_AUDIO:', this.activeTabId);
                    }
                    
                    const streamId = await this.handleTabAudioCapture();
                    
                    console.log('[Service Worker] Got stream ID, creating offscreen document');
                    
                    // Create offscreen document to handle tab audio capture
                    try {
                        await chrome.offscreen.createDocument({
                            url: 'offscreen.html',
                            reasons: ['USER_MEDIA'],
                            justification: 'Capture tab audio using streamId in offscreen document'
                        });
                        console.log('[Service Worker] Offscreen document created');
                    } catch (error) {
                        // Document might already exist
                        if (!error.message.includes('already exists')) {
                            throw error;
                        }
                        console.log('[Service Worker] Offscreen document already exists');
                    }
                    
                    // Connect to Deepgram for tab audio
                    if (!this.tabSocket || this.tabSocket.readyState !== WebSocket.OPEN) {
                        this.tabSocket = await this.connectToDeepgram('others');
                    }
                    
                    // Send streamId to offscreen document
                    const offscreenResponse = await chrome.runtime.sendMessage({
                        type: 'START_TAB_CAPTURE',
                        streamId: streamId
                    });
                    
                    if (offscreenResponse.success) {
                        console.log('[Service Worker] Tab capture started in offscreen document');
                        sendResponse({ success: true, message: 'Tab audio capture started' });
                    } else {
                        throw new Error(offscreenResponse.error || 'Failed to start tab capture');
                    }
                } catch (error) {
                    const errorMsg = error.message || String(error) || 'Unknown error';
                    console.error('[Service Worker] REQUEST_TAB_AUDIO failed:', errorMsg);
                    sendResponse({ success: false, error: errorMsg });
                }
                break;
                
            case 'START_MIC_PROCESSING':
                try {
                    this.isTranscribing = true;
                    
                    // Store the tab ID for sending messages back
                    if (sender.tab && sender.tab.id) {
                        this.activeTabId = sender.tab.id;
                        console.log('[Service Worker] Active tab ID set:', this.activeTabId);
                    }
                    
                    // API key is now hardcoded, no need to reload
                    
                    // Connect to Deepgram for mic audio
                    if (!this.micSocket || this.micSocket.readyState !== WebSocket.OPEN) {
                        this.micSocket = await this.connectToDeepgram('user');
                    }
                    
                    sendResponse({ success: true });
                } catch (error) {
                    console.error('[Service Worker] Failed to start mic processing:', error);
                    sendResponse({ success: false, error: error.message });
                }
                break;
                
            case 'AUDIO_DATA':
                // Handle audio data from content script
                if (!request.data) {
                    console.error('[Service Worker] No audio data in message');
                    sendResponse({ success: false, error: 'No audio data' });
                    break;
                }
                
                if (request.source === 'others') {
                    console.log('[Service Worker] TAB AUDIO_DATA received:', {
                        source: request.source,
                        byteLength: request.byteLength,
                        hasData: !!request.data,
                        dataLength: request.data?.length
                    });
                }
                
                try {
                    // Decode base64 data back to ArrayBuffer
                    const binaryString = atob(request.data);
                    const bytes = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    
                    // Send to Deepgram
                    this.sendAudioToDeepgram(bytes.buffer, request.source);
                    sendResponse({ success: true });
                } catch (error) {
                    console.error(`[Service Worker] Error decoding ${request.source} audio data:`, error);
                    sendResponse({ success: false, error: error.message });
                }
                break;
                
            case 'TAB_AUDIO_DATA':
                // Handle audio data from offscreen document
                if (!request.data) {
                    console.error('[Service Worker] No audio data in TAB_AUDIO_DATA message');
                    sendResponse({ success: false, error: 'No audio data' });
                    break;
                }
                
                console.log('[Service Worker] TAB AUDIO_DATA received from offscreen:', {
                    byteLength: request.byteLength,
                    sampleCount: request.sampleCount,
                    timestamp: request.timestamp
                });
                
                try {
                    // Decode base64 data back to ArrayBuffer
                    const binaryString = atob(request.data);
                    const bytes = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }
                    
                    // Send to Deepgram
                    this.sendAudioToDeepgram(bytes.buffer, 'others');
                    sendResponse({ success: true });
                } catch (error) {
                    console.error('[Service Worker] Failed to process tab audio data:', error);
                    sendResponse({ success: false, error: error.message });
                }
                break;
                
            case 'STOP_TRANSCRIPTION':
                this.stopTranscription();
                // Close offscreen document if it exists
                try {
                    await chrome.offscreen.closeDocument();
                    console.log('[Service Worker] Offscreen document closed');
                } catch (error) {
                    // Document might not exist
                    console.log('[Service Worker] No offscreen document to close');
                }
                sendResponse({ success: true });
                break;
                
            case 'TEST_API_KEY':
                this.testApiKey(request.apiKey).then(result => {
                    sendResponse(result);
                }).catch(error => {
                    sendResponse({ success: false, error: error.message });
                });
                break;
                
            case 'RELOAD_API_KEY':
                // Reload API key from storage
                chrome.storage.local.get(['deepgramApiKey'], (result) => {
                    this.apiKey = result.deepgramApiKey;
                    console.log('[Service Worker] API key reloaded:', !!this.apiKey);
                    sendResponse({ success: true });
                });
                break;
                
            default:
                sendResponse({ error: 'Unknown message type' });
        }
        
        return true; // Keep message channel open
    }

    stopTranscription() {
        console.log('[Service Worker] Stopping transcription...');
        
        this.isTranscribing = false;
        
        // Close WebSocket connections
        if (this.micSocket) {
            this.micSocket.close(1000, 'Transcription stopped');
            this.micSocket = null;
        }
        
        if (this.tabSocket) {
            this.tabSocket.close(1000, 'Transcription stopped');
            this.tabSocket = null;
        }
        
        // Stop keepalive
        this.stopKeepAlive();
        
        // Stop tab capture if active
        if (this.tabStreamId) {
            // Tab capture will be stopped automatically when the MediaStream is closed
            this.tabStreamId = null;
        }
        
        // Clear active tab ID
        this.activeTabId = null;
        
        this.sendLogToContent('INFO', 'Service', 'Transcription stopped');
    }
    
    async testApiKey(apiKey) {
        try {
            // Test connection by creating a WebSocket and checking if it connects
            return new Promise((resolve, reject) => {
                const testUrl = 'wss://api.deepgram.com/v1/listen?model=nova-3&language=en-US';
                const testSocket = new WebSocket(testUrl, ['token', apiKey]);
                
                const timeout = setTimeout(() => {
                    testSocket.close();
                    reject(new Error('Connection timeout'));
                }, 5000);
                
                testSocket.onopen = () => {
                    clearTimeout(timeout);
                    console.log('[Service Worker] API key test successful');
                    testSocket.close(1000, 'Test complete');
                    resolve({ success: true });
                };
                
                testSocket.onerror = (error) => {
                    clearTimeout(timeout);
                    console.error('[Service Worker] API key test failed:', error);
                    reject(new Error('Invalid API key or connection failed'));
                };
                
                testSocket.onclose = (event) => {
                    clearTimeout(timeout);
                    if (event.code === 1008) {
                        reject(new Error('Invalid API key'));
                    }
                };
            });
        } catch (error) {
            console.error('[Service Worker] API key test error:', error);
            throw error;
        }
    }
}

// Initialize service
const transcriptionService = new TranscriptionService();

// Track which tabs have been granted permission via user interaction
const grantedTabs = new Set();

// Message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    transcriptionService.handleMessage(request, sender, sendResponse);
    return true; // Keep message channel open
});

// Handle extension icon clicks to grant activeTab permission
chrome.action.onClicked.addListener(async (tab) => {
    console.log('[Service Worker] Extension icon clicked for tab:', tab.id, tab.url);
    
    // Add this tab to granted permissions
    grantedTabs.add(tab.id);
    console.log('[Service Worker] Tab permission granted for:', tab.id);
    
    // Persist to storage
    try {
        await chrome.storage.session.set({ 
            grantedTabs: Array.from(grantedTabs) 
        });
        console.log('[Service Worker] Persisted granted tabs to storage');
    } catch (error) {
        console.log('[Service Worker] Could not persist granted tabs:', error);
    }
    
    // Notify the tab that permission has been granted
    // Content scripts are already injected by manifest
    chrome.tabs.sendMessage(tab.id, {
        type: 'PERMISSION_GRANTED',
        tabId: tab.id
    }).then(() => {
        console.log('[Service Worker] Permission grant notification sent successfully');
    }).catch(err => {
        console.log('[Service Worker] Could not notify tab of permission grant:', err);
    });
});

// Clean up granted tabs when they're closed
chrome.tabs.onRemoved.addListener(async (tabId) => {
    if (grantedTabs.has(tabId)) {
        grantedTabs.delete(tabId);
        console.log('[Service Worker] Removed permission grant for closed tab:', tabId);
        
        // Update storage
        try {
            await chrome.storage.session.set({ 
                grantedTabs: Array.from(grantedTabs) 
            });
        } catch (error) {
            console.log('[Service Worker] Could not update granted tabs storage:', error);
        }
    }
});

// Alarm listener for keepalive backup
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'keepAlive') {
        console.log('[Service Worker] Keepalive alarm triggered');
        // This keeps the service worker alive even if WebSocket activity fails
    }
});

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
    console.log('[Service Worker] Extension installed:', details.reason);
    
    if (details.reason === 'install') {
        // Open options page on first install
        chrome.tabs.create({
            url: chrome.runtime.getURL('options.html')
        });
    }
});

console.log('[Service Worker] Service worker loaded');
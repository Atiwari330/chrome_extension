# Google Meet Real-Time Transcription Chrome Extension - Implementation Plan

## Version History
- **v1.0** - Initial plan
- **v2.0** - Updated based on technical coach feedback (addressing MV3 limitations, latency optimization, edge cases)

## Project Goal & Core Features

### What We're Building
A Chrome extension that provides real-time transcription for Google Meet sessions, capturing and displaying both the user's microphone input and other participants' audio in a persistent, user-friendly interface.

### Core Feature Set
1. **Dual Audio Capture**: Simultaneously transcribe user's microphone and tab audio (other participants)
2. **Persistent UI**: A floating widget that remains visible throughout the Google Meet session
3. **Real-Time Display**: Live transcription with clear visual separation between "You" and "Others"
4. **Simple Controls**: One-click start/stop recording functionality
5. **Comprehensive Logging**: Built-in debugging capabilities for troubleshooting

### User Experience Goals
- Zero friction: Works immediately when joining a Google Meet
- Always visible: Transcriptions stay on screen without blocking meeting controls
- Clear distinction: Easy to see who said what
- Reliable: Handles network issues gracefully with clear status indicators

## Architecture Overview

### High-Level Design (Updated for Low Latency)
```
┌─────────────────────────────────────────────────────────────┐
│                    Google Meet Tab                          │
│  ┌─────────────────┐                                       │
│  │ Content Script  │──────┐                                │
│  │  (Floating UI)  │      │                                │
│  └─────────────────┘      │                                │
│                           ▼                                 │
│  ┌─────────────────┐  ┌──────────────────┐               │
│  │   Mic Audio     │  │   Tab Audio      │               │
│  │  (getUserMedia) │  │  (tabCapture)    │               │
│  └────────┬────────┘  └────────┬─────────┘               │
│           ▼                    ▼                           │
│  ┌─────────────────┐  ┌──────────────────┐               │
│  │  AudioWorklet   │  │  AudioWorklet    │               │
│  │  (PCM Extract)  │  │  (PCM Extract)   │               │
│  └────────┬────────┘  └────────┬─────────┘               │
└───────────┼────────────────────┼───────────────────────────┘
            │ Raw PCM             │ Raw PCM
            ▼                    ▼
    ┌───────────────────────────────────┐
    │      Service Worker (MV3)         │
    │  ┌─────────────┐ ┌─────────────┐ │
    │  │ WebSocket 1 │ │ WebSocket 2 │ │
    │  │   (Mic)     │ │   (Tab)     │ │
    │  └──────┬──────┘ └──────┬──────┘ │
    │         │ 20s keepalive   │       │
    └─────────┼───────────────┼─────────┘
              │               │
              ▼               ▼
         ┌────────────────────────┐
         │   Deepgram API         │
         │  (Real-time STT)       │
         │  PCM: 16kHz, linear16  │
         └────────────────────────┘
```

### Component Breakdown
1. **Content Script**: Injects floating UI into Google Meet pages with DOM mutation observer
2. **Service Worker (MV3)**: Manages WebSocket connections with keepalive mechanism
3. **Floating UI**: Shadow DOM-based widget with audio level meters
4. **AudioWorklet Processors**: Low-latency PCM extraction (<3ms latency)
5. **Logger System**: Centralized logging with export and filtering capabilities

## Technology Choices & Justifications

### 1. Content Script with Shadow DOM for UI
**Choice**: Inject a floating widget directly into the Google Meet page using content scripts and Shadow DOM.

**Why**: Chrome immediately closes popups when users click away, making them unsuitable for persistent UI during meetings. Content scripts can inject UI that persists as part of the page DOM, and Shadow DOM provides style isolation preventing Google Meet's CSS from affecting our widget. This approach is proven by extensions like Grammarly and Loom that successfully use injected overlays.

### 2. Deepgram WebSocket API for Transcription
**Choice**: Use Deepgram's WebSocket API with the nova-3 model for real-time speech-to-text.

**Why**: Deepgram offers true real-time transcription with low latency through WebSocket connections, unlike OpenAI's Whisper which requires complete audio files. The nova-3 model provides excellent accuracy with speaker diarization capabilities, and their API is specifically designed for streaming scenarios with proven Chrome extension implementations already in production.

### 3. Dual WebSocket Architecture
**Choice**: Establish separate WebSocket connections for microphone and tab audio streams.

**Why**: Maintaining separate connections allows independent control and debugging of each audio source, prevents audio mixing issues that could confuse transcription, and provides clearer error handling when one stream fails. This architecture also makes it easier to display transcriptions with proper attribution to "You" vs "Others."

### 4. AudioWorklet with chrome.tabCapture (Updated)
**Choice**: Use AudioWorklet instead of MediaRecorder for ultra-low latency PCM extraction, combined with chrome.tabCapture for tab audio and getUserMedia for microphone.

**Why**: AudioWorklet provides <3ms latency compared to MediaRecorder's 250ms+ chunks, giving us direct access to raw PCM samples that we can stream immediately to Deepgram. This approach eliminates encoding/decoding overhead and gives us precise control over chunk sizes (20-250ms as recommended by Deepgram). The chrome.tabCapture API remains our method for tab audio capture, but now feeds into AudioWorklet for processing.

### 5. Service Worker with MV3 Keepalive Strategy (Updated)
**Choice**: Handle all Deepgram WebSocket connections in the service worker with a 20-second keepalive heartbeat mechanism.

**Why**: Chrome 116+ resets the service worker idle timer on WebSocket activity, allowing us to maintain persistent connections. By sending keepalive messages every 20 seconds, we prevent the 30-second idle termination. As a fallback, we'll implement chrome.alarms for recovery if the worker does terminate. This approach provides the stable background context needed for real-time transcription while working within MV3's constraints.

### 6. Comprehensive Logging System
**Choice**: Implement detailed logging at every level with in-UI log viewer and export capabilities.

**Why**: Real-time transcription involves multiple complex components (permissions, audio streams, network connections) that can fail in subtle ways. Having comprehensive logs will dramatically reduce debugging time when issues arise, and displaying logs in the UI allows users to provide detailed feedback without needing to open DevTools.

## Implementation Roadmap (Updated with Technical Improvements)

### Phase 1: Foundation & Chrome Requirements (Day 1)
1. Create manifest.json with minimum_chrome_version: "116"
2. Set up permission.html and iframe permission flow
3. Implement content script with DOM mutation observer
4. Create floating UI component with Shadow DOM and z-index management
5. Set up service worker with keepalive infrastructure

### Phase 2: Low-Latency Audio Capture (Day 1-2)
1. Implement AudioWorklet processor for PCM extraction
2. Set up getUserMedia with audio constraints
3. Integrate chrome.tabCapture with AudioWorklet pipeline
4. Test PCM output format (16kHz, linear16) and chunk timing

### Phase 3: Deepgram WebSocket Integration (Day 2)
1. Implement dual WebSocket connections with proper headers
2. Add 20-second keepalive heartbeat mechanism
3. Stream raw PCM data (not base64) with encoding parameters
4. Implement exponential backoff retry logic

### Phase 4: UI Features & Monitoring (Day 3)
1. Add real-time audio level meters for both streams
2. Implement transcription display with speaker labels
3. Add comprehensive logging with filtering and export
4. Create visual indicators for muted tab/Bluetooth warnings

### Phase 5: Testing & Edge Cases (Day 3-4)
1. E2E testing with Puppeteer for join→speak→verify flow
2. Test tab muting, Bluetooth headsets, DOM mutations
3. Measure and optimize 95th percentile latency
4. Document troubleshooting guide with common issues

## Previous Attempts & Lessons Learned

### What We Tried Before
1. **Web Speech API in Popup**: Failed due to popup closing when clicking away
2. **Side Panel with Web Speech API**: Failed due to "not-allowed" errors in restricted context
3. **Offscreen Document**: Web Speech API also restricted in offscreen documents

### Why Those Failed
The Web Speech API has strict context restrictions and doesn't work in extension-specific contexts like popups, side panels, or offscreen documents. We were trying to force a browser API designed for regular web pages into extension contexts where it's not supported.

### How This Plan Addresses Those Issues
By abandoning the Web Speech API entirely and using Deepgram's WebSocket API, we avoid all context restrictions. Content scripts can successfully use getUserMedia (verified in millions of video conferencing extensions), and injecting UI directly into the page sidesteps the popup persistence problem completely.

## Success Metrics (Updated)

1. **Functional**: Both audio streams transcribe accurately in real-time
2. **Performance**: 95th percentile latency < 300ms (tighter than original 500ms average)
3. **Reliability**: Graceful handling of network interruptions with auto-reconnect
4. **Usability**: Users can start transcription with one click and UI remains visible
5. **Debuggability**: Complete logs available with export functionality
6. **Edge Case Handling**: Clear warnings for muted tabs, Bluetooth issues

## Risk Mitigation (Enhanced)

1. **API Key Security**: Store in chrome.storage, never in code
2. **Performance**: Monitor memory usage, implement cleanup for long sessions
3. **Permissions**: Clear explanation to users about why each permission is needed
4. **Network Issues**: Exponential backoff for reconnection attempts
5. **Audio Quality**: Visual indicators for audio levels and quality
6. **MV3 Service Worker**: Keepalive mechanism with chrome.alarms fallback
7. **DOM Conflicts**: Mutation observer to re-inject UI if Google Meet updates
8. **Tab Audio Edge Cases**: Detect and warn about muted tabs or hardware echo cancellation

## Microphone Permission Strategy

### The Challenge
Chrome extensions cannot use the 'audioCapture' permission in manifest.json, and calling getUserMedia from a content script prompts for the website's permission, not the extension's. This results in confusing permission dialogs showing "meet.google.com wants to use your microphone" instead of our extension name.

### Our Solution: Iframe Permission Request
We'll use an iframe technique to ensure the permission dialog shows "[Extension Name] wants to use your microphone" and maintains permissions across all tabs.

### Implementation Flow

1. **Initial Setup Detection**
   ```javascript
   // Check if we have microphone permission on extension load
   const permissionStatus = await chrome.storage.local.get('micPermissionGranted');
   if (!permissionStatus.micPermissionGranted) {
     injectPermissionIframe();
   }
   ```

2. **Iframe Injection**
   ```javascript
   const injectPermissionIframe = () => {
     const iframe = document.createElement("iframe");
     iframe.setAttribute("hidden", "hidden");
     iframe.setAttribute("id", "micPermissionIframe");
     iframe.setAttribute("allow", "microphone");
     iframe.src = chrome.runtime.getURL("permission.html");
     document.body.appendChild(iframe);
   };
   ```

3. **Permission Request Page (permission.html)**
   - Loads in iframe context
   - Calls getUserMedia to trigger proper permission dialog
   - Communicates result back to content script
   - Self-removes after permission grant/deny

4. **Permission State Management**
   - Store permission state in chrome.storage
   - Check permission state before starting transcription
   - Show clear UI messages if permission denied
   - Provide "Grant Permission" button for retry

### User Experience Flow
1. User clicks extension icon on Google Meet
2. If first time: Hidden iframe requests microphone permission
3. Chrome shows: "[Extension Name] wants to use your microphone"
4. Permission granted once works across all tabs
5. If denied: Show instructions in floating UI with retry option

### Fallback Handling
- Detect permission denial with try/catch on getUserMedia
- Display clear message: "Microphone access required for transcription"
- Provide manual permission instructions if automated flow fails
- Link to chrome://settings/content/microphone for manual management

## Technical Specifications

### Minimum Requirements
- Chrome version: 116+ (for WebSocket keepalive support)
- Permissions: tabCapture, scripting, activeTab, storage
- Web Accessible Resources: permission.html

### Audio Configuration
- Format: Raw PCM (linear16)
- Sample Rate: 16kHz (configurable to 48kHz)
- Chunk Duration: 20-250ms
- Transport: Binary WebSocket messages (not base64)

### Deepgram WebSocket URL
```
wss://api.deepgram.com/v1/listen?model=nova-3&language=en-US&smart_format=true&encoding=linear16&sample_rate=16000
```

### Keepalive Implementation
```javascript
// Service worker keepalive
setInterval(() => {
  if (micSocket?.readyState === WebSocket.OPEN) {
    micSocket.send(JSON.stringify({ type: 'KeepAlive' }));
  }
  if (tabSocket?.readyState === WebSocket.OPEN) {
    tabSocket.send(JSON.stringify({ type: 'KeepAlive' }));
  }
}, 20000); // Every 20 seconds
```

## Files to Create

1. **manifest.json** - Extension configuration with web_accessible_resources
2. **permission.html** - Dedicated page for microphone permission request
3. **permission.js** - Script to handle getUserMedia in iframe context
4. **content.js** - Inject floating UI and handle permissions
5. **floating-ui.js** - UI component with transcription display and logs
6. **service-worker.js** - Deepgram WebSocket management with keepalive
7. **logger.js** - Centralized logging system with export functionality
8. **audio-worklet-processor.js** - AudioWorklet for low-latency PCM extraction
9. **audio-processor.js** - Audio pipeline coordination for dual streams
10. **styles.css** - Shadow DOM styles for floating widget
11. **config.js** - API key storage and configuration management

## Testing Strategy

### Automated Tests
1. **Unit Tests**: AudioWorklet processor, PCM conversion
2. **Integration Tests**: WebSocket connection, message handling
3. **E2E Tests**: Full flow with Puppeteer

### Manual Test Scenarios
1. Join Meet → Start recording → Speak → Verify transcription
2. Mute tab → Verify warning appears
3. Network disconnect → Verify reconnection
4. 30+ minute session → Verify no memory leaks
5. DOM updates → Verify UI persists

This plan represents a complete architectural shift from our previous attempts, incorporating lessons learned and addressing specific MV3 limitations while achieving ultra-low latency transcription.
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Google Meet Real-Time Transcription Chrome Extension (Manifest V3) that provides dual-stream transcription using Deepgram's WebSocket API. The extension captures both user microphone and tab audio separately, displaying real-time transcriptions in a floating widget.

## Key Architecture

### Core Components
- **service-worker.js**: Background service worker managing WebSocket connections to Deepgram API with MV3 keepalive strategy (20-second heartbeat)
- **content.js**: Main content script injected into Google Meet pages, creates and manages the floating UI
- **floating-ui.js**: Shadow DOM-based floating widget providing isolated UI for transcription display
- **audio-processor.js**: Handles audio stream capture and routing to AudioWorklet
- **audio-worklet-processor.js**: Low-latency (<3ms) PCM extraction for real-time streaming
- **offscreen.js**: Offscreen document for audio processing in Chrome's restricted context
- **logger.js**: Centralized logging system with debug/info/warn/error levels and export functionality

### Audio Flow
1. Microphone audio: getUserMedia → AudioWorklet → PCM extraction → WebSocket → Deepgram
2. Tab audio: chrome.tabCapture → AudioWorklet → PCM extraction → WebSocket → Deepgram

### Supporting Components
- **popup.html/js**: Extension popup interface for quick status checks and controls
- **options.html/js**: Settings page for API key configuration
- **permission.html/js**: Dedicated page for requesting microphone permissions
- **debug-test.js**: Browser console utilities for testing audio processing

## Development Commands

Since this is a pure JavaScript Chrome extension without npm/build tools:

1. **Loading the extension**:
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select this directory

2. **Reloading after changes**:
   - Click the refresh button on the extension card in `chrome://extensions/`
   - For content script changes: refresh the Google Meet tab

3. **Debugging**:
   - Service Worker: chrome://extensions/ → "Inspect views: service worker"
   - Content Scripts: F12 on Google Meet page
   - Popup/Options: Right-click → Inspect on the respective UI
   - Use `debug-test.js` in browser console for testing audio processing

4. **Testing**:
   - No automated test framework configured
   - Manual testing via Google Meet
   - Use browser console for debugging
   - Check `TESTING_GUIDE.md` for testing procedures

## Important Implementation Details

### Security Note
The service worker contains a hardcoded API key at line 46 that should be removed before production deployment. The extension should only use API keys from user settings stored in chrome.storage.local.

### MV3 Service Worker Lifecycle
- Service workers terminate after 30 seconds of inactivity
- WebSocket activity resets the timer in Chrome 116+
- Keepalive messages sent every 20 seconds maintain connection
- Chrome.alarms used as fallback recovery mechanism

### Audio Processing
- Uses AudioWorklet for ultra-low latency (not MediaRecorder)
- Processes PCM audio at 16kHz sample rate
- Sends 250ms chunks to Deepgram for optimal transcription
- Separate WebSocket connections for mic and tab audio

### UI Architecture
- Shadow DOM prevents Google Meet styles from affecting the widget
- Floating widget remains visible and draggable during meetings
- Mutation observer ensures widget persists through DOM changes
- Audio level meters provide visual feedback

### Error Handling
- Comprehensive logging system with exportable logs (via logger.js)
- Connection status indicators (gray/orange/green/red)
- Automatic reconnection on WebSocket failures
- Clear user feedback for missing API keys

### Chrome Extension Requirements
- Manifest V3 compliant
- Requires Chrome 116+ for optimal WebSocket support
- Permissions: storage, scripting, activeTab, tabCapture, alarms, offscreen
- Host permissions limited to meet.google.com

## Common Tasks

### Adding new UI features
1. Modify `floating-ui.js` for Shadow DOM components
2. Update styles within the shadow root (styles.css is loaded into shadow DOM)
3. Test dragging functionality doesn't break
4. Ensure mutation observer continues to work

### Modifying audio processing
1. Update `audio-worklet-processor.js` for processing logic
2. Ensure PCM format remains 16kHz, linear16 for Deepgram
3. Test latency remains under 3ms
4. Verify both mic and tab audio streams work independently

### Debugging transcription issues
1. Check service worker console for WebSocket messages
2. Verify API key is loaded from storage (not hardcoded)
3. Monitor audio levels in the floating widget
4. Export logs using the built-in logging system
5. Check offscreen document console for tab audio issues

### Working with Deepgram API
1. WebSocket endpoint: wss://api.deepgram.com/v1/listen
2. Parameters: encoding=linear16, sample_rate=16000, channels=1
3. Audio format: 16-bit PCM, mono, 16kHz
4. Chunking: 250ms audio segments for optimal latency
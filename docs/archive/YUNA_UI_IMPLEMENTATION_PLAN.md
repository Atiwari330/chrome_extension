# Yuna UI Implementation Plan

## Recent Updates
This plan has been updated to address critical implementation issues:
- **Event Listener Management**: Added explicit re-attachment strategy after render()
- **Null Guards**: Added safety checks for audio update methods
- **State Synchronization**: Added message passing between UI and content script
- **CSS Clarification**: Corrected to reference embedded CSS string in content.js (not styles.css)
- **Security TODO**: Added reminder about hardcoded API key for post-MVP work

## Overview
This document outlines the implementation plan for redesigning the Google Meet Real-Time Transcription Chrome Extension UI to become "Yuna" - a behavioral/mental health focused transcription tool. The primary constraint is maintaining 100% of the existing dual-stream transcription functionality.

## Critical Requirements
1. **MUST NOT BREAK**: Microphone audio transcription from provider
2. **MUST NOT BREAK**: Tab audio transcription from client
3. **MUST NOT BREAK**: WebSocket connections to Deepgram
4. **MUST NOT BREAK**: AudioWorklet processing pipeline
5. **MUST NOT BREAK**: Service worker lifecycle management

## Current Architecture Analysis

### Audio Flow (DO NOT MODIFY)
```
Provider's Mic → getUserMedia → AudioWorklet → PCM → WebSocket → Deepgram
Client's Audio → chrome.tabCapture → AudioWorklet → PCM → WebSocket → Deepgram
```

### Key Components and Their Roles

#### 1. service-worker.js (DO NOT TOUCH)
- Manages WebSocket connections to Deepgram
- Handles tab audio capture entirely in background
- Maintains keepalive strategy for persistent connections
- **Decision**: Zero modifications to preserve audio pipeline

#### 2. audio-processor.js (DO NOT TOUCH)
- Handles audio stream capture and routing
- Creates AudioWorklet nodes for processing
- **Decision**: No changes to maintain low-latency processing

#### 3. audio-worklet-processor.js (DO NOT TOUCH)
- Performs PCM extraction with <3ms latency
- Critical for real-time streaming
- **Decision**: No modifications to preserve audio quality

#### 4. floating-ui.js (MODIFY CAREFULLY)
- Contains UI rendering logic
- Handles user interactions
- **Decision**: Only modify rendering methods and UI state management
- **CRITICAL**: Must handle event listener re-attachment after each render

#### 5. content.js (MINIMAL CHANGES)  
- Injects floating UI into page
- Sets up Shadow DOM
- Contains embedded CSS string (NOT external styles.css file)
- **Decision**: Only update embedded CSS string, no logic changes

#### TODO: Post-MVP Security
- **TODO**: Remove hardcoded API key from service-worker.js line 46
- Current: `this.apiKey = 'ea2f05e0565364f93936d157fc4b7d20ac06691b';`
- Future: Load from chrome.storage.local only

## Implementation Strategy

### Phase 1: State Management Foundation
**Why**: Need to support multiple screens without breaking existing functionality

```javascript
// Add to FloatingUI class
this.currentScreen = 'initial'; // 'initial', 'context', 'transcription'
this.sessionContext = ''; // Store patient context
```

**Justification**: Adding state variables doesn't affect audio processing. The existing `isTranscribing` state remains untouched.

### Phase 2: Event Listener Management (CRITICAL FIX)
**Problem**: Current code calls `setupEventListeners()` once after initial render. Re-rendering wipes innerHTML and destroys all listeners.

**Solution A - Re-attach After Each Render (Simple but repetitive)**:
```javascript
// Update each render method to re-attach listeners
renderInitialScreen() {
    this.shadowRoot.innerHTML = `<!-- initial screen HTML -->`;
    this.setupEventListeners(); // Re-attach after DOM update
}

renderContextScreen() {
    this.shadowRoot.innerHTML = `<!-- context screen HTML -->`;
    this.setupEventListeners(); // Re-attach after DOM update
}

renderTranscriptionScreen() {
    this.shadowRoot.innerHTML = `<!-- transcription screen HTML -->`;
    this.setupEventListeners(); // Re-attach after DOM update
}

// Main render method
render() {
    if (this.currentScreen === 'initial') {
        this.renderInitialScreen();
    } else if (this.currentScreen === 'context') {
        this.renderContextScreen();
    } else if (this.currentScreen === 'transcription') {
        this.renderTranscriptionScreen();
    }
    // Note: setupEventListeners() called inside each render method above
}
```

**Solution B - Event Delegation (Preferred - attach once)**:
```javascript
// In constructor, after initial render
constructor(shadowRoot, contentScript) {
    // ... existing constructor code ...
    this.render();
    this.setupDelegatedListeners(); // Call once, survives all re-renders
}

setupDelegatedListeners() {
    // Attach to shadowRoot once, handle all future clicks
    this.shadowRoot.addEventListener('click', (e) => {
        // Handle all button clicks by data attribute
        const button = e.target.closest('button[data-action]');
        if (!button) return;
        
        const action = button.dataset.action;
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
                this.currentScreen = 'transcription';
                this.render();
                this.contentScript.startTranscription();
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
            // Add all other button handlers here
        }
    });
    
    // Separate listener for drag functionality (already on document)
    // Keep existing drag listeners as-is
}

// Update HTML in render methods to use data-action
renderInitialScreen() {
    this.shadowRoot.innerHTML = `
        <div id="floating-widget">
            <!-- ... header ... -->
            <button data-action="add-context">Add context</button>
            <button data-action="start-encounter">Start encounter</button>
            <button data-action="open-settings">Settings</button>
        </div>
    `;
}
```

**Implementation Decision**: Use Solution B (event delegation) because:
1. More performant - only one listener attachment
2. Survives all DOM updates automatically  
3. Easier to maintain - all click handling in one place
4. No risk of forgetting to re-attach after a render

**Justification**: Without this fix, buttons on second/third screens won't work at all.

### Phase 3: Modify render() Method with Null Guards
**Why**: Need to show different screens based on state AND ensure audio updates don't fail

```javascript
// Add null guards to audio update methods
updateAudioLevel(source, level) {
    const indicatorId = source === 'user' ? 'mic-indicator' : 'tab-indicator';
    const indicator = this.shadowRoot.getElementById(indicatorId);
    if (!indicator) return; // Null guard - element may not exist on current screen
    
    const levelBar = indicator.querySelector('.level-bar');
    if (!levelBar) return;
    
    // Rest of method...
}

updateTranscription(source, text, isFinal) {
    const element = this.shadowRoot.getElementById('unified-transcription');
    if (!element) {
        // Not on transcription screen, store for later or ignore
        return;
    }
    // Rest of method...
}
```

**Justification**: 
- Audio updates arrive asynchronously and may target elements not present on current screen
- Null guards prevent runtime errors
- Existing transcription logic remains intact

### Phase 4: Initial Screen Implementation
**Components to Include**:
1. Yuna branding (replaces "Meet Transcription")
2. Context section with "Add context" button
3. Settings button (preserve existing API key functionality)
4. "Start encounter" button

**Components to Remove**:
- Tab permission notice (move to transcription screen if needed)
- Audio level indicators (move to transcription screen)
- Logs section (can be accessed via settings if needed)

**Justification**: None of these UI changes affect the audio pipeline. The settings functionality for API key remains intact.

### Phase 5: Context Input Screen
**Implementation**:
```javascript
renderContextScreen() {
    // Textarea for context input
    // Back button to initial screen
    // Continue button to start transcription
}
```

**Justification**: This is purely additive UI - no impact on existing functionality.

### Phase 6: Transcription Screen Updates
**Preserve**:
- All transcription update logic
- Audio level monitoring
- WebSocket status indicators
- Clear button functionality

**Modify**:
- Add context display at top
- Update speaker labels ("You:" and "Client:")
- Adjust colors for speaker differentiation
- Replace "Start/Stop Recording" with "End session"

**Justification**: 
- `updateTranscription()` method logic remains identical
- Only the HTML structure and CSS classes change
- All audio event handling stays the same

### Phase 7: State Synchronization (CRITICAL FIX)
**Problem**: FloatingUI and MeetTranscriptionExtension need to maintain synchronized state

**Solution**: Use explicit messages between components
```javascript
// In FloatingUI when starting
async startEncounter() {
    this.currentScreen = 'transcription';
    this.render();
    
    // Notify content script to start
    this.contentScript.startTranscription();
    
    // Listen for confirmation
    chrome.runtime.onMessage.addListener((request) => {
        if (request.type === 'SESSION_STARTED') {
            this.isRecording = true;
        }
    });
}

// In MeetTranscriptionExtension
async startTranscription() {
    // ... existing start logic ...
    this.isTranscribing = true;
    
    // Notify UI of state change
    chrome.runtime.sendMessage({ type: 'SESSION_STARTED' });
}

// Similar for stop/end session
```

**Justification**: Prevents state mismatch where UI thinks recording stopped but backend still running.

### Phase 8: Event Handler Updates
**Modify toggleRecording()**: 
```javascript
async toggleRecording() {
    if (this.contentScript.isTranscribing) {
        // Existing stop logic remains
        this.contentScript.stopTranscription();
        this.currentScreen = 'initial'; // Return to start
        this.sessionContext = ''; // Clear context
        
        // Ensure state sync
        chrome.runtime.sendMessage({ type: 'SESSION_STOPPED' });
    } else {
        // Start only if context provided
        if (this.currentScreen === 'transcription') {
            this.contentScript.startTranscription();
        }
    }
}
```

**Justification**: The core start/stop logic remains unchanged. We only add UI state management around it.

## Style Updates (Embedded CSS in content.js)

**IMPORTANT**: Styles are NOT in a separate styles.css file. They are embedded as a string in content.js (lines 172-835).

### Safe Modifications to CSS String
1. **Colors**: Update to dark theme with purple/blue gradients
2. **Typography**: Adjust fonts and sizes  
3. **Layout**: Modify spacing and positioning
4. **Effects**: Add glass-morphism (backdrop-filter)
5. **Variables**: Reuse existing CSS variables (--primary-color, --bg-dark, etc.)

### Preserve in CSS String
1. **Shadow DOM isolation**: Keep :host rules
2. **Z-index values**: Maintain layering (2147483647)
3. **Pointer-events**: Keep interaction handling
4. **Scrollbar styling**: Maintain for transcription area

**Implementation Note**: Update the `style.textContent = \`...\`;` string in content.js, NOT a separate file.

**Justification**: CSS changes are purely visual and don't affect functionality. The existing CSS variables are already properly defined and can be reused.

## Testing Strategy

### Audio Functionality Tests
1. Start recording → Verify mic audio captures
2. Click extension icon → Verify tab audio permission flow
3. Check WebSocket connections in service worker console
4. Verify transcriptions appear for both streams
5. Test stop/restart cycles

### UI Flow Tests
1. Initial screen → Add context → Start encounter
2. Verify context persists during session
3. Test "End session" returns to initial screen
4. Verify context clears on new session

## Rollback Plan
If any audio functionality breaks:
1. Git revert UI changes
2. Keep service-worker.js, audio-processor.js, audio-worklet-processor.js untouched
3. Test with original floating-ui.js to isolate issues

## Implementation Order
1. **Day 1**: Create new render methods, test without removing old UI
2. **Day 2**: Implement state management and screen transitions
3. **Day 3**: Style updates and visual polish
4. **Day 4**: Testing and bug fixes
5. **Day 5**: Final testing with real Google Meet calls

## Risk Mitigation

### High Risk Areas (With Mitigation)
1. **Event listeners** (CRITICAL): Must re-attach after each render() or use delegation
2. **Audio update selectors** (CRITICAL): Add null guards to prevent errors when elements don't exist
3. **State synchronization** (CRITICAL): Use explicit messages between FloatingUI and MeetTranscriptionExtension
4. **Shadow DOM styles**: Test extensively in Chrome
5. **Message passing**: Verify chrome.runtime.onMessage still works

### Low Risk Areas
1. **Visual styling**: Can't break audio
2. **Text labels**: Safe to change
3. **Colors and fonts**: No functional impact

## Success Criteria
1. ✓ Both audio streams continue to transcribe
2. ✓ WebSocket connections remain stable
3. ✓ No increase in latency
4. ✓ Clean, therapist-friendly UI
5. ✓ Smooth screen transitions
6. ✓ Context persists during session

## Conclusion
This plan ensures we achieve the UI redesign goals while maintaining 100% of the existing transcription functionality. By carefully isolating UI changes from the audio processing pipeline, we minimize risk while delivering a professional, healthcare-focused interface.
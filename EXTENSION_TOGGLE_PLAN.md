# Extension Icon Toggle Implementation Plan

## Overview

This plan outlines the implementation of a toggle feature for the Yuna Chrome Extension's floating UI. Currently, the UI appears automatically when users navigate to Google Meet. The desired behavior is for the UI to only appear when users explicitly click the extension icon in the Chrome toolbar.

**CRITICAL**: The transcription functionality MUST remain intact. The audio pipeline (microphone and tab audio capture → WebSocket → Deepgram) works correctly and must not be broken.

## Current Behavior (Problem Statement)

1. User navigates to Google Meet
2. Floating UI appears automatically
3. User must click extension icon to grant tab audio recording permission
4. UI cannot be hidden via extension icon (only minimized via UI button)

## Desired Behavior (Solution)

1. User navigates to Google Meet
2. No UI appears automatically
3. User clicks extension icon to:
   - Show the floating UI (if hidden)
   - Grant tab audio recording permission (as currently implemented)
   - Hide the floating UI (if visible)
4. UI state persists across page refreshes

## Technical Context

### Key Files
- **service-worker.js**: Background service worker handling extension icon clicks
- **content.js**: Content script that creates and manages the floating UI
- **floating-ui.js**: UI component class for the floating widget
- **manifest.json**: Extension configuration (uses Manifest V3)

### Current Architecture
- Extension icon click is handled by `chrome.action.onClicked` in service-worker.js (lines 719-747)
- Current handler only manages tab audio permissions via `PERMISSION_GRANTED` message
- Floating UI is created automatically in content.js when detecting a Google Meet session
- No existing mechanism to toggle UI visibility via extension icon

### Critical Audio Flow Dependencies
**DO NOT MODIFY THESE FLOWS:**

1. **Microphone Audio Flow**:
   - `content.js` → `startTranscription()` → `getUserMedia()` → `audioProcessor.startMicrophoneProcessing()`
   - Audio data → `AudioWorkletNode` → PCM extraction → Base64 encoding → Service Worker
   - Service Worker → WebSocket (user) → Deepgram

2. **Tab Audio Flow**:
   - `content.js` → `requestTabAudio()` → Service Worker → `chrome.tabCapture.capture()`
   - Stream ID → Offscreen document → `getUserMedia(streamId)` → AudioWorklet
   - Audio data → Base64 → Service Worker → WebSocket (others) → Deepgram

3. **UI-Audio Integration Points**:
   - `startTranscription()` is triggered by "Start encounter" button click
   - `stopTranscription()` is triggered by "End session" button click
   - Audio levels update UI via `updateAudioLevel()` calls
   - Transcriptions update UI via Chrome runtime messages

## Implementation Epics

### Epic 1: Add UI Visibility State Management

**Goal**: Implement persistent state tracking for UI visibility across browser sessions

#### User Story 1.1: Add Chrome Storage for UI State
**As a** user  
**I want** my UI visibility preference to persist  
**So that** the extension remembers my choice across browser sessions

**Acceptance Criteria**:
- UI visibility state is stored in `chrome.storage.local`
- State persists across page refreshes and browser restarts
- Default state is `hidden: true` (UI not shown automatically)

**Implementation Tasks**:
1. Add storage initialization in content.js
2. Check stored state before creating UI
3. Update state when UI visibility changes

#### User Story 1.2: Implement State Synchronization
**As a** developer  
**I want** UI state to be synchronized between components  
**So that** all parts of the extension have consistent state

**Acceptance Criteria**:
- Service worker can query current UI state
- Content script updates storage when UI state changes
- State changes are atomic and race-condition free

### Epic 2: Modify Extension Icon Click Behavior

**Goal**: Make extension icon toggle UI visibility while maintaining permission granting

#### User Story 2.1: Update Service Worker Icon Handler
**As a** user  
**I want** clicking the extension icon to toggle the UI  
**So that** I can control when the transcription widget appears

**Acceptance Criteria**:
- Clicking icon toggles UI between visible/hidden states
- Tab audio permission is still granted on first click
- Service worker sends appropriate messages to content script

**Implementation Tasks**:
1. Modify `chrome.action.onClicked` listener in service-worker.js
2. Query current UI state from storage
3. Send `TOGGLE_UI` message with new state to content script
4. Maintain existing `PERMISSION_GRANTED` logic

**Code Location**: service-worker.js, lines 719-747

#### User Story 2.2: Handle Toggle Messages in Content Script
**As a** content script  
**I want** to respond to toggle messages from the service worker  
**So that** I can show/hide the UI appropriately

**Acceptance Criteria**:
- Content script handles `TOGGLE_UI` message
- UI is created if it doesn't exist and should be shown
- UI is hidden/shown based on message payload
- State is updated in chrome.storage.local

**Implementation Tasks**:
1. Add `TOGGLE_UI` case in message listener (content.js)
2. Implement `showUI()` and `hideUI()` methods
3. Update storage after visibility changes
4. Handle edge cases (UI not created yet, etc.)

### Epic 3: Prevent Automatic UI Display

**Goal**: Stop the floating UI from appearing automatically on Google Meet pages

#### User Story 3.1: Modify Initial UI Creation Logic
**As a** user  
**I want** the UI to not appear automatically  
**So that** I have control over when to use the extension

**Acceptance Criteria**:
- UI is not created automatically when visiting Google Meet
- Microphone permission flow still works correctly
- UI can be created on-demand via extension icon
- Audio processing capabilities remain intact even when UI is not visible

**Implementation Tasks**:
1. Modify `init()` method in content.js
2. Check stored visibility state before creating UI
3. Separate permission handling from UI creation
4. Ensure UI creation can be triggered later
5. **CRITICAL**: Keep all audio initialization code intact - only skip `createFloatingUI()` call

**Code Location**: content.js, lines 17-46

**Safety Checks**:
- Verify `setupMessageListeners()` is still called (needed for audio messages)
- Verify `setupDOMObserver()` is still called (needed for UI re-injection)
- Ensure microphone permission iframe can still be injected when needed
- Test that audio streams can be started even if UI was never shown

### Epic 4: Enhance UI Component for Visibility Control

**Goal**: Add proper show/hide methods to the floating UI component

#### User Story 4.1: Add Visibility Methods to FloatingUI
**As a** floating UI component  
**I want** proper show/hide methods  
**So that** my visibility can be controlled programmatically

**Acceptance Criteria**:
- FloatingUI class has `show()` and `hide()` methods
- Methods handle CSS display properties correctly
- Widget state is preserved when hidden
- Drag position is maintained across show/hide cycles
- **CRITICAL**: Audio continues processing when UI is hidden
- **CRITICAL**: Transcription data is buffered when UI is hidden

**Implementation Tasks**:
1. Add `show()` method to FloatingUI class
2. Add `hide()` method to FloatingUI class
3. Ensure minimize state is independent of visibility
4. Test with active transcription sessions
5. Add null checks to `updateAudioLevel()` and `updateTranscription()` methods
6. Implement transcription buffer to store messages while UI is hidden

**Safety Implementation Details**:
```javascript
// In floating-ui.js
hide() {
    // Only hide the container, don't destroy it
    const container = document.getElementById('meet-transcription-container');
    if (container) {
        container.style.display = 'none';
        this.isVisible = false;
    }
    // Audio processing continues unaffected
}

show() {
    const container = document.getElementById('meet-transcription-container');
    if (container) {
        container.style.display = 'block';
        this.isVisible = true;
        // Apply any buffered transcriptions
        this.flushTranscriptionBuffer();
    }
}

// Add to updateTranscription method:
updateTranscription(source, text, isFinal) {
    if (!this.isVisible) {
        // Buffer the transcription for later
        this.transcriptionBuffer.push({ source, text, isFinal });
        return;
    }
    // Existing update logic...
}
```

### Epic 5: User Experience Enhancements

**Goal**: Provide clear feedback to users about extension state

#### User Story 5.1: Add Visual Feedback for Extension State
**As a** user  
**I want** to know when the extension is active but hidden  
**So that** I don't forget the extension is available

**Acceptance Criteria**:
- Extension icon badge shows when UI is hidden but available
- Clear indication when transcription is active but UI is hidden
- Notification when UI is toggled

**Implementation Tasks**:
1. Add chrome.action.setBadgeText for state indication
2. Show brief notification on toggle
3. Update badge when transcription is active

## Implementation Order

1. **Phase 1**: State Management (Epic 1)
   - Implement storage for UI visibility state
   - Ensure state persistence works correctly

2. **Phase 2**: Prevent Auto-Display (Epic 3)
   - Modify content.js to check state before creating UI
   - Separate permission flow from UI creation

3. **Phase 3**: Toggle Functionality (Epic 2 & 4)
   - Update service worker to send toggle messages
   - Implement show/hide methods in FloatingUI
   - Add message handling in content script

4. **Phase 4**: Polish (Epic 5)
   - Add visual feedback
   - Test edge cases
   - Ensure smooth user experience

## Testing Considerations

1. **Visibility State Testing**:
   - UI hidden by default on fresh install
   - State persists across refreshes
   - State persists across browser restart

2. **Toggle Functionality Testing**:
   - First click shows UI and grants permissions
   - Subsequent clicks toggle visibility
   - Toggle works during active transcription

3. **Edge Cases**:
   - Multiple Google Meet tabs open
   - Rapid clicking of extension icon
   - UI manually closed via DOM manipulation
   - Extension updated while UI is visible

4. **Critical Audio Testing** (MUST PASS ALL):
   - Start transcription with UI visible → Hide UI → Verify audio continues
   - Start with hidden UI → Begin transcription → Show UI → Verify transcriptions appear
   - Hide UI during active transcription → Speak → Show UI → Verify buffered transcriptions appear
   - Test both microphone and tab audio continue working when UI is hidden
   - Verify WebSocket connections remain stable during UI toggle
   - Check audio level processing continues even when UI elements don't exist

## Risk Mitigation

1. **Risk**: Breaking existing transcription functionality
   - **Mitigation**: 
     - No modifications to audio pipeline files (audio-processor.js, audio-worklet-processor.js)
     - Only modify UI visibility, not audio processing logic
     - Add comprehensive null checks before UI updates
     - Test each phase thoroughly before proceeding

2. **Risk**: Race conditions with state management
   - **Mitigation**: 
     - Use atomic storage operations
     - Check UI existence before operations
     - Handle case where UI is toggled during initialization

3. **Risk**: UI not appearing when needed
   - **Mitigation**: 
     - Force show UI when user clicks "Start encounter" if hidden
     - Add error recovery if UI creation fails
     - Log all UI state changes for debugging

4. **Risk**: Confusing user experience
   - **Mitigation**: 
     - Clear visual feedback via badge/notifications
     - Consistent toggle behavior
     - Show UI automatically if user starts transcription

5. **Risk**: Audio stream interruption
   - **Mitigation**:
     - Never call `stopTranscription()` when hiding UI
     - Keep all audio objects (streams, processors) alive
     - Only modify visual elements, not audio elements

## Success Criteria

1. UI does not appear automatically on Google Meet pages
2. Extension icon reliably toggles UI visibility
3. Tab audio permissions still work correctly
4. No regression in transcription functionality
5. State persists across browser sessions
6. Clear user feedback about extension state

## Code Safety Notes

**ABSOLUTE DO NOT MODIFY LIST:**
- audio-processor.js (handles AudioWorklet setup)
- audio-worklet-processor.js (PCM extraction logic)
- offscreen.js (tab audio capture)
- Any WebSocket connection code in service-worker.js
- Any Deepgram API interaction code
- Service worker lifecycle management code

**SAFE TO MODIFY:**
- UI visibility logic in content.js and floating-ui.js
- Chrome storage for UI state
- Message handlers for UI toggle (new messages only)
- CSS display properties for showing/hiding

**CRITICAL TESTING CHECKPOINTS:**
1. After Phase 1: Verify storage works without breaking anything
2. After Phase 2: Verify audio still initializes without UI
3. After Phase 3: Full audio test - both streams must work
4. After Phase 4: Stress test with multiple scenarios

## Implementation Safety Checklist

Before starting each phase, verify:
- [ ] Current transcription works (test both mic and tab audio)
- [ ] Create a backup branch from current state
- [ ] Have browser DevTools open to monitor errors

After each code change:
- [ ] Test transcription still works
- [ ] Check browser console for errors
- [ ] Verify WebSocket connections in service worker console

## Emergency Rollback Plan

If transcription breaks at any point:
1. `git stash` or `git reset --hard HEAD`
2. Reload extension in chrome://extensions/
3. Clear chrome.storage.local if needed
4. Return to last known working state

This plan provides a complete roadmap for implementing the extension icon toggle feature while maintaining all existing functionality. The risk of breaking transcription is minimized by careful separation of UI and audio concerns.
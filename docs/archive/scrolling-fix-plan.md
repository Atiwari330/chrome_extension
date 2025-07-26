# Transcription UI Scrolling Fix Plan (Refined)

## Problem Statement
The Yuna transcription widget's UI extends beyond the viewport as conversations grow longer. Currently, the entire widget expands vertically instead of maintaining a bounded height with scrollable content. This causes the bottom controls (End Session button, audio indicators) to disappear off-screen.

## Root Cause Analysis
After examining the CSS in `content.js`, the issue stems from:

1. **Unbounded Height Container**: The widget uses `min-height: 600px` in transcription mode, allowing it to grow indefinitely
2. **Improper Flex Structure**: While `.transcription-content` has `overflow-y: auto`, its parent containers don't properly constrain the height
3. **Missing Height Constraints**: The `.transcription-screen` uses `height: 100%` but its parent doesn't have a maximum height limit

## Refined Solution (After Collaborative Review)

### 1. Flexible Widget Height with CSS Variables
**Proposed CSS:**
```css
:root {
  --yuna-widget-min-h: 550px;  /* Increased for better appearance on tall viewports */
  --yuna-widget-max-h: 80vh;
}

#floating-widget.transcription-mode {
  min-height: var(--yuna-widget-min-h);
  max-height: var(--yuna-widget-max-h);
  height: auto;  /* Let content determine height up to max */
  display: flex;
  flex-direction: column;
  overflow-x: hidden;  /* Prevent horizontal scroll only */
}
```

**Rationale:** 
- Provides flexibility for content while maintaining boundaries
- CSS variables allow easy future adjustments without code changes
- `height: auto` allows widget to be smaller when content is minimal
- `overflow-x: hidden` prevents horizontal scrollbars while letting inner content handle vertical scrolling

### 2. Properly Scoped Container Structure
**Update transcription screen with specific selectors:**
```css
#floating-widget.transcription-mode .transcription-screen {
  display: flex;
  flex-direction: column;
  height: 100%;
  /* No overflow needed here */
}

#floating-widget.transcription-mode .transcription-section {
  flex: 1;
  margin: 8px 16px 0;  /* Reduced margins to preserve vertical space */
  min-height: 0;       /* Critical for flex children */
  display: flex;
  flex-direction: column;
}
```

**Rationale:** 
- Scoped selectors prevent affecting other screens
- Reduced margins save 16px of vertical space
- No overflow rules needed at this level - let inner content handle it

### 3. Transcription Pane and Content Structure
**Ensure proper flex hierarchy for scrolling:**
```css
#floating-widget.transcription-mode .transcription-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  /* Keep existing background and border styles */
}

.transcription-content {
  flex: 1;
  overflow-y: auto;
  min-height: 0;  /* Critical for proper flex scrolling */
  /* Keep existing scrollbar styles */
}
```

**Rationale:** 
- The `.transcription-pane` must be a flex container to properly distribute space to its children
- The `min-height: 0` on `.transcription-content` is crucial for flex children to properly shrink below their content height, enabling scrolling within the bounded container

## Why This Solution is Safe

### 1. **No JavaScript Changes Required**
- All fixes are CSS-only, contained within the `content.js` style string
- No modifications to `floating-ui.js` logic or event handlers
- Preserves all existing functionality

### 2. **Maintains Core Functionality**
- **Audio Capture**: Unaffected - runs through service worker and audio processors
- **WebSocket Connections**: Unaffected - managed by service worker
- **Transcription Updates**: Unaffected - `updateTranscription()` method remains unchanged
- **UI Interactions**: All buttons, drag functionality, and state management remain intact

### 3. **Preserves Existing Features**
- Auto-scroll behavior in `updateTranscription()` (line 695, 737) continues to work
- Scrollbar styling (lines 586-600) remains functional
- All three screens (initial, context, transcription) maintain their layouts
- Minimize functionality still works correctly

### 4. **Backward Compatible**
- Existing class names and IDs are preserved
- No changes to DOM structure in `floating-ui.js`
- All render methods continue to produce the same HTML

## Implementation Steps

1. **Locate the CSS string** in `content.js` (search for `const style = document.createElement('style');`)
2. **Find the end of the style string** (before the closing backtick around line 1173)
3. **IMPORTANT: Append the new CSS rules AFTER all existing rules** to ensure they win the cascade
   - This is critical if there are any existing `#floating-widget.transcription-mode` rules
   - The new rules must come last to override without needing `!important`
4. **Search for selectors by name** rather than line numbers to avoid drift issues
5. **Test** using the priority scenarios below

## Expected Outcome
- Widget flexibly sizes between 550px and 80vh based on content
- Transcription content scrolls within its container when needed
- Bottom controls (End Session, audio indicators) always remain visible
- No horizontal scrollbars appear
- No impact on core transcription functionality

## Potential Edge Cases Addressed
1. **Small viewports**: The `max-height: 80vh` ensures widget fits on smaller screens
2. **Empty transcriptions**: Placeholder text remains centered due to existing styles
3. **Long patient context**: The context box is outside the scrollable area, so it remains visible
4. **Rapid transcription updates**: Auto-scroll remains instant (no smooth scrolling) for performance
5. **Box-shadow clipping**: Current shadows don't extend beyond widget boundaries
6. **Tooltip positioning**: All tooltips render inside the widget, no clipping issues

## Priority Testing Checklist
**High Priority (Test First):**
- [ ] **Long transcription on 1080p screen** - Verify bottom controls stay visible and scrollbar appears
- [ ] **Small viewport (768px height)** - Ensure widget caps at 80vh and everything is usable
- [ ] **Drag & minimize with active scroll** - Start transcription, scroll halfway, drag widget, minimize, restore; confirm scroll position and controls remain consistent

**Standard Testing:**
- [ ] Widget height adjusts between min/max based on content
- [ ] No horizontal scrollbars appear
- [ ] Audio transcription continues working (both mic and tab)
- [ ] All three screens display correctly
- [ ] Auto-scroll to bottom works for new transcriptions
- [ ] CSS variables can be adjusted in DevTools for testing

## Key Improvements from Collaboration
1. **Flexible height instead of fixed** - Better UX across different screen sizes
2. **CSS variables** - Easy configuration without code changes
3. **Reduced margins** - More vertical space for content
4. **Scoped selectors** - Prevents unintended side effects
5. **Simplified overflow handling** - Only horizontal prevention needed on outer container
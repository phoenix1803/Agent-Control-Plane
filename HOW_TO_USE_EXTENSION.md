# How to Use the VS Code Extension UI - Step by Step Guide

## 🎯 Quick Start (5 minutes)

### Step 1: Build the Project
```bash
npm run build
```

### Step 2: Open VS Code
```bash
code .
```

### Step 3: Open Command Palette
Press: `Ctrl + Shift + P` (Windows/Linux) or `Cmd + Shift + P` (Mac)

### Step 4: Run the Extension
Type: `ACP: Open Trace`

### Step 5: Select a Trace File
Choose a trace from your `traces/` folder (or generate one first with `npm run demo`)

### Step 6: Use the Controls
See visual playback buttons at the top!

---

## 📋 Step-by-Step Detailed Guide

### Step 1: Generate a Trace (If You Don't Have One)

```bash
npm run demo
```

This creates a trace file in `traces/trace_*.json`

---

### Step 2: Start VS Code

Open the Agent-Control-Plane folder in VS Code:
```bash
code .
```

---

### Step 3: Open the Extension Sidebar

Look for the **Agent Control Plane** icon in the left sidebar (if not visible, search for "Agent Control Plane" in extensions)

---

### Step 4: Use the Traces View

In the left sidebar, you'll see:
- **Traces** - List of all trace files
- **Steps** - Steps of the currently loaded trace

---

### Step 5: Open a Trace

**Method A: Click in Sidebar**
1. Expand "Traces" section
2. Click on a trace file
3. It opens automatically

**Method B: Command Palette**
1. Press `Ctrl + Shift + P`
2. Type: `ACP: Open Trace`
3. Choose a trace file

**Method C: From File Explorer**
1. Find a trace file in `traces/` folder
2. Right-click → `ACP: Open Trace`

---

### Step 6: See the Webview Panel

A new panel opens on the right showing:

```
┌─────────────────────────────────────┐
│ Trace: trace_123456                 │
│                                     │
│ [⏮][◀][▶][⏸][▶][⏭][🎯][🔍]       │
│ [████░░░░░░░░░░░░░░░░░░░░] 45%      │
│                                     │
├─────────────────┬──────────────────┤
│ Steps           │ Current Step     │
│                 │                  │
│ [Step 0] llm    │ Step 3 (TOOL)    │
│ [Step 1] tool   │                  │
│ [Step 2] llm    │ Input: {...}    │
│ [Step 3] tool ◄─│ Output: {...}   │
│ [Step 4] llm    │                  │
│ [Step 5] error  │ Timestamp: ...   │
└─────────────────┴──────────────────┘
```

---

## 🎮 Using the Controls

### Playback Buttons

#### ⏮ **Start Button**
- Jumps to the first step (step 0)
- Resets progress to 0%
- Use when: Want to go back to the beginning

#### ◀ **Prev Button**
- Goes to previous step
- Progress decreases
- Disabled when at step 0
- Use when: Manually stepping backward

#### ▶ **Play Button**
- Auto-plays through all steps
- 1 second per step by default
- Progress bar advances automatically
- Use when: Want to watch execution

#### ⏸ **Pause Button**
- Pauses during playback
- Doesn't reset position
- Can resume with Play
- Use when: Need to pause and inspect

#### Next ▶ **Button**
- Goes to next step
- Progress increases
- Disabled when at last step
- Use when: Manually stepping forward

#### End ⏭ **Button**
- Jumps to last step
- Progress jumps to 100%
- Use when: Want to see the end

#### 🎯 **Jump Button**
- Prompts for step number
- Jumps directly to that step
- Updates progress bar
- Use when: Know which step to inspect

#### 🔍 **Search Button**
- Prompts for search text
- Searches inputs/outputs
- Jumps to first match
- Shows count of matches
- Use when: Looking for specific behavior

---

## 🔍 Common Workflows

### Workflow 1: Find an Error

1. Click **Search** 🔍
2. Type: `error`
3. Press Enter
4. Extension jumps to error step
5. Read error details in right panel

**Result**: You're now at the error step with all details visible

---

### Workflow 2: Watch Execution Play Out

1. Click **Start** ⏮
2. Click **Play** ▶
3. Watch progress bar advance
4. See each step highlighted
5. View details in right panel
6. Click **Pause** ⏸ when needed

**Result**: You see execution step-by-step with 1-second delays

---

### Workflow 3: Compare Two States

1. Click **Start** ⏮
2. Note the state shown on right
3. Click **Jump** 🎯
4. Enter: `5`
5. Compare displayed state
6. Look for differences

**Result**: You can see how state evolved from step 0 to step 5

---

### Workflow 4: Debug Step-by-Step

1. Click **Start** ⏮
2. Click **Next** ▶ repeatedly
3. Read input/output at each step
4. When you find issue, click **Pause** ⏸
5. Examine details in right panel

**Result**: You understand exactly what happened at each moment

---

### Workflow 5: Find a Tool Call

1. Click **Search** 🔍
2. Type: `book_restaurant` (or your tool name)
3. Extension finds and jumps to it
4. See tool input/output
5. Check the state

**Result**: You found exactly where the tool was called

---

## 📊 Understanding the Display

### Left Panel: Step List

```
Steps
─────────────────
[0] llm     ← Click to jump here
[1] tool
[2] llm
[3] tool ◄─ Currently selected (highlighted)
[4] llm
[5] error
```

Each row shows:
- Step number in brackets
- Step type (llm, tool, error, etc.)
- Click to jump to that step

### Right Panel: Step Details

```
Step 3 (TOOL)
─────────────────────────

Input:
{
  "toolName": "search_restaurants",
  "parameters": {
    "cuisine": "italian",
    "location": "downtown"
  }
}

Output:
{
  "success": true,
  "result": {
    "count": 3,
    "restaurants": [...]
  }
}

Timestamp: 2026-01-31T12:34:56.789Z
```

Shows all details about the current step.

### Top: Progress Bar

```
[████░░░░░░░░░░░░░░░░░░░░░░░░░░] 45%
─ filled ─────────────────────────── empty
```

- Filled portion = progress through trace
- Percentage = current position
- Updated in real-time during playback

---

## 💡 Pro Tips

### Tip 1: Use Keyboard for Speed
Instead of clicking buttons:
- Open Trace: `Ctrl+Shift+P` → type command
- Jump to step: Click **Jump** 🎯 then type number

### Tip 2: Combine Search + Analysis
1. Search for "error"
2. Note the step number
3. Click **Start** ⏮
4. Click **Jump** 🎯 to one step before
5. Click **Play** ▶ to watch what leads to error

### Tip 3: Watch for State Changes
- Click on different steps
- Look at state in right panel
- Notice what changed between steps
- This shows you the flow

### Tip 4: Pause and Inspect
1. Click **Play** ▶
2. When something interesting happens, click **Pause** ⏸
3. Examine the details carefully
4. Click **Next** ▶ to move one step

---

## ⚠️ Troubleshooting

### Issue: Extension Not Showing

**Solution:**
1. Make sure you ran: `npm run build`
2. Check sidebar for "Agent Control Plane" icon
3. Try: `Ctrl+Shift+P` → `ACP: Open Trace`

### Issue: No Traces Listed

**Solution:**
1. First run: `npm run demo`
2. This creates a trace file
3. Reload VS Code: `Ctrl+Shift+P` → `Developer: Reload Window`

### Issue: Webview Not Showing

**Solution:**
1. Make sure trace file exists
2. Try clicking a different trace file
3. Check the output: `Ctrl+Shift+P` → `ACP: Show Panel`

### Issue: Buttons Disabled

**Solution:**
- Some buttons disable when not applicable
- Prev is disabled at step 0
- Next is disabled at last step
- This is normal behavior

---

## 🎯 Visual Walkthrough

### Opening the Extension

```
1. Command Palette (Ctrl+Shift+P)
   ↓
2. Type: "ACP"
   ↓
3. Select: "ACP: Open Trace"
   ↓
4. Choose: trace_*.json file
   ↓
5. Webview Panel Opens
```

### Using Playback Controls

```
Click Play ▶
   ↓
Auto-plays steps
Progress bar advances
Step details update
   ↓
Click Pause ⏸
   ↓
Can inspect current step
   ↓
Click Next ▶ or Search 🔍
```

### Inspecting a Step

```
Click any step in list
   ↓
Right panel updates
Shows input/output
Shows timestamp
   ↓
Read the details
   ↓
Click different step
```

---

## 🎬 Quick Demo

### Demo: Finding an Issue

1. Open trace with `ACP: Open Trace`
2. Click **Search** 🔍
3. Type: `error`
4. See message: "Found X step(s)"
5. Webview jumps to error
6. Read error details
7. Click **Prev** ◀ to see what led to error
8. Click **Play** ▶ to watch flow

**Time**: 30 seconds to find and inspect an error!

---

## ✅ Verification

When you open a trace, you should see:

- ✅ Webview panel on the right
- ✅ Buttons at top: [⏮][◀][▶][⏸][▶][⏭][🎯][🔍]
- ✅ Progress bar below buttons
- ✅ Step list on left
- ✅ Current step details on right
- ✅ Buttons are clickable

If you see all these, the extension is working! 🎉

---

## 🚀 Summary

**To use the VS Code extension UI:**

1. Generate trace: `npm run demo`
2. Build project: `npm run build`
3. Open folder: `code .`
4. Command palette: `Ctrl+Shift+P`
5. Type: `ACP: Open Trace`
6. Select: trace file
7. Click buttons to explore!

**Total time**: 2-3 minutes to start exploring!

---

*Happy debugging with the VS Code extension! 🎯*

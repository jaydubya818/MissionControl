# ✏️ Task Editing Guide

**Mission Control now has comprehensive inline editing!**

---

## 🎯 Three Ways to Edit Tasks

### **1. Quick Edit from Card** ⚡ (Fastest)

**Double-Click Any Card:**
```
1. Find any task card in the Kanban
2. Double-click the card
3. Quick edit modal appears
4. Edit and save!
```

**Or Click the Edit Button:**
```
1. Find the ✏️ button in the top-right of any card
2. Click it
3. Quick edit modal appears
4. Edit and save!
```

**What You Can Edit:**
- ✅ Title
- ✅ Description
- ✅ Status
- ✅ Priority
- ✅ Type
- ✅ Estimated Cost

---

### **2. Full Edit from Drawer** 🎨 (Most Comprehensive)

**Steps:**
```
1. Click any task to open the drawer
2. Click the "✏️ Edit" button in the header
3. Full edit mode activates
4. Edit everything and save!
```

**What You Can Edit:**
- ✅ Title
- ✅ Description (multi-line)
- ✅ Status
- ✅ Priority
- ✅ Type
- ✅ Estimated Cost
- ✅ **Assigned Agents** (multi-select)
- ✅ View task metadata

---

### **3. Bulk Edit** 🔄 (Coming Soon)

Select multiple tasks and edit them all at once!

---

## 🎨 Features

### **Quick Edit Modal**
- Fast and lightweight
- Beautiful design
- Keyboard shortcuts (ESC to close)
- Auto-focus on title
- Validation (title required)
- Save/Cancel buttons

### **Full Edit Mode**
- Comprehensive editing
- Multi-agent assignment with visual chips
- Click agents to assign/unassign
- Task metadata display
- Larger text areas
- Better for complex edits

### **Smart Validation**
- ✅ Title is required
- ✅ Costs must be positive
- ✅ Status/Priority/Type dropdowns
- ✅ Can't save invalid data
- ✅ Clear error messages

---

## 📝 Editing Workflow Examples

### **Example 1: Quick Status Change**
```
1. Double-click task card
2. Change status from "INBOX" to "IN_PROGRESS"
3. Click "💾 Save Changes"
4. Done! (2 seconds)
```

### **Example 2: Reassign Task**
```
1. Click task to open drawer
2. Click "✏️ Edit" button
3. Scroll to "Assigned Agents"
4. Click agents to select/deselect
5. Click "💾 Save"
6. Done!
```

### **Example 3: Update Description**
```
1. Double-click task card
2. Edit description field
3. Update priority if needed
4. Click "💾 Save Changes"
5. Done!
```

---

## ⌨️ Keyboard Shortcuts

**In Quick Edit Modal:**
- `ESC` - Close without saving
- `Enter` - Save (when in title field)
- `Tab` - Navigate between fields

**In Full Edit Mode:**
- Click "Cancel" to exit
- Click "💾 Save" to save changes

---

## 🎯 Best Practices

### **Use Quick Edit When:**
- ✅ Changing status
- ✅ Updating priority
- ✅ Quick description edits
- ✅ Adjusting costs
- ✅ You need speed

### **Use Full Edit When:**
- ✅ Reassigning agents
- ✅ Major description changes
- ✅ Multiple field updates
- ✅ You need to see metadata
- ✅ Complex edits

---

## 🚀 Pro Tips

1. **Double-Click is Fastest**
   - No need to click edit button
   - Instant access to editing

2. **Agent Assignment**
   - Use full edit mode
   - Click multiple agents
   - Visual feedback with chips

3. **Validation**
   - Title is always required
   - Save button disabled if invalid
   - Clear error messages

4. **Canceling**
   - Click Cancel button
   - Press ESC
   - Click outside modal (Quick Edit)

5. **Auto-Save**
   - Changes save immediately
   - No "draft" mode
   - Undo not available (yet)

---

## 🎨 UI Elements

### **Quick Edit Modal**
```
┌─────────────────────────────────┐
│ ✏️ Quick Edit Task          × │
├─────────────────────────────────┤
│ Title *                         │
│ [Task title input]              │
│                                 │
│ Description                     │
│ [Multi-line textarea]           │
│                                 │
│ [Status ▼] [Priority ▼] [Type ▼]│
│                                 │
│ Estimated Cost ($)              │
│ [0.00]                          │
│                                 │
│ [💾 Save Changes] [Cancel]     │
└─────────────────────────────────┘
```

### **Full Edit Mode**
```
┌─────────────────────────────────┐
│ ✏️ Edit Task    [💾 Save] [Cancel]│
├─────────────────────────────────┤
│ Title *                         │
│ [Task title input]              │
│                                 │
│ Description                     │
│ [Large multi-line textarea]     │
│                                 │
│ [Status ▼] [Priority ▼] [Type ▼]│
│                                 │
│ Assigned Agents                 │
│ [🤖 Agent1] [🤖 Agent2] ...    │
│                                 │
│ Estimated Cost ($)              │
│ [0.00]                          │
│                                 │
│ Task ID: xxx                    │
│ Created: xxx                    │
│ Actual Cost: $x.xx              │
└─────────────────────────────────┘
```

---

## 🐛 Troubleshooting

### **Can't Save Changes**
- ✅ Check title is not empty
- ✅ Check cost is not negative
- ✅ Look for error messages

### **Modal Won't Open**
- ✅ Try clicking the ✏️ button instead
- ✅ Refresh the page
- ✅ Check browser console

### **Changes Not Saving**
- ✅ Check network connection
- ✅ Look for error toast
- ✅ Try again

### **Agent Assignment Not Working**
- ✅ Use Full Edit mode (not Quick Edit)
- ✅ Click agent chips to toggle
- ✅ Blue = selected, Gray = not selected

---

## 📊 What's Editable

| Field | Quick Edit | Full Edit |
|-------|-----------|-----------|
| Title | ✅ | ✅ |
| Description | ✅ | ✅ (larger) |
| Status | ✅ | ✅ |
| Priority | ✅ | ✅ |
| Type | ✅ | ✅ |
| Estimated Cost | ✅ | ✅ |
| Assigned Agents | ❌ | ✅ |
| Dependencies | ❌ | ❌ (coming) |
| Labels | ❌ | ❌ (coming) |
| Due Date | ❌ | ❌ (coming) |

---

## 🎯 Future Enhancements

Coming soon:
- [ ] Bulk edit (select multiple tasks)
- [ ] Undo/Redo
- [ ] Edit history
- [ ] Dependencies editing
- [ ] Labels editing
- [ ] Due dates
- [ ] Attachments
- [ ] Rich text editor
- [ ] Auto-save drafts
- [ ] Keyboard shortcuts for save

---

## 🎉 Summary

**You can now edit tasks in 3 ways:**

1. **Double-click card** → Quick edit
2. **Click ✏️ on card** → Quick edit
3. **Click Edit in drawer** → Full edit

**Every task is now editable!** ✏️

---

**Quick Start:**
```bash
# Open the UI
open http://localhost:5173/

# Try it:
1. Double-click any task card
2. Edit the title
3. Click "💾 Save Changes"
4. Done!
```

**That's it! Start editing!** 🚀

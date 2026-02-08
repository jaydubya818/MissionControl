# Chat View - Enhanced Features

## Overview
The Chat view provides a threaded conversation interface for each task, enabling humans and agents to collaborate, discuss, and document work.

## Core Functionality ✅

### Message Sending
- **Type and send messages** to any task
- **Press Enter** to send (Shift+Enter for new line)
- **Auto-clear** input after sending
- **Auto-scroll** to newest messages
- **Loading states** with visual feedback

### Message Display
- **Human messages** (👤) - Blue accent
- **Agent messages** (🤖) - Purple left border
- **System messages** (⚙️) - Green left border
- **Timestamps** on all messages
- **Message types** displayed (COMMENT, WORK_PLAN, PROGRESS, REVIEW, etc.)

## New Enhanced Features 🎉

### 1. Task Search
- **Search bar** at top of sidebar
- **Real-time filtering** as you type
- Search by task **title** or **description**
- **Clear button** (✕) to reset search
- **No results state** when search finds nothing

### 2. Message Count Badges
- **Blue badge** shows message count on each thread item
- Only appears if thread has messages
- Helps identify active conversations
- Updates in real-time via Convex

### 3. @Mentions Autocomplete
- Type **@** to trigger mention dropdown
- Shows up to **5 matching agents**
- Displays agent **emoji, name, and role**
- **Click to select** or continue typing to filter
- Mentions are **highlighted in blue** in message content
- Mentioned agents receive **notifications** (via Convex)

### 4. Reply to Messages
- **Hover over message** to show reply button (↩️)
- Click to **reply to specific message**
- **Reply banner** shows above input with context
- Cancel reply with **✕** button
- Reply relationship tracked in database

### 5. Artifact Display
- Messages with **file attachments** show artifact list
- Displays **file name** and **type**
- 📎 icon for visual clarity
- Supports multiple artifacts per message

### 6. Enhanced Message Header
- Shows **author type** (HUMAN/AGENT/SYSTEM)
- Shows **author ID** for humans (e.g., "operator")
- **Timestamp** in readable format
- **Hover actions** (reply button)

### 7. Better Input Experience
- **Textarea** instead of input (supports multi-line)
- **Auto-resize** (min 42px, max 120px)
- **Keyboard shortcuts**:
  - Enter: Send message
  - Shift+Enter: New line
  - @ : Trigger mentions
- **Disabled state** while sending
- **Visual feedback** (⏳ while sending, 📤 when ready)

### 8. Empty States
- **No tasks**: "Create a task to start chatting"
- **No messages**: "Start the conversation!"
- **No search results**: "Try a different search"
- All with appropriate icons and guidance

## Technical Implementation

### Data Flow
```
User types message
  ↓
Extract @mentions from text
  ↓
Call api.messages.post mutation
  ↓
Convex inserts message + logs activity
  ↓
Creates notifications for @mentioned agents
  ↓
Real-time update via useQuery
  ↓
UI auto-scrolls to new message
```

### Message Schema
```typescript
{
  taskId: Id<"tasks">,
  authorType: "HUMAN" | "AGENT" | "SYSTEM",
  authorUserId?: string,
  authorAgentId?: Id<"agents">,
  type: "COMMENT" | "WORK_PLAN" | "PROGRESS" | "REVIEW",
  content: string,
  mentions?: string[],
  replyToId?: Id<"messages">,
  artifacts?: Array<{
    name: string,
    type: string,
    url?: string,
    content?: string
  }>
}
```

### Convex Queries Used
- `api.tasks.list` - Get all tasks for sidebar
- `api.tasks.get` - Get selected task details
- `api.messages.listByTask` - Get messages for thread
- `api.agents.list` - Get agents for @mentions
- `api.messages.post` - Send new message

## User Experience Highlights

### Visual Design
- **Dark theme** consistent with Mission Control design system
- **Color-coded messages** by author type
- **Smooth transitions** and hover effects
- **Clear visual hierarchy** (sidebar → thread → messages → input)

### Interaction Patterns
- **Click task** in sidebar to view conversation
- **Auto-select first task** on load
- **Search tasks** without leaving view
- **@mention agents** with autocomplete
- **Reply to messages** with context
- **Send with Enter** for speed

### Accessibility
- Proper **ARIA labels** on interactive elements
- **Keyboard navigation** support
- **Focus states** on buttons
- **Screen reader friendly** structure

## Future Enhancements (Not Yet Implemented)

### Planned Features
- [ ] **Message editing** (edit your own messages)
- [ ] **Message deletion** (soft delete with "deleted" flag)
- [ ] **Message reactions** (👍 ❤️ 🎉 etc.)
- [ ] **Rich text formatting** (bold, italic, code blocks)
- [ ] **File upload** (attach images, documents)
- [ ] **Markdown rendering** (render markdown in messages)
- [ ] **Code syntax highlighting** (for code snippets)
- [ ] **Link previews** (unfurl URLs)
- [ ] **Thread pinning** (pin important threads to top)
- [ ] **Unread indicators** (track which threads have unread messages)
- [ ] **Notification sounds** (audio alert on new messages)
- [ ] **Typing indicators** (show when agent is typing)
- [ ] **Message threading** (nested replies)
- [ ] **Search within thread** (search messages in current thread)
- [ ] **Export conversation** (download as markdown/txt)

### Integration Opportunities
- **Telegram sync** - Show Telegram messages in thread
- **GitHub integration** - Show commit messages, PR comments
- **Agent work logs** - Auto-post progress updates
- **Approval flow** - Request approvals via chat
- **Task transitions** - Show state changes in thread

## Testing Checklist

- [x] Messages send successfully
- [x] Messages appear in real-time
- [x] Auto-scroll works
- [x] Task selection works
- [x] Search filters tasks
- [x] Message count badges display
- [x] @mentions autocomplete appears
- [x] Reply banner shows/hides
- [x] Input clears after send
- [x] Disabled state while sending
- [x] Empty states display correctly
- [x] Keyboard shortcuts work
- [x] Hover actions appear

## Known Limitations

1. **No message editing** - Once sent, messages cannot be edited
2. **No message deletion** - Messages are permanent
3. **No rich text** - Plain text only (no markdown rendering)
4. **No file uploads** - Artifacts must be added programmatically
5. **No read receipts** - Can't see if agents have read messages
6. **No typing indicators** - Can't see when agents are composing
7. **No message search** - Can only search task titles
8. **No pagination** - Loads all messages (limited to 100 per query)

## Performance Considerations

- **Real-time updates** via Convex reactive queries (efficient)
- **Message limit** of 100 per thread (prevents large data loads)
- **Lazy loading** of message counts (one query per thread item)
- **Debounced search** could be added for large task lists
- **Virtual scrolling** could be added for very long conversations

## Usage Examples

### Send a simple message
1. Select a task from sidebar
2. Type "Working on this now"
3. Press Enter
4. Message appears immediately

### Mention an agent
1. Type "Hey @" 
2. Autocomplete dropdown appears
3. Click agent or continue typing name
4. Complete message: "Hey @Henry can you review this?"
5. Send - Henry receives notification

### Reply to a message
1. Hover over any message
2. Click reply button (↩️)
3. Reply banner shows context
4. Type your reply
5. Send - reply is linked to original message

### Search for a task
1. Click search box at top of sidebar
2. Type task name or keyword
3. Thread list filters in real-time
4. Click ✕ to clear search

## Integration with Mission Control

The Chat view integrates with:
- **Tasks system** - One thread per task
- **Agents system** - Agents can post messages
- **Activities log** - All messages logged
- **Notifications** - @mentions create notifications
- **Reviews** - Review messages can trigger state changes
- **Approvals** - Review approvals create approval records

## Code Location

- **Component**: `apps/mission-control-ui/src/ChatView.tsx`
- **Backend**: `convex/messages.ts`
- **Schema**: `convex/schema.ts` (messages table)
- **Types**: `packages/shared/src/types/message.ts`

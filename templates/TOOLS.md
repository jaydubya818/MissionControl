# TOOLS.md - Local Notes

Skills define *how* tools work. This file is for *your* specifics -- the stuff that's unique to your setup.

## What Goes Here

Things like:
- Convex function references you use frequently
- Project-specific environment variables
- Preferred TTS voices for voice synthesis
- SSH hosts and aliases
- API endpoint notes
- Anything environment-specific

## Examples

### Convex Functions
- Tasks: `api.tasks.create`, `api.tasks.transition`, `api.tasks.list`
- Agents: `api.agents.register`, `api.agents.heartbeat`
- Approvals: `api.approvals.request`, `api.approvals.approve`

### Environment
- Convex deployment: (your deployment URL)
- Project slug: (your default project)

### TTS Voice Preferences
- Preferred voice: (voice name from ElevenLabs)
- Default model: `eleven_multilingual_v2`
- Speaking style: (warm, authoritative, casual, etc.)

### SSH
- (your SSH hosts and aliases)

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

Add whatever helps you do your job. This is your cheat sheet.

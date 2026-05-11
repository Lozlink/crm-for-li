// Placeholder screen — never mounts in practice. The tab's href in
// (tabs)/_layout.tsx routes taps directly to the top-level /dialer route
// when this tab is pinned via the customize-tabs sheet. This file exists
// only because expo-router file-based routing requires a corresponding
// file for any Tabs.Screen `name`. Returning null matches the pattern
// used by whiteboard-tab.tsx (avoids the "close-twice" Redirect race).
export default function DialerTabPlaceholder() {
  return null;
}

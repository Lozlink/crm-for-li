// Placeholder screen — never mounts in practice. The tab's href in
// (tabs)/_layout.tsx routes taps directly to the top-level /whiteboard stack
// route. This file exists only because expo-router file-based routing requires
// a corresponding file for any Tabs.Screen `name`. Returning null avoids the
// "close-twice" bug caused by an earlier <Redirect> here racing the parent
// Tabs.Screen's href option.
export default function WhiteboardTabPlaceholder() {
  return null;
}

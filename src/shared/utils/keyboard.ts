export function isSaveShortcut(event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
}) {
  return (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s";
}

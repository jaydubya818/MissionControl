/** User message bubble in chat dock (waku .bubble). */
export function ChatBubble({ text }: { text: string }): JSX.Element {
  return <div className="schematic-bubble">{text}</div>;
}

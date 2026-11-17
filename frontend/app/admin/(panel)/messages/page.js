import MessagesInbox from "./MessagesInbox";

export const instant = false;
export const metadata = { title: "Messages" };

export default function MessagesPage() {
  return <MessagesInbox />;
}

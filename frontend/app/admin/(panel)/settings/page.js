import SettingsManager from "./SettingsManager";

export const instant = false;
export const metadata = { title: "Settings" };

export default function SettingsPage() {
  return <SettingsManager />;
}

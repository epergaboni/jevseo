import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Settings",
  description: "Configure the TypeSafe and DataForSEO credentials used by this instance.",
};

export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  return children;
}

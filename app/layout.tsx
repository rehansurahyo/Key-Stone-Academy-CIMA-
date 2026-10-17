import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "CIMA Case Study Mock Exam | Keystone Academia",
  description: "Interactive CGMA Strategic Level Case Study mock examination simulator by Keystone Academia.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full w-full overflow-hidden">
      <body className="antialiased h-screen w-screen overflow-hidden m-0 p-0">{children}<Toaster richColors closeButton position="top-right" /></body>
    </html>
  );
}

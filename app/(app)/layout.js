"use client";

import AppShell from "@/components/shell/AppShell";
import ShellErrorBoundary from "@/components/shell/ShellErrorBoundary";

export default function AppGroupLayout({ children }) {
  return (
    <AppShell>
      <ShellErrorBoundary>{children}</ShellErrorBoundary>
    </AppShell>
  );
}

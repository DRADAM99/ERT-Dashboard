"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// The admin logs are now shown as an overlay panel on the main dashboard.
// Redirect anyone who navigates here directly.
export default function AdminLogsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/"); }, [router]);
  return null;
}

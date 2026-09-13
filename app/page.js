"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/context/AuthContext";

export default function HomeGate() {
  const { currentUser } = useAuth();
  const router = useRouter();

  useEffect(() => {
    router.replace(currentUser ? "/status" : "/login");
  }, [currentUser, router]);

  return (
    <div className="flex min-h-screen items-center justify-center" dir="rtl">
      טוען...
    </div>
  );
}

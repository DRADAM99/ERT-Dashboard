"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/firebase";
import { useAuth } from "@/app/context/AuthContext";
import { useData } from "@/app/context/DataContext";
import ResidentsWorkspace from "@/components/v2/ResidentsWorkspace";

export default function ResidentsPage() {
  return (
    <Suspense fallback={<div className="v2-sub py-10 text-center">טוען...</div>}>
      <ResidentsPageInner />
    </Suspense>
  );
}

function ResidentsPageInner() {
  const searchParams = useSearchParams();
  const { currentUser } = useAuth();
  const { currentUserData } = useData();
  const [view, setView] = useState(null);

  useEffect(() => {
    const fromUrl = searchParams.get("view");
    const saved = currentUserData?.residentsView;
    const next = fromUrl || saved || (typeof window !== "undefined" && window.innerWidth >= 1024 ? "split" : "table");
    if (next === "board" || next === "split" || next === "table") {
      setView((current) => (current === next ? current : next));
    }
  }, [searchParams, currentUserData?.residentsView]);

  const persistView = async (next) => {
    setView(next);
    if (currentUser) {
      try {
        await setDoc(doc(db, "users", currentUser.uid), { residentsView: next }, { merge: true });
      } catch {
        /* ignore */
      }
    }
  };

  return (
    <ResidentsWorkspace
      view={view || "table"}
      onViewChange={persistView}
      openResidentId={searchParams.get("open")}
      urlQuery={searchParams.get("q") || ""}
    />
  );
}

"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/firebase";
import { useAuth } from "@/app/context/AuthContext";
import { DEFAULT_TASK_CATEGORIES } from "@/lib/residents";
import { EMERGENCY_MODES, EMERGENCY_SETTINGS_DOC, EMERGENCY_SOURCES_DOC, normalizeEmergencyMode } from "@/lib/emergencyActions";
import { toDate } from "@/components/v2/format";

const EMPTY_DATA = {
  tasks: [],
  residents: [],
  eventLogs: [],
  users: [],
  currentUserData: null,
  taskCategories: DEFAULT_TASK_CATEGORIES,
  emergencyMode: EMERGENCY_MODES.DRILL,
  emergencySources: {},
  isEmergencyConfigLoaded: false,
  loading: true,
};

const DataContext = createContext(EMPTY_DATA);

function mapTask(docSnap) {
  const data = docSnap.data();
  const replies = Array.isArray(data.replies)
    ? data.replies
        .map((reply) => ({
          ...reply,
          timestamp: toDate(reply.timestamp) || new Date(),
        }))
        .sort((a, b) => b.timestamp - a.timestamp)
    : [];
  return {
    id: docSnap.id,
    ...data,
    dueDate: toDate(data.dueDate),
    createdAt: toDate(data.createdAt) || data.createdAt,
    completedAt: toDate(data.completedAt),
    replies,
  };
}

export function DataProvider({ children }) {
  const { currentUser } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [residents, setResidents] = useState([]);
  const [eventLogs, setEventLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [currentUserData, setCurrentUserData] = useState(null);
  const [taskCategories, setTaskCategories] = useState(DEFAULT_TASK_CATEGORIES);
  const [emergencyMode, setEmergencyMode] = useState(EMERGENCY_MODES.DRILL);
  const [emergencySources, setEmergencySources] = useState({});
  const [isEmergencyConfigLoaded, setIsEmergencyConfigLoaded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) {
      setCurrentUserData(null);
      setLoading(false);
      return undefined;
    }
    const unsubscribe = onSnapshot(doc(db, "users", currentUser.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setCurrentUserData({
          uid: currentUser.uid,
          email: currentUser.email,
          alias: data.alias || currentUser.email || "",
          role: data.role || "staff",
          department: data.department || "",
          navOrder: Array.isArray(data.navOrder) ? data.navOrder : null,
          residentsView: data.residentsView || "",
        });
      } else {
        setCurrentUserData({
          uid: currentUser.uid,
          email: currentUser.email,
          alias: currentUser.email || "",
          role: "staff",
          department: "",
        });
      }
      setLoading(false);
    }, () => setLoading(false));
    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return undefined;
    const userRef = doc(db, "users", currentUser.uid);
    const ping = () => updateDoc(userRef, { lastSeen: serverTimestamp() }).catch(() => {});
    ping();
    const interval = setInterval(ping, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      setUsers([]);
      return undefined;
    }
    const unsubscribe = onSnapshot(collection(db, "users"), (snap) => {
      setUsers(
        snap.docs.map((entry) => ({
          id: entry.id,
          ...entry.data(),
          email: entry.data().email || "",
          alias: entry.data().alias || entry.data().email || "",
          role: entry.data().role || "staff",
          department: entry.data().department || "",
        }))
      );
    });
    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      setTasks([]);
      return undefined;
    }
    const unsubscribe = onSnapshot(collection(db, "tasks"), (snap) => {
      setTasks(snap.docs.map(mapTask));
    });
    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      setResidents([]);
      return undefined;
    }
    const unsubscribe = onSnapshot(collection(db, "residents"), (snap) => {
      setResidents(snap.docs.map((entry) => ({ id: entry.id, ...entry.data() })));
    });
    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      setEventLogs([]);
      return undefined;
    }
    const unsubscribe = onSnapshot(collection(db, "eventLogs"), (snap) => {
      const rows = snap.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
      rows.sort((a, b) => (toDate(a.createdAt)?.getTime() || 0) - (toDate(b.createdAt)?.getTime() || 0));
      setEventLogs(rows);
    });
    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return undefined;
    const unsubscribe = onSnapshot(doc(db, "systemSettings", "taskCategories"), (snap) => {
      const list = snap.exists() ? snap.data().categories : null;
      if (Array.isArray(list) && list.length) setTaskCategories(list);
      else setTaskCategories(DEFAULT_TASK_CATEGORIES);
    });
    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      setIsEmergencyConfigLoaded(false);
      setEmergencyMode(EMERGENCY_MODES.DRILL);
      return undefined;
    }
    const unsubscribe = onSnapshot(doc(db, EMERGENCY_SETTINGS_DOC.collection, EMERGENCY_SETTINGS_DOC.id), (snap) => {
      setEmergencyMode(normalizeEmergencyMode(snap.exists() ? snap.data()?.mode : EMERGENCY_MODES.DRILL));
      setIsEmergencyConfigLoaded(true);
    }, () => {
      setEmergencyMode(EMERGENCY_MODES.DRILL);
      setIsEmergencyConfigLoaded(true);
    });
    return () => unsubscribe();
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      setEmergencySources({});
      return undefined;
    }
    const unsubscribe = onSnapshot(doc(db, EMERGENCY_SOURCES_DOC.collection, EMERGENCY_SOURCES_DOC.id), (snap) => {
      setEmergencySources(snap.exists() ? snap.data() : {});
    }, () => setEmergencySources({}));
    return () => unsubscribe();
  }, [currentUser]);

  const value = useMemo(
    () => ({
      tasks,
      residents,
      eventLogs,
      users,
      currentUserData,
      taskCategories,
      setTaskCategories,
      emergencyMode,
      emergencySources,
      isEmergencyConfigLoaded,
      loading,
    }),
    [
      tasks,
      residents,
      eventLogs,
      users,
      currentUserData,
      taskCategories,
      emergencyMode,
      emergencySources,
      isEmergencyConfigLoaded,
      loading,
    ]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  return useContext(DataContext);
}

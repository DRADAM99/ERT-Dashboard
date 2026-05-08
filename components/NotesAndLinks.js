import { useEffect, useRef, useState } from "react";
import { db, auth } from "../firebase";
import {
  collection,
  addDoc,
  deleteDoc,
  getDocs,
  doc,
  serverTimestamp,
  query,
  where,
  orderBy,
  onSnapshot,
} from "firebase/firestore";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

const DEPARTMENTS = ["לוגיסטיקה", "אוכלוסיה", "רפואה", "חוסן", 'חמ"ל', "אחר"];

function getTargetLabel(target, allUsers) {
  if (target === "all") return "לכולם";
  if (target.startsWith("dept:")) return `מחלקה: ${target.slice(5)}`;
  const user = allUsers.find((u) => u.email === target);
  return user?.alias || target;
}

function getNoteToLabel(to, allUsers) {
  if (!to || to === "all") return null;
  if (to.startsWith("dept:")) return `מחלקת ${to.slice(5)}`;
  return allUsers.find((u) => u.email === to)?.alias || to;
}

export default function NotesAndLinks({ section }) {
  const [notes, setNotes] = useState([]);
  const [links, setLinks] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [targetUser, setTargetUser] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [newLink, setNewLink] = useState({ title: "", url: "" });
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [userDepartment, setUserDepartment] = useState(null);
  const dropdownRef = useRef(null);

  const [userEmail, setUserEmail] = useState(auth.currentUser?.email);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setUserEmail(user?.email);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Close the custom dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchUsersAndDept = async () => {
    if (!isAuthReady || !userEmail) return null;
    try {
      const snap = await getDocs(collection(db, "users"));
      const users = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setAllUsers(users);
      const me = users.find((u) => u.email === userEmail);
      const dept = me?.department?.trim() || null;
      if (dept) setUserDepartment(dept);
      return dept;
    } catch (error) {
      console.error("Error fetching users:", error);
      return null;
    }
  };

  const fetchNotes = async (dept) => {
    if (!isAuthReady || !userEmail) return;
    try {
      const toValues = ["all", userEmail];
      if (dept) toValues.push(`dept:${dept}`);

      const q = query(
        collection(db, "notes"),
        where("to", "in", toValues),
        orderBy("createdAt", "desc")
      );
      const snapshot = await getDocs(q);

      const authoredQ = query(
        collection(db, "notes"),
        where("author", "==", userEmail),
        orderBy("createdAt", "desc")
      );
      const authoredSnapshot = await getDocs(authoredQ);

      const allNotes = [...snapshot.docs, ...authoredSnapshot.docs]
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter(
          (note, index, self) =>
            index === self.findIndex((n) => n.id === note.id)
        );

      setNotes(allNotes);
    } catch (error) {
      console.error("Error fetching notes:", error);
    }
  };

  const fetchLinks = async () => {
    if (!userEmail) return;
    try {
      const q = query(
        collection(db, "links"),
        where("addedBy", "==", userEmail),
        orderBy("createdAt", "desc")
      );
      const snapshot = await getDocs(q);
      setLinks(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error("Error fetching links:", error);
    }
  };

  useEffect(() => {
    if (!isAuthReady || !userEmail) return;

    let cleanedUp = false;
    let unsubscribeNotes = null;
    let unsubscribeLinks = null;

    const initialize = async () => {
      const dept = await fetchUsersAndDept();
      if (cleanedUp) return;

      if (section === "notes") {
        const toValues = ["all", userEmail];
        if (dept) toValues.push(`dept:${dept}`);

        const notesQuery = query(
          collection(db, "notes"),
          where("to", "in", toValues),
          orderBy("createdAt", "desc")
        );

        unsubscribeNotes = onSnapshot(notesQuery, () => {
          if (!cleanedUp) fetchNotes(dept);
        });
        if (cleanedUp) { unsubscribeNotes(); return; }

        fetchNotes(dept);
      }

      if (section === "links") {
        const linksQuery = query(
          collection(db, "links"),
          where("addedBy", "==", userEmail),
          orderBy("createdAt", "desc")
        );

        unsubscribeLinks = onSnapshot(linksQuery, () => {
          if (!cleanedUp) fetchLinks();
        });
        if (cleanedUp) { unsubscribeLinks(); return; }

        fetchLinks();
      }
    };

    initialize();

    return () => {
      cleanedUp = true;
      if (unsubscribeNotes) unsubscribeNotes();
      if (unsubscribeLinks) unsubscribeLinks();
    };
  }, [section, userEmail, isAuthReady]);

  const addNote = async () => {
    if (!newNote.trim() || !userEmail) return;
    try {
      await addDoc(collection(db, "notes"), {
        to: targetUser,
        text: newNote,
        createdAt: serverTimestamp(),
        author: userEmail,
      });
      setNewNote("");
      setTargetUser("all");
      setModalOpen(false);
    } catch (error) {
      console.error("Error adding note:", error);
      alert("שגיאה בהוספת פתק");
    }
  };

  const addLink = async () => {
    if (!newLink.title.trim() || !newLink.url.trim() || !userEmail) return;
    try {
      const userLinks = await getDocs(
        query(collection(db, "links"), where("addedBy", "==", userEmail))
      );
      if (userLinks.size >= 5) {
        alert("אפשר לשמור עד 5 קישורים בלבד.");
        return;
      }
      await addDoc(collection(db, "links"), {
        ...newLink,
        addedBy: userEmail,
        createdAt: serverTimestamp(),
      });
      setNewLink({ title: "", url: "" });
      setModalOpen(false);
    } catch (error) {
      console.error("Error adding link:", error);
      alert("שגיאה בהוספת קישור");
    }
  };

  const deleteNote = async (id) => {
    if (!isAuthReady) { alert("אנא המתן רגע ונסה שוב"); return; }
    if (!userEmail) { alert("שגיאה: משתמש לא מזוהה"); return; }
    try {
      await deleteDoc(doc(db, "notes", id));
      setNotes((prev) => prev.filter((note) => note.id !== id));
    } catch (error) {
      console.error("Error deleting note:", error);
      alert("שגיאה במחיקת פתק");
    }
  };

  const deleteLink = async (id) => {
    try {
      await deleteDoc(doc(db, "links", id));
    } catch (error) {
      console.error("Error deleting link:", error);
      alert("שגיאה במחיקת קישור");
    }
  };

  // Group users by department for the grouped dropdown
  const usersByDept = Object.fromEntries(DEPARTMENTS.map((d) => [d, []]));
  const usersExtraDepts = {}; // non-canonical departments
  const usersNoDept = [];

  allUsers.forEach((u) => {
    const dept = u.department?.trim();
    if (!dept) {
      usersNoDept.push(u);
    } else if (usersByDept[dept] !== undefined) {
      usersByDept[dept].push(u);
    } else {
      if (!usersExtraDepts[dept]) usersExtraDepts[dept] = [];
      usersExtraDepts[dept].push(u);
    }
  });

  if (section === "notes") {
    return (
      <div className="flex items-center gap-2">
        {notes.map((note) => {
          const toLabel = getNoteToLabel(note.to, allUsers);
          return (
            <div
              key={note.id}
              className="bg-yellow-200 border-yellow-400 border rounded shadow p-2 max-w-xs text-xs relative font-sans"
            >
              <div>{note.text}</div>
              <div className="text-gray-600 mt-1 text-[10px] flex justify-between">
                <span>
                  {allUsers.find((u) => u.email === note.author)?.alias ||
                    note.author}
                </span>
                {toLabel && (
                  <span className="text-blue-600">ל: {toLabel}</span>
                )}
              </div>
              <button
                onClick={() => deleteNote(note.id)}
                className="absolute top-0 right-1 text-red-400 text-xs"
                title="מחק פתק"
              >
                ×
              </button>
            </div>
          );
        })}

        <button
          onClick={() => setModalOpen(true)}
          className="text-yellow-600 text-2xl"
          title="הוסף פתק"
        >
          📝+
        </button>

        {modalOpen && (
          <>
            <div
              className="fixed inset-0 bg-black/20 z-[90]"
              onClick={() => setModalOpen(false)}
            />
            <div
              className="fixed top-0 left-0 h-full w-72 bg-white shadow-2xl p-6 border-r z-[100] flex flex-col animate-in slide-in-from-left duration-300"
              style={{ direction: "rtl" }}
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-lg text-yellow-700 text-right">
                  הוספת פתק חדש
                </h3>
                <button
                  onClick={() => setModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 text-right">
                    עבור:
                  </label>

                  {/* Custom grouped dropdown */}
                  <div ref={dropdownRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setDropdownOpen((v) => !v)}
                      className="w-full text-sm border p-2 rounded bg-gray-50 flex justify-between items-center gap-2"
                    >
                      <span className="flex-1 text-right">
                        {getTargetLabel(targetUser, allUsers)}
                      </span>
                      <span className="text-gray-400 text-xs flex-shrink-0">
                        ▼
                      </span>
                    </button>

                    {dropdownOpen && (
                      <div className="absolute top-full right-0 left-0 mt-1 bg-white border rounded shadow-lg z-[200] max-h-64 overflow-y-auto text-sm">
                        {/* Everyone */}
                        <div
                          onClick={() => {
                            setTargetUser("all");
                            setDropdownOpen(false);
                          }}
                          className={`px-3 py-2 cursor-pointer hover:bg-yellow-50 text-right ${
                            targetUser === "all" ? "bg-yellow-100" : ""
                          }`}
                        >
                          לכולם
                        </div>

                        <div className="border-t" />

                        {/* Canonical departments with their users */}
                        {DEPARTMENTS.map((dept) => {
                          const deptUsers = usersByDept[dept] || [];
                          return (
                            <div key={dept}>
                              <div
                                onClick={() => {
                                  setTargetUser(`dept:${dept}`);
                                  setDropdownOpen(false);
                                }}
                                className={`px-3 py-2 cursor-pointer hover:bg-yellow-50 font-bold text-right ${
                                  targetUser === `dept:${dept}`
                                    ? "bg-yellow-100"
                                    : ""
                                }`}
                              >
                                {dept}
                              </div>
                              {deptUsers.map((u) => (
                                <div
                                  key={u.id}
                                  onClick={() => {
                                    setTargetUser(u.email);
                                    setDropdownOpen(false);
                                  }}
                                  className={`pr-7 pl-3 py-1.5 cursor-pointer hover:bg-yellow-50 text-right text-gray-700 ${
                                    targetUser === u.email ? "bg-yellow-100" : ""
                                  }`}
                                >
                                  {u.alias || u.email}
                                </div>
                              ))}
                            </div>
                          );
                        })}

                        {/* Non-canonical departments */}
                        {Object.entries(usersExtraDepts).map(
                          ([dept, deptUsers]) => (
                            <div key={dept}>
                              <div
                                onClick={() => {
                                  setTargetUser(`dept:${dept}`);
                                  setDropdownOpen(false);
                                }}
                                className={`px-3 py-2 cursor-pointer hover:bg-yellow-50 font-bold text-right ${
                                  targetUser === `dept:${dept}`
                                    ? "bg-yellow-100"
                                    : ""
                                }`}
                              >
                                {dept}
                              </div>
                              {deptUsers.map((u) => (
                                <div
                                  key={u.id}
                                  onClick={() => {
                                    setTargetUser(u.email);
                                    setDropdownOpen(false);
                                  }}
                                  className={`pr-7 pl-3 py-1.5 cursor-pointer hover:bg-yellow-50 text-right text-gray-700 ${
                                    targetUser === u.email ? "bg-yellow-100" : ""
                                  }`}
                                >
                                  {u.alias || u.email}
                                </div>
                              ))}
                            </div>
                          )
                        )}

                        {/* Users with no department */}
                        {usersNoDept.length > 0 && (
                          <>
                            <div className="border-t" />
                            {usersNoDept.map((u) => (
                              <div
                                key={u.id}
                                onClick={() => {
                                  setTargetUser(u.email);
                                  setDropdownOpen(false);
                                }}
                                className={`px-3 py-1.5 cursor-pointer hover:bg-yellow-50 text-right text-gray-700 ${
                                  targetUser === u.email ? "bg-yellow-100" : ""
                                }`}
                              >
                                {u.alias || u.email}
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 text-right">
                    תוכן:
                  </label>
                  <textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="מה ברצונך להוסיף?"
                    className="w-full p-2 text-sm border rounded bg-gray-50 min-h-[120px] text-right"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <Button
                    onClick={addNote}
                    className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white font-bold"
                  >
                    הוסף פתק
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setModalOpen(false)}
                    className="flex-1"
                  >
                    ביטול
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  if (section === "links") {
    return (
      <div className="flex items-center gap-2">
        {links.map((link) => (
          <div key={link.id} className="flex items-center gap-1">
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 text-xl"
              title={link.title}
            >
              📄
            </a>
            <button
              onClick={() => deleteLink(link.id)}
              className="text-red-400 text-xs"
            >
              x
            </button>
          </div>
        ))}
        <button
          onClick={() => setModalOpen(true)}
          className="text-green-600 text-2xl"
          title="הוסף קישור"
        >
          📎+
        </button>

        {modalOpen && (
          <>
            <div
              className="fixed inset-0 bg-black/20 z-[90]"
              onClick={() => setModalOpen(false)}
            />
            <div
              className="fixed top-0 right-0 h-full w-72 bg-white shadow-2xl p-6 border-l z-[100] flex flex-col animate-in slide-in-from-right duration-300"
              style={{ direction: "rtl" }}
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-lg text-green-700 text-right">
                  הוספת קישור חדש
                </h3>
                <button
                  onClick={() => setModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 text-right">
                    שם הקישור:
                  </label>
                  <input
                    type="text"
                    value={newLink.title}
                    onChange={(e) =>
                      setNewLink({ ...newLink, title: e.target.value })
                    }
                    placeholder="שם (למשל: תיקיית מסמכים)"
                    className="text-sm border p-2 rounded w-full bg-gray-50 text-right"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 text-right">
                    כתובת (URL):
                  </label>
                  <input
                    type="text"
                    value={newLink.url}
                    onChange={(e) =>
                      setNewLink({ ...newLink, url: e.target.value })
                    }
                    placeholder="https://..."
                    className="text-sm border p-2 rounded w-full bg-gray-50 text-right"
                    style={{ direction: "ltr" }}
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <Button
                    onClick={addLink}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold"
                  >
                    הוסף קישור
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setModalOpen(false)}
                    className="flex-1"
                  >
                    ביטול
                  </Button>
                </div>

                <div className="text-[10px] text-gray-500 text-center pt-2">
                  ניתן לשמור עד 5 קישורים אישיים
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  return null;
}

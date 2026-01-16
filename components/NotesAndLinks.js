import { useEffect, useState } from "react";
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
  getDoc,
} from "firebase/firestore";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotesAndLinks({ section }) {
  const [notes, setNotes] = useState([]);
  const [links, setLinks] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [targetUser, setTargetUser] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [newLink, setNewLink] = useState({ title: "", url: "" });
  const [isAuthReady, setIsAuthReady] = useState(false);

  // Get current user email and listen for auth changes
  const [userEmail, setUserEmail] = useState(auth.currentUser?.email);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setUserEmail(user?.email);
      setIsAuthReady(true);
      console.log("Auth state changed:", { email: user?.email, isReady: true });
    });

    return () => unsubscribe();
  }, []);

  const fetchUsers = async () => {
    if (!isAuthReady || !userEmail) {
      console.log("Skipping fetchUsers - auth not ready or no user");
      return;
    }

    try {
      const snap = await getDocs(collection(db, "users"));
      setAllUsers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      console.log("Users fetched successfully");
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  };

  const fetchNotes = async () => {
    if (!isAuthReady || !userEmail) {
      console.log("Skipping fetchNotes - auth not ready or no user");
      return;
    }

    try {
      console.log("Fetching notes for user:", userEmail);
      
      // Query notes that are either for all users, specifically for the current user,
      // or created by the current user
      const q = query(
        collection(db, "notes"),
        where("to", "in", ["all", userEmail]),
        orderBy("createdAt", "desc")
      );
      const snapshot = await getDocs(q);
      
      // Also get notes authored by the current user
      const authoredQ = query(
        collection(db, "notes"),
        where("author", "==", userEmail),
        orderBy("createdAt", "desc")
      );
      const authoredSnapshot = await getDocs(authoredQ);
      
      // Combine and deduplicate notes
      const allNotes = [...snapshot.docs, ...authoredSnapshot.docs]
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((note, index, self) => 
          index === self.findIndex(n => n.id === note.id)
        );
      
      console.log("Notes fetched:", allNotes.length);
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
      setLinks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (error) {
      console.error("Error fetching links:", error);
    }
  };

  useEffect(() => {
    if (!isAuthReady || !userEmail) {
      console.log("Skipping initial fetch - waiting for auth");
      return;
    }
    
    console.log("Setting up listeners for:", { section, userEmail });
    
    let unsubscribeNotes;
    let unsubscribeLinks;
    
    if (section === "notes") {
      // Set up real-time listener for notes
      const notesQuery = query(
        collection(db, "notes"),
        where("to", "in", ["all", userEmail]),
        orderBy("createdAt", "desc")
      );

      unsubscribeNotes = onSnapshot(notesQuery, () => {
        console.log("Notes updated, fetching new data");
        fetchNotes();
      });
    }

    if (section === "links") {
      // Set up real-time listener for links
      const linksQuery = query(
        collection(db, "links"),
        where("addedBy", "==", userEmail),
        orderBy("createdAt", "desc")
      );

      unsubscribeLinks = onSnapshot(linksQuery, () => {
        // When changes occur, use the existing fetchLinks function
        fetchLinks();
      });
    }

    // Initial fetch
    if (section === "notes") fetchNotes();
    if (section === "links") fetchLinks();
    fetchUsers();

    // Cleanup listeners
    return () => {
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
      setModalOpen(false);
    } catch (error) {
      console.error("Error adding note:", error);
      alert("שגיאה בהוספת פתק");
    }
  };

  const addLink = async () => {
    if (!newLink.title.trim() || !newLink.url.trim() || !userEmail) return;
    try {
      // Check if user has reached the limit
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
    if (!isAuthReady) {
      console.error("Cannot delete note: Auth not ready");
      alert("אנא המתן רגע ונסה שוב");
      return;
    }

    if (!userEmail) {
      console.error("Cannot delete note: No user email found");
      alert("שגיאה: משתמש לא מזוהה");
      return;
    }

    try {
      console.log("Attempting to delete note:", { id, userEmail });
      
      // Delete the note
      await deleteDoc(doc(db, "notes", id));
      
      // Update local state
      setNotes(prev => prev.filter(note => note.id !== id));
      
      console.log("Note deleted successfully:", id);
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

  if (section === "notes") {
    return (
      <div className="flex items-center gap-2">
        {notes.map((note) => (
          <div
            key={note.id}
            className="bg-yellow-200 border-yellow-400 border rounded shadow p-2 max-w-xs text-xs relative font-sans"
          >
            <div>{note.text}</div>
            <div className="text-gray-600 mt-1 text-[10px] flex justify-between">
              <span>{allUsers.find(u => u.email === note.author)?.alias || note.author}</span>
              {note.to !== "all" && (
                <span className="text-blue-600">ל: {allUsers.find(u => u.email === note.to)?.alias || note.to}</span>
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
        ))}

        {/* Add Note Icon */}
        <button
          onClick={() => setModalOpen(true)}
          className="text-yellow-600 text-2xl"
          title="הוסף פתק"
        >
          📝+
        </button>

        {/* Side Panel Modal */}
        {modalOpen && (
          <>
            <div 
              className="fixed inset-0 bg-black/20 z-[90]" 
              onClick={() => setModalOpen(false)}
            />
            <div className="fixed top-0 left-0 h-full w-72 bg-white shadow-2xl p-6 border-r z-[100] flex flex-col animate-in slide-in-from-left duration-300" style={{ direction: 'rtl' }}>
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-lg text-yellow-700 text-right">הוספת פתק חדש</h3>
                <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <X size={20} />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 text-right">עבור:</label>
                  <select 
                    value={targetUser} 
                    onChange={(e) => setTargetUser(e.target.value)} 
                    className="text-sm border p-2 rounded w-full bg-gray-50 text-right"
                  >
                    <option value="all">לכולם</option>
                    {allUsers.map((u) => (
                      <option key={u.id} value={u.email}>
                        {u.alias || u.email}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 text-right">תוכן:</label>
                  <textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="מה ברצונך להוסיף?"
                    className="w-full p-2 text-sm border rounded bg-gray-50 min-h-[120px] text-right"
                  />
                </div>
                
                <div className="flex gap-3 pt-4">
                  <Button onClick={addNote} className="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white font-bold">הוסף פתק</Button>
                  <Button variant="outline" onClick={() => setModalOpen(false)} className="flex-1">ביטול</Button>
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

        {/* Side Panel Modal */}
        {modalOpen && (
          <>
            <div 
              className="fixed inset-0 bg-black/20 z-[90]" 
              onClick={() => setModalOpen(false)}
            />
            <div className="fixed top-0 right-0 h-full w-72 bg-white shadow-2xl p-6 border-l z-[100] flex flex-col animate-in slide-in-from-right duration-300" style={{ direction: 'rtl' }}>
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-lg text-green-700 text-right">הוספת קישור חדש</h3>
                <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <X size={20} />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 text-right">שם הקישור:</label>
                  <input
                    type="text"
                    value={newLink.title}
                    onChange={(e) => setNewLink({ ...newLink, title: e.target.value })}
                    placeholder="שם (למשל: תיקיית מסמכים)"
                    className="text-sm border p-2 rounded w-full bg-gray-50 text-right"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 text-right">כתובת (URL):</label>
                  <input
                    type="text"
                    value={newLink.url}
                    onChange={(e) => setNewLink({ ...newLink, url: e.target.value })}
                    placeholder="https://..."
                    className="text-sm border p-2 rounded w-full bg-gray-50 text-right"
                    style={{ direction: 'ltr' }}
                  />
                </div>
                
                <div className="flex gap-3 pt-4">
                  <Button onClick={addLink} className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold">הוסף קישור</Button>
                  <Button variant="outline" onClick={() => setModalOpen(false)} className="flex-1">ביטול</Button>
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

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

        {/* Modal */}
        {modalOpen && (
          <div className="absolute top-16 left-1/2 transform -translate-x-1/2 bg-white shadow-xl p-4 border rounded z-50 w-60">
            <select 
              value={targetUser} 
              onChange={(e) => setTargetUser(e.target.value)} 
              className="text-xs border p-1 rounded w-full mb-2"
            >
              <option value="all">לכולם</option>
              {allUsers.map((u) => (
                <option key={u.id} value={u.email}>
                  {u.alias || u.email}
                </option>
              ))}
            </select>
            <textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="מה ברצונך להוסיף?"
              className="w-full p-1 text-xs border rounded"
            />
            <div className="flex justify-between mt-2 text-xs">
              <button onClick={() => setModalOpen(false)} className="text-gray-500">ביטול</button>
              <button onClick={addNote} className="text-yellow-600 font-bold">הוסף</button>
            </div>
          </div>
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

        {/* Modal */}
        {modalOpen && (
          <div className="absolute top-16 left-1/2 transform -translate-x-1/2 bg-white shadow-xl p-4 border rounded z-50 w-64">
            <input
              type="text"
              value={newLink.title}
              onChange={(e) => setNewLink({ ...newLink, title: e.target.value })}
              placeholder="שם"
              className="text-xs border p-1 rounded w-full mb-2"
            />
            <input
              type="text"
              value={newLink.url}
              onChange={(e) => setNewLink({ ...newLink, url: e.target.value })}
              placeholder="https://..."
              className="text-xs border p-1 rounded w-full"
            />
            <div className="flex justify-between mt-2 text-xs">
              <button onClick={() => setModalOpen(false)} className="text-gray-500">ביטול</button>
              <button onClick={addLink} className="text-green-600 font-bold">הוסף</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}

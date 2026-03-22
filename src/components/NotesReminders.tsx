import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  StickyNote, 
  Bell, 
  Tag, 
  Trash2, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  X,
  ChevronRight,
  MoreVertical,
  Search
} from 'lucide-react';
import { auth, db, collection, addDoc, query, where, orderBy, onSnapshot, deleteDoc, doc, updateDoc } from '../firebase';
import { Note, Reminder } from '../types';

interface NotesRemindersProps {
  onNotify?: (reminder: Reminder) => void;
}

const NotesReminders: React.FC<NotesRemindersProps> = ({ onNotify }) => {
  const [activeTab, setActiveTab] = useState<'notes' | 'reminders'>('notes');
  const [notes, setNotes] = useState<Note[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Form states
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [isAddingReminder, setIsAddingReminder] = useState(false);
  const [noteContent, setNoteContent] = useState('');
  const [noteTags, setNoteTags] = useState('');
  const [reminderTitle, setReminderTitle] = useState('');
  const [reminderDesc, setReminderDesc] = useState('');
  const [reminderDate, setReminderDate] = useState('');
  const [reminderTime, setReminderTime] = useState('');
  const [linkedNoteId, setLinkedNoteId] = useState<string | undefined>();

  const user = auth.currentUser;

  useEffect(() => {
    if (!user) return;

    const notesQuery = query(
      collection(db, 'notes'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const remindersQuery = query(
      collection(db, 'reminders'),
      where('userId', '==', user.uid),
      orderBy('remindAt', 'asc')
    );

    const unsubscribeNotes = onSnapshot(notesQuery, (snapshot) => {
      const notesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Note[];
      setNotes(notesData);
    });

    const unsubscribeReminders = onSnapshot(remindersQuery, (snapshot) => {
      const remindersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Reminder[];
      setReminders(remindersData);
    });

    return () => {
      unsubscribeNotes();
      unsubscribeReminders();
    };
  }, [user]);

  // Reminder trigger logic
  useEffect(() => {
    if (reminders.length === 0) return;

    const checkReminders = () => {
      const now = new Date();
      reminders.forEach(reminder => {
        if (reminder.status === 'pending') {
          const remindTime = new Date(reminder.remindAt);
          if (remindTime <= now) {
            // Trigger notification
            if (onNotify) onNotify(reminder);
            
            // Mark as triggered
            updateDoc(doc(db, 'reminders', reminder.id), {
              status: 'triggered'
            });
          }
        }
      });
    };

    const interval = setInterval(checkReminders, 10000); // Check every 10 seconds
    return () => clearInterval(interval);
  }, [reminders, onNotify]);

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !noteContent.trim()) return;

    try {
      const tags = noteTags.split(',').map(t => t.trim()).filter(t => t !== '');
      await addDoc(collection(db, 'notes'), {
        userId: user.uid,
        content: noteContent,
        tags,
        createdAt: new Date().toISOString()
      });
      setNoteContent('');
      setNoteTags('');
      setIsAddingNote(false);
    } catch (error) {
      console.error('Error adding note:', error);
    }
  };

  const handleAddReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !reminderTitle.trim() || !reminderDate || !reminderTime) return;

    try {
      const remindAt = new Date(`${reminderDate}T${reminderTime}`).toISOString();
      await addDoc(collection(db, 'reminders'), {
        userId: user.uid,
        title: reminderTitle,
        description: reminderDesc,
        remindAt,
        status: 'pending',
        noteId: linkedNoteId,
        createdAt: new Date().toISOString()
      });
      setReminderTitle('');
      setReminderDesc('');
      setReminderDate('');
      setReminderTime('');
      setLinkedNoteId(undefined);
      setIsAddingReminder(false);
    } catch (error) {
      console.error('Error adding reminder:', error);
    }
  };

  const handleDeleteNote = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'notes', id));
    } catch (error) {
      console.error('Error deleting note:', error);
    }
  };

  const handleDeleteReminder = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'reminders', id));
    } catch (error) {
      console.error('Error deleting reminder:', error);
    }
  };

  const toggleReminderStatus = async (reminder: Reminder) => {
    const newStatus = reminder.status === 'dismissed' ? 'pending' : 'dismissed';
    try {
      await updateDoc(doc(db, 'reminders', reminder.id), {
        status: newStatus
      });
    } catch (error) {
      console.error('Error updating reminder:', error);
    }
  };

  const filteredNotes = notes.filter(note => 
    note.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
    note.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const filteredReminders = reminders.filter(reminder => 
    reminder.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    reminder.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-[#f8f9fa]">
      {/* Header */}
      <div className="p-4 bg-white border-b border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
            {activeTab === 'notes' ? <StickyNote className="w-5 h-5 text-indigo-600" /> : <Bell className="w-5 h-5 text-indigo-600" />}
            {activeTab === 'notes' ? 'Notatki' : 'Przypomnienia'}
          </h2>
          <div className="flex gap-2">
            <button 
              onClick={() => setActiveTab('notes')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'notes' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              Notatki
            </button>
            <button 
              onClick={() => setActiveTab('reminders')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'reminders' ? 'bg-indigo-50 text-indigo-600' : 'text-gray-500 hover:bg-gray-50'}`}
            >
              Przypomnienia
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input 
            type="text"
            placeholder="Szukaj..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'notes' ? (
          <>
            <AnimatePresence>
              {isAddingNote && (
                <motion.form 
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  onSubmit={handleAddNote}
                  className="bg-white p-4 rounded-2xl shadow-sm border border-indigo-100 space-y-3"
                >
                  <textarea 
                    placeholder="Treść notatki..."
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    className="w-full p-3 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 min-h-[100px]"
                    required
                  />
                  <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl">
                    <Tag className="w-4 h-4 text-gray-400" />
                    <input 
                      type="text"
                      placeholder="Tagi (oddzielone przecinkami)..."
                      value={noteTags}
                      onChange={(e) => setNoteTags(e.target.value)}
                      className="flex-1 bg-transparent border-none text-sm focus:ring-0 p-0"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button 
                      type="button"
                      onClick={() => setIsAddingNote(false)}
                      className="px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 rounded-xl transition-colors"
                    >
                      Anuluj
                    </button>
                    <button 
                      type="submit"
                      className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors"
                    >
                      Zapisz
                    </button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>

            <div className="grid gap-3">
              {filteredNotes.map(note => (
                <motion.div 
                  key={note.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 group"
                >
                  <div className="flex justify-between items-start mb-2">
                    <p className="text-sm text-gray-700 whitespace-pre-wrap flex-1">{note.content}</p>
                    <button 
                      onClick={() => handleDeleteNote(note.id)}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  {note.tags && note.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {note.tags.map((tag, idx) => (
                        <span key={idx} className="px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[10px] font-semibold uppercase tracking-wider rounded-md flex items-center gap-1">
                          <Tag className="w-2.5 h-2.5" />
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 pt-3 border-t border-gray-50 flex items-center justify-between text-[10px] text-gray-400">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(note.createdAt).toLocaleDateString()}
                    </span>
                    <button 
                      onClick={() => {
                        setLinkedNoteId(note.id);
                        setReminderTitle(`Przypomnienie: ${note.content.substring(0, 20)}...`);
                        setActiveTab('reminders');
                        setIsAddingReminder(true);
                      }}
                      className="text-indigo-600 font-medium hover:underline"
                    >
                      Dodaj przypomnienie
                    </button>
                  </div>
                </motion.div>
              ))}
              {filteredNotes.length === 0 && !isAddingNote && (
                <div className="text-center py-12">
                  <StickyNote className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                  <p className="text-gray-400 text-sm">Brak notatek</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <AnimatePresence>
              {isAddingReminder && (
                <motion.form 
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  onSubmit={handleAddReminder}
                  className="bg-white p-4 rounded-2xl shadow-sm border border-indigo-100 space-y-3"
                >
                  <input 
                    type="text"
                    placeholder="Tytuł przypomnienia..."
                    value={reminderTitle}
                    onChange={(e) => setReminderTitle(e.target.value)}
                    className="w-full p-3 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20"
                    required
                  />
                  <textarea 
                    placeholder="Dodatkowy opis (opcjonalnie)..."
                    value={reminderDesc}
                    onChange={(e) => setReminderDesc(e.target.value)}
                    className="w-full p-3 bg-gray-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 min-h-[80px]"
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      <input 
                        type="date"
                        value={reminderDate}
                        onChange={(e) => setReminderDate(e.target.value)}
                        className="flex-1 bg-transparent border-none text-sm focus:ring-0 p-0"
                        required
                      />
                    </div>
                    <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-xl">
                      <Clock className="w-4 h-4 text-gray-400" />
                      <input 
                        type="time"
                        value={reminderTime}
                        onChange={(e) => setReminderTime(e.target.value)}
                        className="flex-1 bg-transparent border-none text-sm focus:ring-0 p-0"
                        required
                      />
                    </div>
                  </div>
                  {linkedNoteId && (
                    <div className="px-3 py-2 bg-indigo-50 text-indigo-600 text-xs rounded-xl flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <StickyNote className="w-3 h-3" />
                        Powiązane z notatką
                      </span>
                      <button type="button" onClick={() => setLinkedNoteId(undefined)}>
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                  <div className="flex justify-end gap-2 pt-2">
                    <button 
                      type="button"
                      onClick={() => setIsAddingReminder(false)}
                      className="px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 rounded-xl transition-colors"
                    >
                      Anuluj
                    </button>
                    <button 
                      type="submit"
                      className="px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors"
                    >
                      Ustaw
                    </button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>

            <div className="grid gap-3">
              {filteredReminders.map(reminder => (
                <motion.div 
                  key={reminder.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={`bg-white p-4 rounded-2xl shadow-sm border transition-colors group ${reminder.status === 'dismissed' ? 'opacity-60 border-gray-100' : 'border-gray-100'}`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <h3 className={`text-sm font-semibold ${reminder.status === 'dismissed' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                        {reminder.title}
                      </h3>
                      {reminder.description && (
                        <p className="text-xs text-gray-500 mt-1">{reminder.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => toggleReminderStatus(reminder)}
                        className={`p-1.5 rounded-lg transition-colors ${reminder.status === 'dismissed' ? 'text-indigo-600 hover:bg-indigo-50' : 'text-green-600 hover:bg-green-50'}`}
                      >
                        {reminder.status === 'dismissed' ? <ChevronRight className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                      </button>
                      <button 
                        onClick={() => handleDeleteReminder(reminder.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-3 text-[10px]">
                    <span className={`flex items-center gap-1 font-medium ${new Date(reminder.remindAt) < new Date() && reminder.status === 'pending' ? 'text-red-500' : 'text-indigo-600'}`}>
                      <Calendar className="w-3 h-3" />
                      {new Date(reminder.remindAt).toLocaleDateString()}
                    </span>
                    <span className={`flex items-center gap-1 font-medium ${new Date(reminder.remindAt) < new Date() && reminder.status === 'pending' ? 'text-red-500' : 'text-indigo-600'}`}>
                      <Clock className="w-3 h-3" />
                      {new Date(reminder.remindAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {reminder.status === 'triggered' && (
                      <span className="flex items-center gap-1 text-amber-500 font-bold uppercase tracking-wider">
                        <AlertCircle className="w-3 h-3" />
                        Wywołane
                      </span>
                    )}
                  </div>
                </motion.div>
              ))}
              {filteredReminders.length === 0 && !isAddingReminder && (
                <div className="text-center py-12">
                  <Bell className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                  <p className="text-gray-400 text-sm">Brak przypomnień</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* FAB */}
      <div className="p-4 bg-white border-t border-gray-100">
        <button 
          onClick={() => activeTab === 'notes' ? setIsAddingNote(true) : setIsAddingReminder(true)}
          className="w-full py-3 bg-indigo-600 text-white rounded-2xl font-semibold flex items-center justify-center gap-2 shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all active:scale-95"
        >
          <Plus className="w-5 h-5" />
          Dodaj {activeTab === 'notes' ? 'notatkę' : 'przypomnienie'}
        </button>
      </div>
    </div>
  );
};

export default NotesReminders;

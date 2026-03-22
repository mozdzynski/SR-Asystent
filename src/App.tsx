import React, { useState, useRef, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { 
  MessageSquare, 
  Mic, 
  Send, 
  Settings, 
  History, 
  FileText, 
  AlertTriangle, 
  Camera, 
  CheckCircle2, 
  MapPin,
  Menu,
  X,
  User,
  Plus,
  LogOut,
  LogIn,
  StickyNote,
  Bell
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { getAssistantResponse } from './services/geminiService';
import { COMMON_ERROR_CODES } from './constants';
import NotesReminders from './components/NotesReminders';
import { Reminder } from './types';
import { 
  auth, 
  db, 
  loginWithGoogle, 
  logout, 
  onAuthStateChanged, 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  doc, 
  getDoc, 
  setDoc,
  deleteDoc,
  storage,
  ref,
  uploadBytes,
  getDownloadURL
} from './firebase';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-neutral-50 p-4">
          <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
            <AlertTriangle className="w-16 h-16 text-rose-500 mx-auto mb-4" />
            <h1 className="text-xl font-bold mb-2 text-neutral-900">Wystąpił błąd</h1>
            <p className="text-neutral-600 mb-6">Przepraszamy, coś poszło nie tak. Spróbuj odświeżyć stronę.</p>
            <button 
              onClick={() => window.location.reload()}
              className="bg-neutral-900 text-white px-6 py-2 rounded-xl font-medium hover:bg-neutral-800 transition-colors"
            >
              Odśwież
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  userId?: string;
}

interface TechnicalDocument {
  id: string;
  name: string;
  size: string;
  date: string;
  url?: string;
  category?: string;
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}

function MainApp() {
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeView, setActiveView] = useState<'chat' | 'notes'>('chat');
  const [activeNotifications, setActiveNotifications] = useState<Reminder[]>([]);
  const [documents, setDocuments] = useState<TechnicalDocument[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [isErrorModalOpen, setIsErrorModalOpen] = useState(false);
  const [errorSearch, setErrorSearch] = useState('');
  const [foundError, setFoundError] = useState<any>(null);
  const [suggestedDocs, setSuggestedDocs] = useState<TechnicalDocument[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const toggleRecording = () => {
    setIsRecording(!isRecording);
    if (!isRecording) {
      // Simulate voice input for now
      setTimeout(() => {
        setInput('Jakie są najczęstsze kody błędów w dźwigach Otis?');
        setIsRecording(false);
      }, 2000);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Check/Create user profile
        const userDocRef = doc(db, 'users', currentUser.uid);
        try {
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            const profile = userDoc.data();
            setUserProfile(profile);
            setIsAdmin(profile.role === 'admin');
          } else {
            const newProfile = {
              uid: currentUser.uid,
              displayName: currentUser.displayName || 'Użytkownik',
              email: currentUser.email,
              role: currentUser.email === 't.mozdzynski@gmail.com' ? 'admin' : 'technician',
              photoURL: currentUser.photoURL
            };
            await setDoc(userDocRef, newProfile);
            setUserProfile(newProfile);
            setIsAdmin(newProfile.role === 'admin');
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${currentUser.uid}`);
        }
      } else {
        setUserProfile(null);
        setIsAdmin(false);
      }
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !isAuthReady) return;

    const messagesQuery = query(
      collection(db, 'messages'),
      where('userId', '==', user.uid),
      orderBy('timestamp', 'asc')
    );

    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: new Date(doc.data().timestamp)
      })) as Message[];
      
      if (msgs.length === 0) {
        setMessages([{
          id: 'welcome',
          role: 'assistant',
          content: 'Witaj w asystencie SR Serwis. W czym mogę Ci dzisiaj pomóc? Możesz zapytać o kody błędów, normy lub instrukcje.',
          timestamp: new Date(),
        }]);
      } else {
        setMessages(msgs);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'messages');
    });

    return () => unsubscribe();
  }, [user, isAuthReady]);

  useEffect(() => {
    if (!user || !isAuthReady) return;

    const docsQuery = query(collection(db, 'documents'), orderBy('date', 'desc'));
    const unsubscribe = onSnapshot(docsQuery, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as TechnicalDocument[];
      setDocuments(docs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'documents');
    });

    return () => unsubscribe();
  }, [user, isAuthReady]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading || !user) return;

    const userMessageContent = input;
    setInput('');
    setIsLoading(true);

    try {
      // Save user message to Firestore
      await addDoc(collection(db, 'messages'), {
        role: 'user',
        content: userMessageContent,
        timestamp: new Date().toISOString(),
        userId: user.uid
      });

      const history = messages.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      }));

      const response = await getAssistantResponse(userMessageContent, history);
      
      // Save assistant response to Firestore
      await addDoc(collection(db, 'messages'), {
        role: 'assistant',
        content: response || 'Przepraszam, wystąpił błąd podczas generowania odpowiedzi.',
        timestamp: new Date().toISOString(),
        userId: user.uid
      });

    } catch (error) {
      console.error('Error in chat:', error);
      handleFirestoreError(error, OperationType.CREATE, 'messages');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0 && isAdmin) {
      const file = files[0];
      
      // Limit do 10MB
      if (file.size > 10 * 1024 * 1024) {
        setFoundError({
          description: 'Plik jest za duży',
          solution: 'Maksymalny rozmiar pliku to 10MB. Wybierz mniejszy plik.'
        });
        setIsErrorModalOpen(true);
        e.target.value = '';
        return;
      }

      console.log(`Rozpoczynam wgrywanie: ${file.name} (${file.size} bytes)`);
      setUploadProgress(10); // Start indicator

      const storageRef = ref(storage, `documents/${Date.now()}_${file.name}`);
      
      try {
        // Add a timeout to prevent hanging if Storage is not enabled
        const uploadPromise = uploadBytes(storageRef, file);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Przekroczono czas oczekiwania. Upewnij się, że Firebase Storage jest włączone w Twoim projekcie Firebase.')), 15000)
        );
        
        const snapshot = await Promise.race([uploadPromise, timeoutPromise]) as any;
        
        console.log('Upload zakończony sukcesem');
        setUploadProgress(90);
        
        const downloadURL = await getDownloadURL(snapshot.ref);
        await addDoc(collection(db, 'documents'), {
          name: file.name,
          size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
          date: new Date().toISOString().split('T')[0],
          category: 'manual',
          url: downloadURL
        });
      } catch (error: any) {
        console.error('Błąd Firebase Storage:', error);
        // Use the error modal instead of alert
        setFoundError({ 
          description: 'Błąd wgrywania pliku (Firebase Storage)', 
          solution: 'Usługa Firebase Storage nie jest włączona. Przejdź do konsoli Firebase (https://console.firebase.google.com/project/gen-lang-client-0389360841/storage), kliknij "Rozpocznij" (Get Started) i skonfiguruj Storage w trybie testowym.' 
        });
        setIsErrorModalOpen(true);
      } finally {
        setUploadProgress(null);
        // Reset the input value so the same file can be selected again
        e.target.value = '';
      }
    }
  };

  const handleSearchError = () => {
    const query = errorSearch.toLowerCase();
    const error = COMMON_ERROR_CODES.find(e => e.code.toLowerCase() === query);
    setFoundError(error || { description: 'Nie znaleziono kodu w bazie. Zapytaj asystenta AI.', solution: '' });
    
    // Suggest documents based on code or description keywords
    const related = documents.filter(doc => {
      const name = doc.name.toLowerCase();
      // Match by code
      if (name.includes(query)) return true;
      // Match by keywords if error found
      if (error) {
        const keywords = error.description.toLowerCase().split(' ').filter(w => w.length > 3);
        return keywords.some(kw => name.includes(kw));
      }
      return false;
    });
    setSuggestedDocs(related);
  };

  const handleReminderNotify = (reminder: Reminder) => {
    setActiveNotifications(prev => [...prev, reminder]);
    // Auto-remove after 10 seconds
    setTimeout(() => {
      setActiveNotifications(prev => prev.filter(n => n.id !== reminder.id));
    }, 10000);
  };

  if (!isAuthReady) {
    return (
      <div className="h-screen flex items-center justify-center bg-neutral-50">
        <div className="w-8 h-8 border-4 border-neutral-900 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center"
        >
          <div className="w-20 h-20 bg-neutral-900 rounded-2xl flex items-center justify-center text-white mx-auto mb-6 text-3xl font-bold">SR</div>
          <h1 className="text-2xl font-bold mb-2 text-neutral-900">SR Serwis</h1>
          <p className="text-neutral-500 mb-8">Zaloguj się, aby uzyskać dostęp do asystenta technicznego.</p>
          <button 
            onClick={loginWithGoogle}
            className="w-full flex items-center justify-center gap-3 bg-white border border-neutral-200 text-neutral-700 font-semibold py-3 px-6 rounded-2xl hover:bg-neutral-50 transition-colors shadow-sm"
          >
            <LogIn size={20} />
            Zaloguj się przez Google
          </button>
        </motion.div>
      </div>
    );
  }

  const additionalFeatures = [
    { icon: AlertTriangle, label: 'Kody błędów', color: 'text-amber-500' },
    { icon: StickyNote, label: 'Notatki i Przypomnienia', color: 'text-indigo-500' },
    { icon: FileText, label: 'Normy EN 81', color: 'text-blue-500' },
    { icon: Camera, label: 'Analiza części', color: 'text-purple-500' },
    { icon: CheckCircle2, label: 'Protokoły', color: 'text-emerald-500' },
    { icon: MapPin, label: 'Lokalizacja', color: 'text-rose-500' },
  ];

  return (
    <div className="flex h-screen bg-neutral-50 font-sans text-neutral-900 overflow-hidden">
      {/* Modals */}
      <AnimatePresence>
        {isErrorModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
            >
              <div className="p-4 border-b border-neutral-100 flex justify-between items-center">
                <h3 className="font-bold flex items-center gap-2">
                  <AlertTriangle size={18} className="text-amber-500" />
                  Szybkie szukanie kodu
                </h3>
                <button onClick={() => { setIsErrorModalOpen(false); setFoundError(null); setErrorSearch(''); setSuggestedDocs([]); }} className="p-1 hover:bg-neutral-100 rounded">
                  <X size={20} />
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={errorSearch}
                    onChange={(e) => setErrorSearch(e.target.value)}
                    placeholder="Wpisz kod (np. E01)..."
                    className="flex-1 bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2 text-sm focus:border-neutral-400 outline-none"
                    onKeyDown={(e) => e.key === 'Enter' && handleSearchError()}
                  />
                  <button 
                    onClick={handleSearchError}
                    className="bg-neutral-900 text-white px-4 py-2 rounded-xl text-sm font-medium"
                  >
                    Szukaj
                  </button>
                </div>

                {foundError && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-neutral-50 rounded-xl border border-neutral-100"
                  >
                    {foundError.manufacturer && (
                      <p className="text-[10px] font-bold uppercase text-neutral-400 tracking-wider mb-1">{foundError.manufacturer}</p>
                    )}
                    <p className="font-bold text-neutral-800 mb-2">{foundError.code || 'Wynik'}</p>
                    <p className="text-sm text-neutral-600 mb-3">{foundError.description}</p>
                    {foundError.solution && (
                      <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-100 mb-4">
                        <p className="text-xs font-bold text-emerald-700 mb-1 flex items-center gap-1">
                          <CheckCircle2 size={12} /> Rozwiązanie:
                        </p>
                        <p className="text-xs text-emerald-800 leading-relaxed">{foundError.solution}</p>
                      </div>
                    )}

                    {suggestedDocs.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-neutral-200">
                        <p className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                          <FileText size={12} /> Sugerowane dokumenty:
                        </p>
                        <div className="space-y-2">
                          {suggestedDocs.map((doc) => (
                            <a 
                              key={doc.id}
                              href={doc.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-between p-2 bg-white border border-neutral-200 rounded-lg hover:border-indigo-300 transition-colors group"
                            >
                              <span className="text-xs font-medium text-neutral-700 truncate max-w-[200px]">{doc.name}</span>
                              <span className="text-[10px] text-indigo-600 font-bold group-hover:underline">Otwórz</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Sidebar for Desktop / Mobile Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            className="fixed inset-y-0 left-0 w-72 bg-white border-r border-neutral-200 z-50 shadow-xl flex flex-col"
          >
            <div className="p-4 border-bottom border-neutral-100 flex justify-between items-center">
              <div className="flex items-center gap-2 font-bold text-neutral-800">
                <div className="w-8 h-8 bg-neutral-900 rounded-lg flex items-center justify-center text-white">SR</div>
                <span>SR Serwis</span>
              </div>
              <button onClick={() => setIsSidebarOpen(false)} className="p-1 hover:bg-neutral-100 rounded">
                <X size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              <button 
                onClick={() => { setIsAdmin(!isAdmin); setIsSidebarOpen(false); }}
                className={`w-full flex items-center gap-2 p-2 rounded text-sm font-medium transition-colors ${
                  isAdmin ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                }`}
              >
                <Settings size={16} />
                <span>{isAdmin ? 'Widok Serwisanta' : 'Panel Biurowy (Admin)'}</span>
              </button>

              {!isAdmin ? (
                <>
                  <div>
                    <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Historia</h3>
                    <div className="space-y-1">
                      <button className="w-full text-left p-2 rounded hover:bg-neutral-100 text-sm flex items-center gap-2">
                        <History size={14} />
                        <span>Kod błędu E01 - Otis</span>
                      </button>
                      <button className="w-full text-left p-2 rounded hover:bg-neutral-100 text-sm flex items-center gap-2">
                        <History size={14} />
                        <span>Norma EN 81-20:2020</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Narzędzia</h3>
                    <div className="grid grid-cols-1 gap-2">
                      {additionalFeatures.map((feature, idx) => (
                        <button 
                          key={idx} 
                          onClick={() => {
                            if (feature.label === 'Kody błędów') {
                              setIsErrorModalOpen(true);
                              setIsSidebarOpen(false);
                            } else if (feature.label === 'Notatki i Przypomnienia') {
                              setActiveView('notes');
                              setIsSidebarOpen(false);
                            }
                          }}
                          className="w-full text-left p-2 rounded hover:bg-neutral-100 text-sm flex items-center gap-2"
                        >
                          <feature.icon size={16} className={feature.color} />
                          <span>{feature.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div>
                  <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Zarządzanie</h3>
                  <div className="space-y-1">
                    <button className="w-full text-left p-2 rounded bg-neutral-100 text-sm flex items-center gap-2">
                      <FileText size={16} />
                      <span>Baza dokumentów</span>
                    </button>
                    <button className="w-full text-left p-2 rounded hover:bg-neutral-100 text-sm flex items-center gap-2">
                      <User size={16} />
                      <span>Użytkownicy</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-neutral-100">
              <button 
                onClick={logout}
                className="w-full flex items-center gap-3 p-2 rounded hover:bg-neutral-100 text-sm"
              >
                <div className="w-8 h-8 rounded-full bg-neutral-200 flex items-center justify-center overflow-hidden">
                  {user.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : <User size={16} />}
                </div>
                <div className="text-left flex-1">
                  <p className="font-medium truncate">{user.displayName}</p>
                  <p className="text-xs text-neutral-500">{isAdmin ? 'Administrator' : 'Serwisant'}</p>
                </div>
                <LogOut size={16} className="text-neutral-400" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative">
        {/* Header */}
        <header className="h-16 bg-white border-b border-neutral-200 flex items-center justify-between px-4 z-10">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 hover:bg-neutral-100 rounded-lg text-neutral-600"
            >
              <Menu size={24} />
            </button>
            <div>
              <h1 className="font-bold text-neutral-800 leading-tight">
                {isAdmin ? 'Panel Administracyjny' : activeView === 'chat' ? 'Asystent SR Serwis' : 'Notatki i Przypomnienia'}
              </h1>
              <p className="text-[10px] text-neutral-500 uppercase tracking-widest font-semibold">Gdańsk • {isAdmin ? 'Zarządzanie' : activeView === 'chat' ? 'Wsparcie Techniczne' : 'Organizacja Pracy'}</p>
            </div>
          </div>
          {!isAdmin && activeView !== 'chat' && (
            <button 
              onClick={() => setActiveView('chat')}
              className="p-2 bg-neutral-100 rounded-lg text-neutral-600 hover:bg-neutral-200 transition-colors"
            >
              <MessageSquare size={20} />
            </button>
          )}
        </header>

        {/* Notifications Overlay */}
        <div className="fixed top-20 right-4 z-[110] space-y-2 pointer-events-none">
          <AnimatePresence>
            {activeNotifications.map(notification => (
              <motion.div 
                key={notification.id}
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-indigo-600 text-white p-4 rounded-2xl shadow-xl pointer-events-auto flex items-start gap-3 max-w-xs border border-indigo-500"
              >
                <div className="bg-white/20 p-2 rounded-xl">
                  <Bell className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-sm">{notification.title}</h4>
                  <p className="text-xs text-indigo-100 mt-1">{notification.description || 'Przypomnienie o zadaniu'}</p>
                </div>
                <button 
                  onClick={() => setActiveNotifications(prev => prev.filter(n => n.id !== notification.id))}
                  className="p-1 hover:bg-white/10 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {/* Content Area */}
        <main className="flex-1 overflow-y-auto p-4 scrollbar-hide">
          <div className="max-w-3xl mx-auto h-full">
            {!isAdmin ? (
              activeView === 'chat' ? (
                <div className="space-y-6">
                {messages.map((message) => (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`flex gap-3 max-w-[85%] ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                      <div className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center ${
                        message.role === 'user' ? 'bg-neutral-900 text-white' : 'bg-neutral-200 text-neutral-700'
                      }`}>
                        {message.role === 'user' ? <User size={16} /> : <MessageSquare size={16} />}
                      </div>
                      <div className={`p-4 rounded-2xl shadow-sm ${
                        message.role === 'user' 
                          ? 'bg-neutral-900 text-white rounded-tr-none' 
                          : 'bg-white border border-neutral-100 text-neutral-800 rounded-tl-none'
                      }`}>
                        <div className="prose prose-sm max-w-none prose-neutral dark:prose-invert">
                          <ReactMarkdown>{message.content}</ReactMarkdown>
                        </div>
                        <p className={`text-[10px] mt-2 opacity-50 ${message.role === 'user' ? 'text-right' : 'text-left'}`}>
                          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                ))}
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="flex gap-3">
                      <div className="w-8 h-8 rounded-lg bg-neutral-200 flex items-center justify-center animate-pulse">
                        <MessageSquare size={16} className="text-neutral-400" />
                      </div>
                      <div className="bg-white border border-neutral-100 p-4 rounded-2xl rounded-tl-none shadow-sm flex gap-1">
                        <span className="w-1.5 h-1.5 bg-neutral-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                        <span className="w-1.5 h-1.5 bg-neutral-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                        <span className="w-1.5 h-1.5 bg-neutral-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            ) : (
              <NotesReminders onNotify={handleReminderNotify} />
            )
          ) : (
              <div className="space-y-8 py-4">
                <section>
                  <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                    <FileText className="text-neutral-400" />
                    Wgraj nowe dokumenty
                  </h2>
                  <div className="border-2 border-dashed border-neutral-200 rounded-2xl p-8 text-center hover:border-neutral-400 transition-colors bg-white">
                    <input 
                      type="file" 
                      id="file-upload" 
                      className="hidden" 
                      onChange={handleFileUpload}
                      accept=".pdf,.doc,.docx,.txt"
                    />
                    <label htmlFor="file-upload" className="cursor-pointer">
                      <div className="w-12 h-12 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        {uploadProgress !== null ? (
                          <div className="relative w-8 h-8">
                            <svg className="w-full h-full" viewBox="0 0 36 36">
                              <path
                                className="text-neutral-200 stroke-current"
                                strokeWidth="3"
                                fill="none"
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                              />
                              <path
                                className="text-indigo-600 stroke-current"
                                strokeWidth="3"
                                strokeDasharray={`${uploadProgress}, 100`}
                                strokeLinecap="round"
                                fill="none"
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                              />
                            </svg>
                            <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold">
                              {Math.round(uploadProgress)}%
                            </span>
                          </div>
                        ) : (
                          <Plus className="text-neutral-600" />
                        )}
                      </div>
                      <p className="font-medium">
                        {uploadProgress !== null ? 'Wgrywanie...' : 'Kliknij lub przeciągnij pliki tutaj'}
                      </p>
                      <p className="text-sm text-neutral-500 mt-1">PDF, DOCX, TXT (max 10MB)</p>
                    </label>
                  </div>
                </section>

                <section>
                  <h2 className="text-lg font-bold mb-4">Aktualna baza wiedzy</h2>
                  <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-neutral-50 border-b border-neutral-200">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Nazwa pliku</th>
                          <th className="px-4 py-3 font-semibold">Rozmiar</th>
                          <th className="px-4 py-3 font-semibold">Data dodania</th>
                          <th className="px-4 py-3 font-semibold">Akcje</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {documents.map((docItem) => (
                          <tr key={docItem.id} className="hover:bg-neutral-50">
                            <td className="px-4 py-3 flex items-center gap-2">
                              <FileText size={16} className="text-blue-500" />
                              {docItem.name}
                            </td>
                            <td className="px-4 py-3 text-neutral-500">{docItem.size}</td>
                            <td className="px-4 py-3 text-neutral-500">{docItem.date}</td>
                            <td className="px-4 py-3 flex items-center gap-3">
                              {docItem.url && (
                                <a 
                                  href={docItem.url} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-indigo-600 hover:underline font-medium"
                                >
                                  Pobierz
                                </a>
                              )}
                              <button 
                                onClick={async () => {
                                  try {
                                    await deleteDoc(doc(db, 'documents', docItem.id));
                                  } catch (error) {
                                    handleFirestoreError(error, OperationType.DELETE, `documents/${docItem.id}`);
                                  }
                                }}
                                className="text-red-500 hover:underline"
                              >
                                Usuń
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            )}
          </div>
        </main>

        {/* Input Area (Only for Technician View and Chat View) */}
        {!isAdmin && activeView === 'chat' && (
          <div className="p-4 bg-white border-t border-neutral-200">
            <div className="max-w-3xl mx-auto relative">
              <div className="flex items-end gap-2 bg-neutral-50 border border-neutral-200 rounded-2xl p-2 focus-within:border-neutral-400 transition-colors">
                <button 
                  onClick={toggleRecording}
                  className={`p-3 rounded-xl transition-all ${
                    isRecording ? 'bg-red-500 text-white animate-pulse' : 'hover:bg-neutral-200 text-neutral-500'
                  }`}
                >
                  <Mic size={20} />
                </button>
                <textarea
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Zadaj pytanie techniczne..."
                  className="flex-1 bg-transparent border-none focus:ring-0 py-3 px-2 resize-none max-h-32 text-sm"
                />
                <button 
                  onClick={handleSend}
                  disabled={!input.trim() || isLoading}
                  className={`p-3 rounded-xl transition-all ${
                    !input.trim() || isLoading ? 'text-neutral-300' : 'bg-neutral-900 text-white hover:bg-neutral-800'
                  }`}
                >
                  <Send size={20} />
                </button>
              </div>
              
              {/* Quick Actions Bar (Mobile) */}
              <div className="flex gap-2 mt-3 overflow-x-auto pb-1 scrollbar-hide">
                <button 
                  onClick={() => setIsErrorModalOpen(true)}
                  className="flex-shrink-0 px-3 py-1.5 bg-white border border-neutral-200 rounded-full text-xs font-medium text-neutral-600 hover:bg-neutral-50 flex items-center gap-1.5"
                >
                  <AlertTriangle size={12} className="text-amber-500" />
                  Kod błędu
                </button>
                <button 
                  onClick={() => setActiveView('notes')}
                  className="flex-shrink-0 px-3 py-1.5 bg-white border border-neutral-200 rounded-full text-xs font-medium text-neutral-600 hover:bg-neutral-50 flex items-center gap-1.5"
                >
                  <StickyNote size={12} className="text-indigo-500" />
                  Notatki
                </button>
                <button className="flex-shrink-0 px-3 py-1.5 bg-white border border-neutral-200 rounded-full text-xs font-medium text-neutral-600 hover:bg-neutral-50 flex items-center gap-1.5">
                  <FileText size={12} className="text-blue-500" />
                  Norma EN 81
                </button>
                <button className="flex-shrink-0 px-3 py-1.5 bg-white border border-neutral-200 rounded-full text-xs font-medium text-neutral-600 hover:bg-neutral-50 flex items-center gap-1.5">
                  <Camera size={12} className="text-purple-500" />
                  Zrób zdjęcie
                </button>
                <button className="flex-shrink-0 px-3 py-1.5 bg-white border border-neutral-200 rounded-full text-xs font-medium text-neutral-600 hover:bg-neutral-50 flex items-center gap-1.5">
                  <Plus size={12} />
                  Nowy protokół
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

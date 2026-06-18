import React, { useState, useEffect } from 'react';
import logo from './assets/logo.png';
import bgImage from './assets/background.png';

export default function App() {
  // Auth Matrix States
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Operational Process States
  const [inputType, setInputType] = useState('youtube');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [customTitle, setCustomTitle] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState('');
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('summary');
  const [lectureData, setLectureData] = useState(null);
  const [historyDeck, setHistoryDeck] = useState([]);
  const [flippedCards, setFlippedCards] = useState({});

  const fetchUserHistory = async () => {
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/history/${username.trim().lower()}`);
      if (res.ok) {
        const data = await res.json();
        setHistoryDeck(data);
      }
    } catch (err) { console.error("History sync error:", err); }
  };

  useEffect(() => {
    if (isLoggedIn) { fetchUserHistory(); }
  }, [isLoggedIn]);

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError('');
    const endpoint = isRegistering ? 'register' : 'login';
    
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'PROCESS_FAULT');
      
      if (isRegistering) {
        setIsRegistering(false);
        setLoginError('REGISTRATION_SUCCESS // NOW_LOGIN');
        setPassword('');
      } else {
        setIsLoggedIn(true);
      }
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleAnalyze = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setLectureData(null);
    setFlippedCards({});
    
    const operationalTitle = customTitle.trim() || `Lecture Analysis (${new Date().toLocaleDateString()})`;

    try {
      let textToAnalyze = '';
      
      if (inputType === 'youtube') {
        if (!youtubeUrl.trim()) throw new Error('Please supply a valid URL.');
        setLoadingStage('Extracting transcript from streaming node...');
        const extractRes = await fetch('http://127.0.0.1:8000/api/extract/youtube', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: youtubeUrl })
        });
        const data = await extractRes.json();
        if (!extractRes.ok) throw new Error(data.detail || 'Extract error');
        textToAnalyze = data.transcript;
      } else {
        if (!selectedFile) throw new Error('Please select a local PDF.');
        setLoadingStage('Sifting text matrices from local data file...');
        const formData = new FormData();
        formData.append('file', selectedFile);
        const extractRes = await fetch('http://127.0.0.1:8000/api/extract/pdf', { method: 'POST', body: formData });
        const data = await extractRes.json();
        if (!extractRes.ok) throw new Error(data.detail || 'Extract error');
        textToAnalyze = data.text;
      }
      
      setLoadingStage('Syncing telemetry arrays with Gemini AI...');
      const analyzeRes = await fetch('http://127.0.0.1:8000/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textToAnalyze, username, title: operationalTitle })
      });
      const finalizedData = await analyzeRes.json();
      if (!analyzeRes.ok) throw new Error(finalizedData.detail || 'Analysis failure');
      
      setLectureData(finalizedData);
      setActiveTab('summary');
      setCustomTitle('');
      setYoutubeUrl('');
      setSelectedFile(null);
      fetchUserHistory();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setLoadingStage('');
    }
  };

  const toggleCardFlip = (index) => {
    setFlippedCards(prev => ({ ...prev, [index]: !prev[index] }));
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen text-white font-sans antialiased flex items-center justify-center px-6 py-12 bg-cover bg-center bg-no-repeat bg-fixed" style={{ backgroundImage: `url(${bgImage})` }}>
        <div className="w-full max-w-md bg-neutral-900/40 backdrop-blur-2xl border border-white/10 p-8 rounded-2xl shadow-2xl space-y-6">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="bg-black border border-white/10 px-4 py-2 rounded-xl shadow-md">
              <img src={logo} alt="Logo" className="h-12 w-auto mix-blend-screen" />
            </div>
            <div className="font-header">
              <h1 className="text-xl font-bold tracking-widest uppercase">LECTURELENS</h1>
              <p className="text-[10px] text-neutral-400 tracking-wider mt-1">{isRegistering ? 'INITIALIZE_NEW_IDENTITY_NODE' : 'AUTH_REQUIRED_FOR_NODE_ACCESS'}</p>
            </div>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            <div>
              <label className="block font-header text-[10px] tracking-widest text-neutral-400 uppercase mb-1">USER_NODE_ID</label>
              <input type="text" required value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username..." className="w-full bg-neutral-950/60 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none placeholder-neutral-700" />
            </div>
            <div>
              <label className="block font-header text-[10px] tracking-widest text-neutral-400 uppercase mb-1">ACCESS_KEYPASS</label>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password..." className="w-full bg-neutral-950/60 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none placeholder-neutral-700" />
            </div>

            {loginError && <div className="p-3 border border-white/10 text-[11px] font-mono text-neutral-300 bg-neutral-950/50 rounded-xl">{loginError}</div>}

            <button type="submit" disabled={loginLoading} className="w-full bg-white hover:bg-neutral-200 text-black font-header text-xs tracking-widest uppercase py-3.5 rounded-xl font-bold cursor-pointer">{loginLoading ? 'COMMITTING...' : isRegistering ? 'CONFIRM_REGISTRATION.' : 'INITIALIZE_SESSION.'}</button>
          </form>

          <div className="text-center font-header text-[11px]">
            <button onClick={() => { setIsRegistering(!isRegistering); setLoginError(''); }} className="text-neutral-400 hover:text-white underline tracking-wider uppercase">
              {isRegistering ? '// Access Existing Terminal' : '// Provision New Account Node'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen text-white font-sans antialiased px-6 py-12 bg-cover bg-center bg-no-repeat bg-fixed" style={{ backgroundImage: `url(${bgImage})` }}>
      <div className="max-w-4xl mx-auto space-y-8">
        
        <header className="bg-neutral-900/40 backdrop-blur-xl p-6 border border-white/10 rounded-2xl flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-5">
            <div className="bg-black border border-white/10 px-4 py-2 rounded-xl">
              <img src={logo} alt="Logo" className="h-12 w-auto mix-blend-screen" />
            </div>
            <div className="hidden sm:block border-l border-white/10 h-10"></div>
            <div className="hidden sm:block font-header">
              <p className="text-[14px] font-bold tracking-widest uppercase">LECTURELENS</p>
              <p className="text-[10px] text-neutral-400 uppercase tracking-wider mt-0.5">ACTIVE_USER // {username.toUpperCase()}</p>
            </div>
          </div>
          <div className="font-header flex items-center gap-3">
            <span className="text-[11px] bg-white/5 border border-white/10 px-4 py-2 rounded-xl tracking-widest text-neutral-200">V1.3.0 [SECURE]</span>
            <button onClick={() => { setIsLoggedIn(false); setPassword(''); setLectureData(null); }} className="text-[10px] bg-red-950/40 border border-red-900/30 text-red-400 hover:bg-red-900 hover:text-white px-3 py-2 rounded-xl tracking-widest transition-all uppercase cursor-pointer">Disconnect</button>
          </div>
        </header>

        <div className="flex gap-8 px-2 font-header text-[14px] tracking-widest uppercase text-neutral-300">
          <label className="flex items-center space-x-2.5 cursor-pointer"><input type="radio" checked={inputType === 'youtube'} onChange={() => setInputType('youtube')} className="w-4 h-4 accent-white" /><span>YOUTUBE_SOURCE</span></label>
          <label className="flex items-center space-x-2.5 cursor-pointer"><input type="radio" checked={inputType === 'pdf'} onChange={() => setInputType('pdf')} className="w-4 h-4 accent-white" /><span>DOCUMENT_PDF</span></label>
        </div>

        <div className="bg-neutral-900/30 backdrop-blur-xl border border-white/10 p-8 rounded-2xl shadow-2xl space-y-4">
          <form onSubmit={handleAnalyze} className="space-y-4">
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block font-header text-[11px] tracking-widest uppercase text-neutral-400 mb-1.5">LECTURE_TITLE (OPTIONAL)</label>
                <input type="text" value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} placeholder="Label this analysis asset..." className="w-full bg-neutral-950/50 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono text-white focus:outline-none" />
              </div>
              <div>
                <label className="block font-header text-[11px] tracking-widest uppercase text-neutral-400 mb-1.5">DATA_PIPELINE</label>
                {inputType === 'youtube' ? (
                  <input type="url" required value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} placeholder="Paste link..." className="w-full bg-neutral-950/50 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono text-white focus:outline-none" />
                ) : (
                  <input type="file" required accept=".pdf" onChange={(e) => setSelectedFile(e.target.files[0])} className="w-full bg-neutral-950/50 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none" />
                )}
              </div>
            </div>
            <button type="submit" disabled={loading} className="w-full bg-white text-black font-header text-xs tracking-widest uppercase py-3.5 rounded-xl font-bold cursor-pointer">{loading ? 'RUNNING_TELEM_MATRICES...' : 'EXECUTE_INTELLIGENCE_ANALYZE.'}</button>
          </form>

          {loading && <div className="p-4 bg-white/5 border border-white/10 rounded-xl font-mono text-xs text-neutral-300 animate-pulse">SYSTEM_LOG // {loadingStage.toUpperCase()}</div>}
          {error && <div className="p-4 border border-red-500/30 text-xs font-mono text-red-400 bg-red-950/30 rounded-xl"><span className="font-header block text-red-500 tracking-widest mb-1">!! CORE_EXCEPTION_REPORTED !!</span>{error}</div>}
        </div>

        <div className="flex flex-wrap gap-2 font-header text-[13px] tracking-widest uppercase">
          {['SUMMARY', 'JARGON', 'FLASHCARDS', 'ARCHIVE_HISTORY'].map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab.toLowerCase())} className={`px-6 py-3 rounded-xl transition-all border font-bold cursor-pointer ${activeTab === tab.toLowerCase() ? 'bg-white text-black border-white shadow-xl' : 'bg-neutral-900/30 backdrop-blur-md text-neutral-400 border-white/5 hover:text-white'}`}>{tab}</button>
          ))}
        </div>

        <div className="transition-all duration-300">
          {activeTab === 'summary' && lectureData && (
            <div className="bg-neutral-900/30 backdrop-blur-xl border border-white/10 p-8 rounded-2xl space-y-6">
              <h3 className="font-header text-xs tracking-widest text-neutral-500 border-b border-white/5 pb-3">01 // CORE_SUMMARY_MATRIX</h3>
              {lectureData.summary?.map((item, idx) => (
                <div key={idx} className="pb-6 border-b border-white/5 last:border-none last:pb-0"><h4 className="font-bold text-2xl mb-2">{item.concept}</h4><p className="text-neutral-300 text-lg leading-relaxed">{item.explanation}</p></div>
              ))}
            </div>
          )}

          {activeTab === 'jargon' && lectureData && (
            <div className="space-y-4">
              <h3 className="font-header text-xs tracking-widest text-neutral-500 bg-neutral-900/30 border border-white/10 p-5 rounded-xl">02 // GLOSSARY_TERMS</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {lectureData.jargon?.map((item, idx) => (
                  <div key={idx} className="p-6 border border-white/10 bg-neutral-900/30 rounded-xl"><span className="font-header text-[14px] text-white block mb-2 underline decoration-dotted">{item.term}</span><p className="text-neutral-300 text-lg">{item.definition}</p></div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'flashcards' && lectureData && (
            <div className="space-y-4">
              <h3 className="font-header text-xs tracking-widest text-neutral-500 bg-neutral-900/30 border border-white/10 p-5 rounded-xl">03 // ACTIVE_RECALL_DECKS</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {lectureData.flashcards?.map((card, idx) => (
                  <div key={idx} onClick={() => toggleCardFlip(idx)} className="cursor-pointer border border-white/10 bg-neutral-900/30 p-6 min-h-[160px] rounded-xl flex flex-col justify-between hover:border-white/40 shadow-lg select-none">
                    {!flippedCards[idx] ? (
                      <><div><span className="font-header text-[10px] text-neutral-500 tracking-widest block mb-2">Q_{String(idx + 1).padStart(2, '0')}</span><p className="text-lg font-bold">{card.question}</p></div><span className="font-header text-[10px] text-neutral-500 mt-3 self-end">// DISPATCH_FLIP</span></>
                    ) : (
                      <><div><span className="font-header text-[10px] text-white tracking-widest block mb-2">VERIFIED_RESPONSE</span><p className="text-lg text-neutral-200">{card.answer}</p></div><span className="font-header text-[10px] text-neutral-400 mt-3 self-end">// RETURN_TO_DECK</span></>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'archive_history' && (
            <div className="bg-neutral-900/30 backdrop-blur-xl border border-white/10 p-8 rounded-2xl space-y-4 shadow-2xl">
              <h3 className="font-header text-xs tracking-widest text-neutral-500 border-b border-white/5 pb-3">04 // COMPILATION_ARCHIVES</h3>
              {historyDeck.length === 0 ? (
                <p className="text-sm font-mono text-neutral-500">// NO_RECORDED_TELEMETRY_FOUND_FOR_NODE</p>
              ) : (
                <div className="grid gap-3">
                  {historyDeck.map((item) => (
                    <div key={item.id} className="border border-white/5 bg-black/40 hover:bg-black/80 hover:border-white/20 p-5 rounded-xl flex justify-between items-center transition-all">
                      <div>
                        <h4 className="text-lg font-bold text-white tracking-wide">{item.title}</h4>
                        <span className="text-xs font-mono text-neutral-500">{item.timestamp}</span>
                      </div>
                      <button onClick={() => { setLectureData(item.analysis_data); setActiveTab('summary'); }} className="bg-white hover:bg-neutral-200 text-black font-header text-[10px] tracking-widest px-4 py-2 rounded-lg font-bold cursor-pointer uppercase">LOAD_ASSET</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
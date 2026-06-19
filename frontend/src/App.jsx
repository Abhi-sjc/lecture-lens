import React, { useState, useEffect } from "react";

// =========================================================================
// API ENDPOINT AUTO-DETECTION MATRIX (Vercel Production vs. Localhost)
// =========================================================================
const API_BASE =
  window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://127.0.0.1:8000"
    : "https://lecture-lens.onrender.com";

export default function App() {
  // Authentication states
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);

  // Core processing states
  const [sourceType, setSourceType] = useState("youtube"); // 'youtube' or 'pdf'
  const [title, setTitle] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [pdfFile, setPdfFile] = useState(null);
  
  // App execution state
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");

  // Analysis result states
  const [activeTab, setActiveTab] = useState("summary"); // 'summary', 'jargon', 'flashcards', 'history'
  const [summaryData, setSummaryData] = useState([]);
  const [jargonData, setJargonData] = useState([]);
  const [flashcardData, setFlashcardData] = useState([]);
  const [historyList, setHistoryList] = useState([]);

  // Active Flashcard interactive index state
  const [flippedCards, setFlippedCards] = useState({});

  // Fix browser tab title and check pre-existing session token on boot
  useEffect(() => {
    document.title = "LectureLens // Secure Intel Workspace";
    
    const savedToken = localStorage.getItem("lecturelens_token");
    const savedUser = localStorage.getItem("lecturelens_user");
    if (savedToken && savedUser) {
      setUsername(savedUser);
      setIsLoggedIn(true);
      fetchHistory(savedUser);
    }
  }, []);

  // Sync historical archives directly from the cloud backend
  const fetchHistory = async (userToFetch) => {
    const targetUser = userToFetch || username;
    if (!targetUser) return;
    try {
      const response = await fetch(`${API_BASE}/api/history/${targetUser.trim().lower()}`);
      if (response.ok) {
        const data = await response.json();
        setHistoryList(data);
      }
    } catch (err) {
      console.error("Telemetry fetch error:", err);
    }
  };

  // Restores a previously analyzed lecture from your permanent SQL cloud archive
  const handleRestoreArchive = (item) => {
    setTitle(item.title);
    setSummaryData(item.analysis_data.summary || []);
    setJargonData(item.analysis_data.jargon || []);
    setFlashcardData(item.analysis_data.flashcards || []);
    setFlippedCards({});
    setActiveTab("summary");
    
    // Smooth scroll down to output results view on restoration click
    setTimeout(() => {
      document.getElementById("output-terminal")?.scrollIntoView({ behavior: "smooth" });
    }, 150);
  };

  // Handles security authentication handshakes (Login / Register)
  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError("");
    const cleanUsername = username.trim().lower();

    if (!cleanUsername || !password) {
      setAuthError("Please fill in all security credential nodes.");
      return;
    }

    const endpoint = isRegistering ? "/api/register" : "/api/login";
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: cleanUsername, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Authentication handshake rejected.");
      }

      if (isRegistering) {
        // Automatically pivot to login state upon successful account provisioning
        setIsRegistering(false);
        setAuthError("ACCOUNT_PROVISIONED // Proceeding to Login.");
      } else {
        localStorage.setItem("lecturelens_token", data.token);
        localStorage.setItem("lecturelens_user", cleanUsername);
        setIsLoggedIn(true);
        fetchHistory(cleanUsername);
      }
    } catch (err) {
      setAuthError(err.message);
    }
  };

  const handleDisconnect = () => {
    localStorage.removeItem("lecturelens_token");
    localStorage.removeItem("lecturelens_user");
    setUsername("");
    setPassword("");
    setIsLoggedIn(false);
    setSummaryData([]);
    setJargonData([]);
    setFlashcardData([]);
    setHistoryList([]);
  };

  // Enforces data extraction and triggers Gemini LLM generation analysis
  const handleAnalyze = async () => {
    setError("");
    setStatusMessage("");

    // Enforce robust validation rules
    if (sourceType === "youtube" && !youtubeUrl.trim()) {
      setError("VALIDATION EXCEPTION: YouTube Media Link node is empty.");
      return;
    }
    if (sourceType === "pdf" && !pdfFile) {
      setError("VALIDATION EXCEPTION: No binary PDF document loaded.");
      return;
    }

    setLoading(true);
    let extractedText = "";
    const activeTitle = title.trim() || `Lecture Asset - ${new Date().toLocaleDateString()}`;

    try {
      // Step 1: Raw Media Text Extraction Pipeline
      if (sourceType === "youtube") {
        setStatusMessage("INGESTION_STAGE_ACTIVE // Fetching YouTube subtitles...");
        const res = await fetch(`${API_BASE}/api/extract/youtube`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: youtubeUrl }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "Subtitles retrieval failed.");
        extractedText = data.transcript;
      } else {
        setStatusMessage("INGESTION_STAGE_ACTIVE // Parsing PDF binary structures...");
        const formData = new FormData();
        formData.append("file", pdfFile);
        const res = await fetch(`${API_BASE}/api/extract/pdf`, {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || "PDF extraction parsed with errors.");
        extractedText = data.text;
      }

      // Step 2: High Performance AI Analysis Pipeline
      setStatusMessage("INTELLIGENCE_STAGE_ACTIVE // Gemini structured modeling in progress...");
      const resAnalysis = await fetch(`${API_BASE}/api/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: extractedText,
          username: username.trim().lower(),
          title: activeTitle,
        }),
      });

      const analysisData = await resAnalysis.json();
      if (!resAnalysis.ok) throw new Error(analysisData.detail || "Synthesizer compilation failed.");

      // Bind results to states for rendering
      setSummaryData(analysisData.summary || []);
      setJargonData(analysisData.jargon || []);
      setFlashcardData(analysisData.flashcards || []);
      setFlippedCards({});
      setActiveTab("summary");
      
      // Pull history again so our new database item shows up in the list immediately!
      fetchHistory(username);
      setStatusMessage("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleCard = (index) => {
    setFlippedCards((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  // =========================================================================
  // VIEW RENDER MATRIX 1: AUTHENTICATION CONTAINER (LOGIN / SIGN UP)
  // =========================================================================
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-neutral-950 font-mono text-neutral-200 relative flex items-center justify-center p-4 overflow-hidden">
        {/* Absolute Underlay Graphics */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(40,40,40,0.15),transparent_70%)] pointer-events-none" />
        
        {/* Dynamic Dark Backdrop Overlay to aggressively dim the background waveform */}
        <div className="absolute inset-0 bg-black/75 backdrop-blur-[3px] pointer-events-none" />

        <div className="relative w-full max-w-md backdrop-blur-2xl bg-neutral-900/60 border border-white/5 rounded-2xl p-8 shadow-2xl transition-all duration-300">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-10 bg-neutral-950 border border-white/10 rounded-lg flex items-center justify-center shadow-inner mb-4">
              <span className="text-white text-xs tracking-widest font-black">L L</span>
            </div>
            <h1 className="text-xl tracking-[0.3em] font-black uppercase text-white">LECTURELENS</h1>
            <p className="text-[10px] text-neutral-500 tracking-widest mt-1">AUTH_REQUIRED_FOR_NODE_ACCESS</p>
          </div>

          <form onSubmit={handleAuth} className="space-y-6">
            <div>
              <label className="block text-[10px] tracking-widest text-neutral-400 mb-2 uppercase font-semibold">USER_NODE_ID</label>
              <input
                type="text"
                placeholder="Username..."
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-neutral-950/80 border border-white/10 rounded-lg py-3 px-4 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-white/30 transition-all font-mono"
              />
            </div>

            <div>
              <label className="block text-[10px] tracking-widest text-neutral-400 mb-2 uppercase font-semibold">ACCESS_KEYPASS</label>
              <input
                type="password"
                placeholder="Password..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-neutral-950/80 border border-white/10 rounded-lg py-3 px-4 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-white/30 transition-all font-mono"
              />
            </div>

            {authError && (
              <div className="bg-red-950/30 border border-red-900/50 text-red-400 text-xs py-2.5 px-3 rounded-lg text-center tracking-wide">
                {authError}
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-white text-black font-semibold text-xs tracking-widest uppercase py-4 rounded-lg hover:bg-neutral-200 transition-all active:scale-[0.98]"
            >
              {isRegistering ? "PROVISION_ACCOUNT_NODE." : "INITIALIZE_SESSION."}
            </button>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsRegistering(!isRegistering);
                  setAuthError("");
                }}
                className="text-[10px] tracking-wider text-neutral-500 hover:text-white uppercase transition-all"
              >
                {isRegistering ? "// USE EXISTING NODE KEYPASS" : "// PROVISION NEW ACCOUNT NODE"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW RENDER MATRIX 2: MAIN INTEGRATED SERVICE WORKSPACE
  // =========================================================================
  return (
    <div className="min-h-screen bg-neutral-950 font-mono text-neutral-200 relative pb-20">
      {/* Decorative underlay grid */}
      <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.015)_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none" />

      {/* Radial Dark Vignette to dim the wallpaper graphics and ensure incredible text legibility */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/85 via-black/75 to-neutral-950 pointer-events-none" />

      <div className="max-w-4xl mx-auto px-4 pt-8 relative">
        
        {/* ================= HEADER CONTROL CONSOLE ================= */}
        <header className="backdrop-blur-xl bg-neutral-900/45 border border-white/5 rounded-2xl p-6 mb-8 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-neutral-950 border border-white/10 rounded-xl flex items-center justify-center">
              <span className="text-white text-xs tracking-widest font-black">LL</span>
            </div>
            <div>
              <h1 className="text-base tracking-[0.2em] font-black uppercase text-white">LECTURELENS</h1>
              <p className="text-[9px] text-neutral-400 tracking-widest mt-0.5">
                ACTIVE_USER // <span className="text-white font-bold uppercase">{username}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[10px] text-neutral-500 border border-white/5 bg-neutral-950/60 px-3 py-1.5 rounded-md font-bold tracking-widest">
              V1.3.5 [SECURE]
            </span>
            <button
              onClick={handleDisconnect}
              className="border border-red-900/30 text-red-500 hover:bg-red-950/20 px-4 py-1.5 text-xs tracking-widest rounded-md uppercase transition-all duration-200"
            >
              DISCONNECT
            </button>
          </div>
        </header>

        {/* ================= WORKSPACE CONFIGURATION CONTAINER ================= */}
        <main className="space-y-6">
          {/* Frosted Container for Ingestion Config */}
          <section className="backdrop-blur-xl bg-neutral-900/40 border border-white/5 rounded-2xl p-6 shadow-2xl space-y-6">
            
            {/* Source Tab Toggle Switch */}
            <div className="flex gap-4 border-b border-white/5 pb-4">
              <button
                onClick={() => setSourceType("youtube")}
                className={`flex items-center gap-2 pb-2 text-xs font-bold tracking-widest uppercase transition-all ${
                  sourceType === "youtube" ? "text-white border-b border-white" : "text-neutral-500 hover:text-neutral-300"
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-red-500" />
                YOUTUBE_SOURCE
              </button>
              <button
                onClick={() => setSourceType("pdf")}
                className={`flex items-center gap-2 pb-2 text-xs font-bold tracking-widest uppercase transition-all ${
                  sourceType === "pdf" ? "text-white border-b border-white" : "text-neutral-500 hover:text-neutral-300"
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                DOCUMENT_PDF
              </button>
            </div>

            {/* Label / Custom Session Title Metadata Node */}
            <div>
              <label className="block text-[9px] tracking-widest text-neutral-400 mb-2 uppercase font-semibold">
                LECTURE_TITLE (OPTIONAL)
              </label>
              <input
                type="text"
                placeholder="Label this analysis asset..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-neutral-950/60 border border-white/5 rounded-xl py-3 px-4 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-white/25 transition-all"
              />
            </div>

            {/* Dynamic Content Blocks inside highly stylized nested frosted compartments */}
            {sourceType === "youtube" ? (
              <div className="backdrop-blur-2xl bg-neutral-950/50 border border-white/5 rounded-xl p-5 shadow-inner transition-all duration-300">
                <label className="block text-[9px] tracking-widest text-neutral-400 mb-2 uppercase font-semibold">
                  YOUTUBE VIDEO PIPELINE LINK
                </label>
                <input
                  type="text"
                  placeholder="Paste video url link here..."
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  className="w-full bg-neutral-950/80 border border-white/10 rounded-lg py-3.5 px-4 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-white/30 transition-all"
                />
                <p className="text-[9px] text-neutral-500 tracking-wider mt-2">
                  * Live extraction uses secure browser session keypass bypass matrices.
                </p>
              </div>
            ) : (
              <div className="backdrop-blur-2xl bg-neutral-950/50 border border-white/5 rounded-xl p-5 shadow-inner transition-all duration-300">
                <label className="block text-[9px] tracking-widest text-neutral-400 mb-2 uppercase font-semibold">
                  PDF STRUCTURE BINARY LOADER
                </label>
                <div className="border border-dashed border-white/10 hover:border-white/20 bg-neutral-950/60 rounded-lg p-6 flex flex-col items-center justify-center text-center transition-all relative">
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => setPdfFile(e.target.files[0])}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="w-10 h-10 bg-neutral-900 border border-white/10 rounded-lg flex items-center justify-center mb-3">
                    <span className="text-white text-xs">PDF</span>
                  </div>
                  {pdfFile ? (
                    <span className="text-xs text-green-400 font-bold truncate max-w-xs uppercase">
                      {pdfFile.name}
                    </span>
                  ) : (
                    <span className="text-xs text-neutral-400">
                      DRAG & DROP OR TAP TO BROWSE FILES
                    </span>
                  )}
                  <span className="text-[9px] text-neutral-600 tracking-widest mt-1">
                    MAXIMUM BUFFER VALUE: 20MB
                  </span>
                </div>
              </div>
            )}

            {/* Telemetry processing indicators */}
            {loading && (
              <div className="bg-neutral-950 border border-white/5 rounded-xl p-4 flex items-center gap-4">
                <div className="w-4 h-4 border-2 border-white/35 border-t-white rounded-full animate-spin" />
                <span className="text-[10px] tracking-widest text-neutral-400 uppercase font-semibold animate-pulse">
                  {statusMessage}
                </span>
              </div>
            )}

            {error && (
              <div className="bg-red-950/30 border border-red-900/30 text-red-400 text-xs py-3.5 px-4 rounded-xl text-center tracking-wide leading-relaxed font-semibold">
                {error}
              </div>
            )}

            {/* Run Action Trigger Button */}
            <button
              onClick={handleAnalyze}
              disabled={loading}
              className={`w-full font-bold text-xs tracking-widest uppercase py-4 rounded-xl transition-all shadow-lg active:scale-[0.98] ${
                loading
                  ? "bg-neutral-800 text-neutral-600 cursor-not-allowed"
                  : "bg-white text-black hover:bg-neutral-200"
              }`}
            >
              EXECUTE_INTELLIGENCE_ANALYZE.
            </button>
          </section>

          {/* ================= OUTPUT PRESENTATION CONSOLE ================= */}
          <section id="output-terminal" className="backdrop-blur-xl bg-neutral-900/40 border border-white/5 rounded-2xl p-6 shadow-2xl space-y-6">
            
            {/* Visual Outputs Switcher Menu Grid */}
            <div className="grid grid-cols-4 gap-2 border-b border-white/5 pb-4">
              {[
                { id: "summary", label: "SUMMARY" },
                { id: "jargon", label: "JARGON" },
                { id: "flashcards", label: "FLASHCARDS" },
                { id: "history", label: "ARCHIVE_HISTORY" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-2 text-[10px] font-bold tracking-widest uppercase transition-all text-center rounded-lg ${
                    activeTab === tab.id
                      ? "bg-white text-black font-extrabold"
                      : "text-neutral-400 hover:text-white hover:bg-neutral-950/40"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Output Containers */}
            <div className="min-h-[250px]">
              
              {/* Tab: Summary */}
              {activeTab === "summary" && (
                <div className="space-y-4">
                  {summaryData.length > 0 ? (
                    summaryData.map((item, idx) => (
                      <div key={idx} className="bg-neutral-950/60 border border-white/5 rounded-xl p-5 shadow-sm">
                        <h4 className="text-sm font-bold text-white tracking-wide mb-2 uppercase">
                          // {item.concept}
                        </h4>
                        <p className="text-xs text-neutral-400 leading-relaxed font-sans">
                          {item.explanation}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-16 text-neutral-600 text-xs tracking-widest uppercase font-bold">
                      // NO_SUMMARY_TELEMETRY_FOUND_FOR_NODE
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Jargon Translator */}
              {activeTab === "jargon" && (
                <div className="space-y-4">
                  {jargonData.length > 0 ? (
                    jargonData.map((item, idx) => (
                      <div key={idx} className="bg-neutral-950/60 border border-white/5 rounded-xl p-5 shadow-sm flex flex-col md:flex-row md:items-start gap-4">
                        <div className="md:w-1/3">
                          <span className="text-xs font-bold text-white tracking-wider uppercase border-l-2 border-white pl-2">
                            {item.term}
                          </span>
                        </div>
                        <div className="md:w-2/3">
                          <p className="text-xs text-neutral-400 leading-relaxed font-sans">
                            {item.definition}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-16 text-neutral-600 text-xs tracking-widest uppercase font-bold">
                      // NO_JARGON_TELEMETRY_FOUND_FOR_NODE
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Interactive Study Flashcards */}
              {activeTab === "flashcards" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {flashcardData.length > 0 ? (
                    flashcardData.map((item, idx) => (
                      <div
                        key={idx}
                        onClick={() => toggleCard(idx)}
                        className="cursor-pointer min-h-[160px] relative transition-transform duration-500 transform-style-3d group"
                      >
                        <div
                          className={`absolute inset-0 bg-neutral-950/60 border border-white/5 rounded-xl p-5 flex flex-col justify-between transition-all duration-500 backface-hidden ${
                            flippedCards[idx] ? "opacity-0 pointer-events-none scale-95" : "opacity-100 scale-100"
                          }`}
                        >
                          <div className="text-[9px] tracking-widest text-neutral-500 font-bold uppercase">
                            QUESTION_NODE // {idx + 1}
                          </div>
                          <p className="text-xs font-bold text-white tracking-wide text-center py-4 leading-relaxed">
                            {item.question}
                          </p>
                          <div className="text-[9px] tracking-wider text-center text-neutral-500 uppercase font-semibold">
                            TAP TO REVEAL KEYPASS ANSWER
                          </div>
                        </div>

                        <div
                          className={`absolute inset-0 bg-white border border-white rounded-xl p-5 flex flex-col justify-between transition-all duration-500 backface-hidden ${
                            flippedCards[idx] ? "opacity-100 scale-100" : "opacity-0 pointer-events-none scale-95"
                          }`}
                        >
                          <div className="text-[9px] tracking-widest text-neutral-700 font-bold uppercase">
                            VERIFIED_ANSWER // {idx + 1}
                          </div>
                          <p className="text-xs font-bold text-neutral-950 text-center py-4 leading-relaxed font-sans">
                            {item.answer}
                          </p>
                          <div className="text-[9px] tracking-wider text-center text-neutral-600 uppercase font-semibold">
                            TAP TO FLIP BACK TO QUESTION
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="col-span-2 text-center py-16 text-neutral-600 text-xs tracking-widest uppercase font-bold">
                      // NO_FLASHCARD_TELEMETRY_FOUND_FOR_NODE
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Real-Time Persistent SQL History Archives */}
              {activeTab === "history" && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center border-b border-white/5 pb-2 mb-4">
                    <span className="text-[10px] text-neutral-400 tracking-widest font-bold uppercase">
                      SECURE DB ARCHIVE ENTRIES
                    </span>
                    <button
                      onClick={() => fetchHistory()}
                      className="text-[9px] text-neutral-500 hover:text-white tracking-widest uppercase transition-all"
                    >
                      // REFRESH_LOGS
                    </button>
                  </div>
                  {historyList.length > 0 ? (
                    historyList.map((item, idx) => (
                      <div
                        key={idx}
                        className="bg-neutral-950/60 border border-white/5 hover:border-white/15 rounded-xl p-5 flex items-center justify-between gap-4 transition-all"
                      >
                        <div className="truncate max-w-lg">
                          <h4 className="text-xs font-extrabold text-white tracking-wide truncate uppercase">
                            {item.title}
                          </h4>
                          <span className="text-[9px] text-neutral-500 tracking-wider">
                            TIMESTAMP: {item.timestamp}
                          </span>
                        </div>
                        <button
                          onClick={() => handleRestoreArchive(item)}
                          className="bg-white text-black font-extrabold text-[9px] tracking-widest uppercase py-2 px-4 rounded-lg hover:bg-neutral-200 transition-all"
                        >
                          RESTORE_WORKSPACE
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-16 text-neutral-600 text-xs tracking-widest uppercase font-bold">
                      // NO_RECORDED_TELEMETRY_FOUND_FOR_NODE
                    </div>
                  )}
                </div>
              )}

            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
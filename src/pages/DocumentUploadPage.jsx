import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMedExtractStore } from '../store/resultText';

const backUrl = import.meta.env.VITE_BACKEND_URL;
const API_CONFIG = {
  GPU_URL: 'https://8i1g7j94qekjwr-7000.proxy.runpod.net',
  CPU_URL: 'http://103.142.175.170:8001',
  CODING_API_URL: `${backUrl}`
};

const MedExtract = () => {
  const navigate = useNavigate();

  const [hpActiveTab, setHpActiveTab] = useState('upload');
  const [opActiveTab, setOpActiveTab] = useState('upload');
  const [hpFile, setHpFile] = useState(null);
  const [opFile, setOpFile] = useState(null);
  const [hpPreview, setHpPreview] = useState(null);
  const [opPreview, setOpPreview] = useState(null);
  const [hpText, setHpText] = useState('');
  const [opText, setOpText] = useState('');
  const [engine, setEngine] = useState('tesseract');
  const [gpuEnabled, setGpuEnabled] = useState(true);
  const [isDraggingHp, setIsDraggingHp] = useState(false);
  const [isDraggingOp, setIsDraggingOp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isComputing, setIsComputing] = useState(false);
  const [error, setError] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('checking');
  const [useTestEndpoint, setUseTestEndpoint] = useState(true);
  const [uploadDocuments, setUploadDocuments] = useState(true); // Toggle for S3 document upload

  const hpFileInputRef = useRef(null);
  const opFileInputRef = useRef(null);
  const hpImageInputRef = useRef(null);
  const opImageInputRef = useRef(null);

  const { setHpResult, setOpResult, setExtractionResults, clearAll } = useMedExtractStore();

  const getApiBaseUrl = () => gpuEnabled ? API_CONFIG.GPU_URL : API_CONFIG.CPU_URL;

  // Helper to convert file to base64
  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(',')[1]; // Remove data:xxx;base64, prefix
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Helper to get file type
  const getFileType = (file) => {
    if (!file) return 'text';
    if (file.type === 'application/pdf') return 'pdf';
    if (file.type.startsWith('image/')) return 'image';
    return 'text';
  };

  const getHpDataInfo = useMemo(() => {
    if (hpActiveTab === 'paste' && hpText.trim()) return { hasData: true, isText: true, text: hpText.trim() };
    if ((hpActiveTab === 'upload' || hpActiveTab === 'image') && hpFile) return { hasData: true, isText: false, file: hpFile };
    return { hasData: false, isText: false };
  }, [hpActiveTab, hpText, hpFile]);

  const getOpDataInfo = useMemo(() => {
    if (opActiveTab === 'paste' && opText.trim()) return { hasData: true, isText: true, text: opText.trim() };
    if ((opActiveTab === 'upload' || opActiveTab === 'image') && opFile) return { hasData: true, isText: false, file: opFile };
    return { hasData: false, isText: false };
  }, [opActiveTab, opText, opFile]);

  const canSkipOcr = useMemo(() => {
    const hpInfo = getHpDataInfo;
    const opInfo = getOpDataInfo;
    if (!hpInfo.hasData && !opInfo.hasData) return false;
    if (hpInfo.hasData && !hpInfo.isText) return false;
    if (opInfo.hasData && !opInfo.isText) return false;
    return true;
  }, [getHpDataInfo, getOpDataInfo]);

  const hasAnyData = useMemo(() => getHpDataInfo.hasData || getOpDataInfo.hasData, [getHpDataInfo, getOpDataInfo]);
  const needsOcr = useMemo(() => (getHpDataInfo.hasData && !getHpDataInfo.isText) || (getOpDataInfo.hasData && !getOpDataInfo.isText), [getHpDataInfo, getOpDataInfo]);

  const checkConnection = async () => {
    setConnectionStatus('checking');
    try {
      const res = await fetch(`${getApiBaseUrl()}/health`, { method: 'GET', mode: 'cors' });
      setConnectionStatus(res.ok ? 'online' : 'offline');
    } catch { setConnectionStatus('offline'); }
  };

  useEffect(() => { checkConnection(); }, [gpuEnabled]);

  const handleFileSelect = (file, type) => {
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (type === 'hp') { setHpFile(file); setHpPreview(e.target.result); }
        else { setOpFile(file); setOpPreview(e.target.result); }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDrop = (e, type) => {
    e.preventDefault();
    type === 'hp' ? setIsDraggingHp(false) : setIsDraggingOp(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.type === 'application/pdf' || file.type.startsWith('image/'))) handleFileSelect(file, type);
  };

  const handleDragOver = (e, type) => { e.preventDefault(); type === 'hp' ? setIsDraggingHp(true) : setIsDraggingOp(true); };
  const handleDragLeave = (e, type) => { e.preventDefault(); type === 'hp' ? setIsDraggingHp(false) : setIsDraggingOp(false); };

  const clearFile = (type) => {
    if (type === 'hp') { setHpFile(null); setHpPreview(null); setHpText(''); }
    else { setOpFile(null); setOpPreview(null); setOpText(''); }
  };

  const processFileOcr = async (type) => {
    const baseUrl = getApiBaseUrl();
    const file = type === 'hp' ? hpFile : opFile;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('engine', engine);
    formData.append('report_type', type);
    formData.append('use_gpu', gpuEnabled.toString());
    const res = await fetch(`${baseUrl}/ocr/file`, { method: 'POST', body: formData });
    return res.json();
  };

  const combineText = (docs) => {
    if (!docs || docs.length === 0) return '';
    if (docs.length === 1) return docs[0].full_text || '';
    return docs.map((d, i) => `━━━ Page ${i + 1} ━━━\n${d.full_text}`).join('\n\n');
  };

  const handleExtractText = async () => {
    if (!needsOcr) return;
    setIsLoading(true);
    setError(null);

    try {
      const hpInfo = getHpDataInfo;
      const opInfo = getOpDataInfo;
      let extractedHpText = hpInfo.isText ? hpInfo.text : '';
      let extractedOpText = opInfo.isText ? opInfo.text : '';

      if (hpInfo.hasData && !hpInfo.isText) {
        const hpResult = await processFileOcr('hp');
        if (hpResult && !hpResult.success) throw new Error(hpResult.error || 'HP OCR failed');
        if (hpResult?.documents?.length) {
          extractedHpText = combineText(hpResult.documents);
          setHpResult({ fullText: extractedHpText, totalPages: hpResult.documents.reduce((s, d) => s + (d.total_pages || 1), 0), wordCount: extractedHpText.split(/\s+/).filter(Boolean).length, processingTime: hpResult.total_processing_time || 0, engine: hpResult.documents[0]?.engine_used || engine });
        }
      } else if (hpInfo.isText) {
        setHpResult({ fullText: hpInfo.text, totalPages: 1, wordCount: hpInfo.text.split(/\s+/).filter(Boolean).length, processingTime: 0, engine: 'direct-text' });
      }

      if (opInfo.hasData && !opInfo.isText) {
        const opResult = await processFileOcr('op');
        if (opResult && !opResult.success) throw new Error(opResult.error || 'OP OCR failed');
        if (opResult?.documents?.length) {
          extractedOpText = combineText(opResult.documents);
          setOpResult({ fullText: extractedOpText, totalPages: opResult.documents.reduce((s, d) => s + (d.total_pages || 1), 0), wordCount: extractedOpText.split(/\s+/).filter(Boolean).length, processingTime: opResult.total_processing_time || 0, engine: opResult.documents[0]?.engine_used || engine });
        }
      } else if (opInfo.isText) {
        setOpResult({ fullText: opInfo.text, totalPages: 1, wordCount: opInfo.text.split(/\s+/).filter(Boolean).length, processingTime: 0, engine: 'direct-text' });
      }

      await extractIcdCodes(extractedHpText, extractedOpText);
    } catch (err) {
      console.error('Extraction error:', err);
      setError(err.message || 'Failed to extract text.');
      setIsLoading(false);
    }
  };

  const handleDirectExtract = async () => {
    const hpInfo = getHpDataInfo;
    const opInfo = getOpDataInfo;

    if (hpInfo.isText) setHpResult({ fullText: hpInfo.text, totalPages: 1, wordCount: hpInfo.text.split(/\s+/).filter(Boolean).length, processingTime: 0, engine: 'direct-text' });
    if (opInfo.isText) setOpResult({ fullText: opInfo.text, totalPages: 1, wordCount: opInfo.text.split(/\s+/).filter(Boolean).length, processingTime: 0, engine: 'direct-text' });

    await extractIcdCodes(hpInfo.text || '', opInfo.text || '');
  };

  const extractIcdCodes = async (hpFullText, opFullText) => {
    if (!hpFullText && !opFullText) {
      setError('No text available for ICD extraction.');
      setIsLoading(false);
      return;
    }

    setIsComputing(true);
    setIsLoading(false);
    setError(null);

    try {
      const endpoint = useTestEndpoint ? '/extract-codes-test' : '/extract-codes';

      // Prepare request body with raw files if available
      const requestBody = {
        hp_text: hpFullText,
        op_text: opFullText,
        upload_documents: uploadDocuments
      };

      // Add HP raw file if available
      if (hpFile && uploadDocuments) {
        requestBody.hp_raw = await fileToBase64(hpFile);
        requestBody.hp_type = getFileType(hpFile);
        requestBody.hp_filename = hpFile.name;
      } else if (hpFullText && uploadDocuments) {
        requestBody.hp_raw = hpFullText;
        requestBody.hp_type = 'text';
        requestBody.hp_filename = 'hp_text.txt';
      }

      // Add OP raw file if available
      if (opFile && uploadDocuments) {
        requestBody.op_raw = await fileToBase64(opFile);
        requestBody.op_type = getFileType(opFile);
        requestBody.op_filename = opFile.name;
      } else if (opFullText && uploadDocuments) {
        requestBody.op_raw = opFullText;
        requestBody.op_type = 'text';
        requestBody.op_filename = 'op_text.txt';
      }

      const response = await fetch(`${API_CONFIG.CODING_API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();

      if (data.success) {
        setExtractionResults(data);
        navigate('/results');
      } else {
        throw new Error(data.error || 'ICD code extraction failed');
      }
    } catch (err) {
      console.error('ICD extraction error:', err);
      setError(err.message || 'Failed to extract ICD codes.');
      setIsComputing(false);
    }
  };

  const handleMainAction = () => {
    if (canSkipOcr) handleDirectExtract();
    else handleExtractText();
  };

  const handleNew = () => { setHpFile(null); setOpFile(null); setHpPreview(null); setOpPreview(null); setHpText(''); setOpText(''); setError(null); clearAll(); };

  const TabButton = ({ active, onClick, icon, label }) => (
    <button onClick={onClick} className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg transition-all duration-200 flex-1 ${active ? 'bg-zinc-700/80 text-white' : 'text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800/50'}`}>
      {icon}<span className="text-sm font-medium">{label}</span>
    </button>
  );

  const UploadCard = ({ title, subtitle, badge, badgeColor, activeTab, setActiveTab, file, preview, text, setText, onFileSelect, onClear, fileInputRef, imageInputRef, isDragging, onDrop, onDragOver, onDragLeave, type }) => (
    <div className="bg-zinc-900/50 rounded-2xl p-6 border border-zinc-800/50">
      <div className="flex items-center gap-4 mb-5">
        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${badgeColor} flex items-center justify-center`}>
          <span className="text-white font-bold text-lg">{badge}</span>
        </div>
        <div>
          <h2 className="text-white font-semibold text-lg">{title}</h2>
          <p className="text-zinc-500 text-sm">{subtitle}</p>
        </div>
        {activeTab === 'paste' && text.trim() && <span className="ml-auto px-2 py-1 bg-emerald-500/20 text-emerald-400 text-xs rounded-full">Text Ready</span>}
        {(activeTab === 'upload' || activeTab === 'image') && file && <span className="ml-auto px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded-full">File Ready</span>}
      </div>

      <div className="flex bg-zinc-800/30 rounded-xl p-1.5 mb-4">
        <TabButton active={activeTab === 'upload'} onClick={() => setActiveTab('upload')} icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>} label="Upload" />
        <TabButton active={activeTab === 'paste'} onClick={() => setActiveTab('paste')} icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>} label="Text" />
        <TabButton active={activeTab === 'image'} onClick={() => setActiveTab('image')} icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>} label="Image" />
      </div>

      {activeTab === 'upload' && (
        preview ? (
          <div className="relative border-2 border-dashed border-zinc-700 rounded-xl p-4 bg-zinc-800/20">
            <button onClick={onClear} className="absolute top-2 right-2 p-1.5 bg-red-500/80 hover:bg-red-500 rounded-full transition-colors z-10">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            {file?.type === 'application/pdf' ? (
              <div className="flex items-center justify-center py-8"><div className="text-center"><svg className="w-16 h-16 text-red-500 mx-auto mb-2" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 2l5 5h-5V4z" /></svg><p className="text-zinc-300 font-medium">{file.name}</p></div></div>
            ) : <img src={preview} alt="Preview" className="max-h-48 mx-auto rounded-lg object-contain" />}
          </div>
        ) : (
          <div className={`border-2 border-dashed rounded-xl p-8 transition-all duration-200 cursor-pointer ${isDragging ? 'border-purple-500 bg-purple-500/10' : 'border-zinc-700 hover:border-zinc-600 bg-zinc-800/20 hover:bg-zinc-800/40'}`} onDrop={(e) => onDrop(e, type)} onDragOver={(e) => onDragOver(e, type)} onDragLeave={(e) => onDragLeave(e, type)} onClick={() => fileInputRef.current?.click()}>
            <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => onFileSelect(e.target.files[0], type)} className="hidden" />
            <div className="flex flex-col items-center justify-center py-4">
              <div className="w-14 h-14 rounded-full bg-zinc-700/50 flex items-center justify-center mb-4"><svg className="w-6 h-6 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg></div>
              <p className="text-white font-medium mb-1">Drop your file here</p>
              <p className="text-zinc-500 text-sm mb-4">or click to browse</p>
              <span className="px-3 py-1.5 bg-zinc-700/50 rounded-lg text-zinc-400 text-xs font-medium">PDF, JPG, PNG</span>
            </div>
          </div>
        )
      )}

      {activeTab === 'paste' && (
        <div className="border-2 border-dashed border-zinc-700 rounded-xl bg-zinc-800/20">
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste or type your medical report text here..." className="w-full h-48 p-4 bg-transparent text-zinc-300 text-sm font-mono resize-none focus:outline-none placeholder-zinc-600" />
          {text && <div className="flex items-center justify-between px-4 py-2 border-t border-zinc-700/50"><span className="text-zinc-500 text-xs">{text.trim().split(/\s+/).filter(w => w).length} words</span><button onClick={() => setText('')} className="text-zinc-500 hover:text-zinc-300 text-xs">Clear</button></div>}
        </div>
      )}

      {activeTab === 'image' && (
        preview ? (
          <div className="relative border-2 border-dashed border-zinc-700 rounded-xl p-4 bg-zinc-800/20">
            <button onClick={onClear} className="absolute top-2 right-2 p-1.5 bg-red-500/80 hover:bg-red-500 rounded-full transition-colors z-10"><svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            <img src={preview} alt="Preview" className="max-h-48 mx-auto rounded-lg object-contain" />
          </div>
        ) : (
          <div className="border-2 border-dashed border-zinc-700 hover:border-zinc-600 rounded-xl p-8 bg-zinc-800/20 hover:bg-zinc-800/40 transition-all duration-200 cursor-pointer" onClick={() => imageInputRef.current?.click()}>
            <input ref={imageInputRef} type="file" accept="image/*" onChange={(e) => onFileSelect(e.target.files[0], type)} className="hidden" />
            <div className="flex flex-col items-center justify-center py-4">
              <div className="w-14 h-14 rounded-full bg-zinc-700/50 flex items-center justify-center mb-4"><svg className="w-6 h-6 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg></div>
              <p className="text-white font-medium mb-1">Upload an image</p>
              <span className="px-3 py-1.5 bg-zinc-700/50 rounded-lg text-zinc-400 text-xs font-medium">JPG, PNG, GIF, WEBP</span>
            </div>
          </div>
        )
      )}
    </div>
  );

  if (isComputing) {
    return (
      <div className="fixed inset-0 bg-zinc-950 flex flex-col items-center justify-center z-50">
        <div className="relative">
          <div className="w-32 h-32 rounded-full border-4 border-zinc-800 absolute"></div>
          <div className="w-32 h-32 rounded-full border-4 border-transparent border-t-purple-500 border-r-purple-500 animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center"><div className="w-16 h-16 rounded-full bg-purple-500/20 animate-pulse"></div></div>
        </div>
        <div className="mt-8 text-center"><h2 className="text-2xl font-bold text-white mb-2">Computing</h2><p className="text-zinc-400">Analyzing medical reports and extracting codes...</p></div>
        <div className="mt-6 flex gap-1">
          <div className="w-2 h-2 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: '0ms' }}></div>
          <div className="w-2 h-2 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: '150ms' }}></div>
          <div className="w-2 h-2 rounded-full bg-purple-500 animate-bounce" style={{ animationDelay: '300ms' }}></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center shadow-lg shadow-purple-500/20">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
            </div>
            <div><h1 className="text-2xl font-bold text-white">MedExtract</h1><p className="text-zinc-500 text-sm">Medical Report OCR & Coding</p></div>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/analytics')} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
              Analytics
            </button>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-zinc-400 text-sm">Test Mode</span>
              <button onClick={() => setUseTestEndpoint(!useTestEndpoint)} className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${useTestEndpoint ? 'bg-amber-500' : 'bg-zinc-700'}`}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${useTestEndpoint ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-zinc-400 text-sm">S3 Docs</span>
              <button onClick={() => setUploadDocuments(!uploadDocuments)} className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${uploadDocuments ? 'bg-cyan-500' : 'bg-zinc-700'}`}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${uploadDocuments ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </label>
            <div className={`flex items-center gap-2 rounded-full px-3 py-2 border ${connectionStatus === 'online' ? 'bg-zinc-900/50 border-zinc-800' : 'bg-red-900/20 border-red-800/50'}`}>
              <div className={`w-2 h-2 rounded-full ${connectionStatus === 'online' ? 'bg-green-500 animate-pulse' : connectionStatus === 'checking' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'}`} />
              <span className={`text-xs font-medium px-2 py-0.5 rounded ${gpuEnabled ? 'bg-purple-700 text-white' : 'bg-zinc-700 text-zinc-300'}`}>{gpuEnabled ? 'GPU' : 'CPU'}</span>
            </div>
          </div>
        </div>

        {hasAnyData && (
          <div className={`mb-6 p-3 rounded-xl border ${canSkipOcr ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-blue-500/10 border-blue-500/30'}`}>
            <div className="flex items-center gap-2">
              <svg className={`w-5 h-5 ${canSkipOcr ? 'text-emerald-400' : 'text-blue-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              <span className={`text-sm font-medium ${canSkipOcr ? 'text-emerald-400' : 'text-blue-400'}`}>{canSkipOcr ? 'Direct Mode: Text will be sent directly' : 'OCR Mode: Files will be processed first'}</span>
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <UploadCard title="History & Physical" subtitle="Patient history" badge="HP" badgeColor="from-blue-500 to-blue-700" activeTab={hpActiveTab} setActiveTab={setHpActiveTab} file={hpFile} preview={hpPreview} text={hpText} setText={setHpText} onFileSelect={handleFileSelect} onClear={() => clearFile('hp')} fileInputRef={hpFileInputRef} imageInputRef={hpImageInputRef} isDragging={isDraggingHp} onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave} type="hp" />
          <UploadCard title="Operative Report" subtitle="Procedure details" badge="OP" badgeColor="from-emerald-500 to-emerald-700" activeTab={opActiveTab} setActiveTab={setOpActiveTab} file={opFile} preview={opPreview} text={opText} setText={setOpText} onFileSelect={handleFileSelect} onClear={() => clearFile('op')} fileInputRef={opFileInputRef} imageInputRef={opImageInputRef} isDragging={isDraggingOp} onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave} type="op" />
        </div>

        {needsOcr && (
          <div className="bg-zinc-900/50 rounded-2xl p-4 border border-zinc-800/50 mb-6">
            <div className="flex flex-wrap items-center gap-4 sm:gap-6">
              <div className="flex items-center gap-3">
                <span className="text-zinc-400 text-sm">OCR Engine</span>
                <select value={engine} onChange={(e) => setEngine(e.target.value)} className="bg-zinc-800 text-white text-sm rounded-lg px-4 py-2.5 border border-zinc-700 focus:outline-none cursor-pointer">
                  <option value="tesseract">Tesseract</option>
                  <option value="easyocr">EasyOCR</option>
                  <option value="paddleocr">PaddleOCR</option>
                  <option value="doctr">DocTR</option>
                </select>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setGpuEnabled(!gpuEnabled)} className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${gpuEnabled ? 'bg-purple-600' : 'bg-zinc-700'}`}>
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${gpuEnabled ? 'translate-x-7' : 'translate-x-1'}`} />
                </button>
                <span className="text-zinc-300 text-sm">GPU (Fast)</span>
              </div>
            </div>
          </div>
        )}

        <button onClick={handleMainAction} disabled={!hasAnyData || isLoading} className={`w-full py-4 rounded-xl font-semibold text-lg flex items-center justify-center gap-3 transition-all duration-200 ${hasAnyData && !isLoading ? canSkipOcr ? 'bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white shadow-lg shadow-emerald-500/25' : 'bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white shadow-lg shadow-purple-500/25' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'}`}>
          {isLoading ? (<><svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Processing...</>) : (<><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={canSkipOcr ? "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" : "M13 10V3L4 14h7v7l9-11h-7z"} /></svg>{canSkipOcr ? 'Extract ICD Codes' : 'Extract Text & Codes'}</>)}
        </button>

        {error && <div className="mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl"><div className="flex items-center gap-3"><svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg><p className="text-red-400">{error}</p></div></div>}
      </div>
    </div>
  );
};

export default MedExtract;

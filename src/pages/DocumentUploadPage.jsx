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

  // Changed to support multiple files
  const [hpFiles, setHpFiles] = useState([]);
  const [opFiles, setOpFiles] = useState([]);
  const [hpPreviews, setHpPreviews] = useState([]);
  const [opPreviews, setOpPreviews] = useState([]);

  const [hpText, setHpText] = useState('');
  const [opText, setOpText] = useState('');
  const [engine, setEngine] = useState('tesseract');
  const [gpuEnabled, setGpuEnabled] = useState(true);
  const [isDraggingHp, setIsDraggingHp] = useState(false);
  const [isDraggingOp, setIsDraggingOp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isComputing, setIsComputing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState({ current: 0, total: 0, type: '' });
  const [error, setError] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('checking');
  const [useTestEndpoint, setUseTestEndpoint] = useState(false);
  const [uploadDocuments, setUploadDocuments] = useState(true);

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
        const base64 = reader.result.split(',')[1];
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

  // Check if files array contains PDF
  const hasPdf = (files) => files.some(f => f.type === 'application/pdf');

  // Check if files array contains only images
  const hasOnlyImages = (files) => files.length > 0 && files.every(f => f.type.startsWith('image/'));

  const getHpDataInfo = useMemo(() => {
    if (hpActiveTab === 'paste' && hpText.trim()) return { hasData: true, isText: true, text: hpText.trim() };
    if ((hpActiveTab === 'upload' || hpActiveTab === 'image') && hpFiles.length > 0) {
      return { hasData: true, isText: false, files: hpFiles, isPdf: hasPdf(hpFiles), isMultiImage: hpFiles.length > 1 };
    }
    return { hasData: false, isText: false };
  }, [hpActiveTab, hpText, hpFiles]);

  const getOpDataInfo = useMemo(() => {
    if (opActiveTab === 'paste' && opText.trim()) return { hasData: true, isText: true, text: opText.trim() };
    if ((opActiveTab === 'upload' || opActiveTab === 'image') && opFiles.length > 0) {
      return { hasData: true, isText: false, files: opFiles, isPdf: hasPdf(opFiles), isMultiImage: opFiles.length > 1 };
    }
    return { hasData: false, isText: false };
  }, [opActiveTab, opText, opFiles]);

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

  // Updated to handle multiple files
  const handleFilesSelect = (selectedFiles, type) => {
    const filesArray = Array.from(selectedFiles);
    const validFiles = filesArray.filter(f => f.type === 'application/pdf' || f.type.startsWith('image/'));

    if (validFiles.length === 0) return;

    // If PDF is selected, only allow one file
    const hasPdfFile = validFiles.some(f => f.type === 'application/pdf');
    const filesToProcess = hasPdfFile ? [validFiles.find(f => f.type === 'application/pdf')] : validFiles;

    const previewPromises = filesToProcess.map(file => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve({ file, preview: e.target.result });
        reader.readAsDataURL(file);
      });
    });

    Promise.all(previewPromises).then(results => {
      if (type === 'hp') {
        setHpFiles(prev => [...prev, ...results.map(r => r.file)]);
        setHpPreviews(prev => [...prev, ...results.map(r => r.preview)]);
      } else {
        setOpFiles(prev => [...prev, ...results.map(r => r.file)]);
        setOpPreviews(prev => [...prev, ...results.map(r => r.preview)]);
      }
    });
  };

  // Handle single file select (for backward compatibility)
  const handleFileSelect = (file, type) => {
    if (file) {
      handleFilesSelect([file], type);
    }
  };

  const handleDrop = (e, type) => {
    e.preventDefault();
    type === 'hp' ? setIsDraggingHp(false) : setIsDraggingOp(false);
    const files = Array.from(e.dataTransfer.files);
    const validFiles = files.filter(f => f.type === 'application/pdf' || f.type.startsWith('image/'));
    if (validFiles.length > 0) {
      handleFilesSelect(validFiles, type);
    }
  };

  const handleDragOver = (e, type) => { e.preventDefault(); type === 'hp' ? setIsDraggingHp(true) : setIsDraggingOp(true); };
  const handleDragLeave = (e, type) => { e.preventDefault(); type === 'hp' ? setIsDraggingHp(false) : setIsDraggingOp(false); };

  // Remove single file from array
  const removeFile = (type, index) => {
    if (type === 'hp') {
      setHpFiles(prev => prev.filter((_, i) => i !== index));
      setHpPreviews(prev => prev.filter((_, i) => i !== index));
    } else {
      setOpFiles(prev => prev.filter((_, i) => i !== index));
      setOpPreviews(prev => prev.filter((_, i) => i !== index));
    }
  };

  // Clear all files
  const clearFiles = (type) => {
    if (type === 'hp') {
      setHpFiles([]);
      setHpPreviews([]);
      setHpText('');
    } else {
      setOpFiles([]);
      setOpPreviews([]);
      setOpText('');
    }
  };

  // Process a single file through OCR
  const processFileOcr = async (file, type) => {
    const baseUrl = getApiBaseUrl();
    const formData = new FormData();
    formData.append('file', file);
    formData.append('engine', engine);
    formData.append('report_type', type);
    formData.append('use_gpu', gpuEnabled.toString());

    const res = await fetch(`${baseUrl}/ocr/file`, { method: 'POST', body: formData });
    return res.json();
  };

  // Process multiple files through OCR sequentially
  const processFilesOcr = async (type) => {
    const files = type === 'hp' ? hpFiles : opFiles;
    const allDocuments = [];
    let totalProcessingTime = 0;
    let lastEngineUsed = engine;

    // Update progress state
    setProcessingProgress({ current: 0, total: files.length, type: type.toUpperCase() });

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Update progress
      setProcessingProgress({ current: i + 1, total: files.length, type: type.toUpperCase() });

      const result = await processFileOcr(file, type);

      if (result && !result.success) {
        throw new Error(result.error || `OCR failed for file ${i + 1}: ${file.name}`);
      }

      if (result?.documents?.length) {
        // Add file index to each document for multi-file tracking
        result.documents.forEach((doc, docIndex) => {
          allDocuments.push({
            ...doc,
            file_index: i,
            file_name: file.name,
            page_label: files.length > 1 ? `File ${i + 1}` : `Page ${docIndex + 1}`
          });
        });
        totalProcessingTime += result.total_processing_time || 0;
        lastEngineUsed = result.documents[0]?.engine_used || engine;
      }
    }

    // Clear progress
    setProcessingProgress({ current: 0, total: 0, type: '' });

    return {
      success: true,
      documents: allDocuments,
      total_processing_time: totalProcessingTime,
      engine_used: lastEngineUsed,
      file_count: files.length
    };
  };

  const combineText = (docs, fileCount = 1) => {
    if (!docs || docs.length === 0) return '';
    if (docs.length === 1 && fileCount === 1) return docs[0].full_text || '';

    // For multiple files or multiple pages, add clear separators
    return docs.map((d, i) => {
      const label = d.page_label || (fileCount > 1 ? `File ${d.file_index + 1}` : `Page ${i + 1}`);
      const fileName = d.file_name ? ` (${d.file_name})` : '';
      return `━━━ ${label}${fileName} ━━━\n${d.full_text}`;
    }).join('\n\n');
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
        const hpResult = await processFilesOcr('hp');
        if (hpResult && !hpResult.success) throw new Error(hpResult.error || 'HP OCR failed');
        if (hpResult?.documents?.length) {
          extractedHpText = combineText(hpResult.documents, hpResult.file_count || 1);
          setHpResult({
            fullText: extractedHpText,
            totalPages: hpResult.documents.length,
            totalFiles: hpResult.file_count || 1,
            wordCount: extractedHpText.split(/\s+/).filter(Boolean).length,
            processingTime: hpResult.total_processing_time || 0,
            engine: hpResult.engine_used || engine
          });
        }
      } else if (hpInfo.isText) {
        setHpResult({ fullText: hpInfo.text, totalPages: 1, wordCount: hpInfo.text.split(/\s+/).filter(Boolean).length, processingTime: 0, engine: 'direct-text' });
      }

      if (opInfo.hasData && !opInfo.isText) {
        const opResult = await processFilesOcr('op');
        if (opResult && !opResult.success) throw new Error(opResult.error || 'OP OCR failed');
        if (opResult?.documents?.length) {
          extractedOpText = combineText(opResult.documents, opResult.file_count || 1);
          setOpResult({
            fullText: extractedOpText,
            totalPages: opResult.documents.length,
            totalFiles: opResult.file_count || 1,
            wordCount: extractedOpText.split(/\s+/).filter(Boolean).length,
            processingTime: opResult.total_processing_time || 0,
            engine: opResult.engine_used || engine
          });
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

      const requestBody = {
        hp_text: hpFullText,
        op_text: opFullText,
        upload_documents: uploadDocuments
      };

      // Handle multiple HP files
      if (hpFiles.length > 0 && uploadDocuments) {
        const hpFilesData = await Promise.all(hpFiles.map(async (file) => ({
          raw: await fileToBase64(file),
          type: getFileType(file),
          filename: file.name
        })));
        requestBody.hp_files = hpFilesData;
        requestBody.hp_type = hpFiles.length === 1 ? getFileType(hpFiles[0]) : 'multi-image';
      } else if (hpFullText && uploadDocuments) {
        requestBody.hp_files = [{ raw: hpFullText, type: 'text', filename: 'hp_text.txt' }];
        requestBody.hp_type = 'text';
      }

      // Handle multiple OP files
      if (opFiles.length > 0 && uploadDocuments) {
        const opFilesData = await Promise.all(opFiles.map(async (file) => ({
          raw: await fileToBase64(file),
          type: getFileType(file),
          filename: file.name
        })));
        requestBody.op_files = opFilesData;
        requestBody.op_type = opFiles.length === 1 ? getFileType(opFiles[0]) : 'multi-image';
      } else if (opFullText && uploadDocuments) {
        requestBody.op_files = [{ raw: opFullText, type: 'text', filename: 'op_text.txt' }];
        requestBody.op_type = 'text';
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

  const handleNew = () => {
    setHpFiles([]);
    setOpFiles([]);
    setHpPreviews([]);
    setOpPreviews([]);
    setHpText('');
    setOpText('');
    setError(null);
    clearAll();
  };

  const TabButton = ({ active, onClick, icon, label }) => (
    <button onClick={onClick} className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg transition-all duration-200 flex-1 ${active ? 'bg-zinc-700/80 text-white' : 'text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800/50'}`}>
      {icon}<span className="text-sm font-medium">{label}</span>
    </button>
  );

  // Updated UploadCard to support multiple files
  const UploadCard = ({
    title, subtitle, badge, badgeColor,
    activeTab, setActiveTab,
    files, previews, text, setText,
    onFilesSelect, onRemoveFile, onClearFiles,
    fileInputRef, imageInputRef,
    isDragging, onDrop, onDragOver, onDragLeave,
    type
  }) => (
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
        {(activeTab === 'upload' || activeTab === 'image') && files.length > 0 && (
          <span className="ml-auto px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded-full flex items-center gap-1">
            <span>{files.length}</span>
            <span>{files.length === 1 ? 'File' : 'Files'}</span>
          </span>
        )}
      </div>

      <div className="flex bg-zinc-800/30 rounded-xl p-1.5 mb-4">
        <TabButton active={activeTab === 'upload'} onClick={() => setActiveTab('upload')} icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>} label="Upload" />
        <TabButton active={activeTab === 'paste'} onClick={() => setActiveTab('paste')} icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>} label="Text" />
        <TabButton active={activeTab === 'image'} onClick={() => setActiveTab('image')} icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>} label="Images" />
      </div>

      {activeTab === 'upload' && (
        previews.length > 0 ? (
          <div className="space-y-3">
            {/* File Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-64 overflow-auto p-2 border-2 border-dashed border-zinc-700 rounded-xl bg-zinc-800/20">
              {files.map((file, index) => (
                <div key={index} className="relative group">
                  <button
                    onClick={() => onRemoveFile(type, index)}
                    className="absolute -top-2 -right-2 p-1 bg-red-500/90 hover:bg-red-500 rounded-full transition-colors z-10 opacity-0 group-hover:opacity-100"
                  >
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                  {file.type === 'application/pdf' ? (
                    <div className="flex flex-col items-center justify-center p-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
                      <svg className="w-10 h-10 text-red-500 mb-2" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 2l5 5h-5V4z" />
                      </svg>
                      <p className="text-zinc-400 text-xs text-center truncate w-full">{file.name}</p>
                    </div>
                  ) : (
                    <div className="relative">
                      <img
                        src={previews[index]}
                        alt={`Preview ${index + 1}`}
                        className="w-full h-24 object-cover rounded-lg border border-zinc-700"
                      />
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1 rounded-b-lg">
                        <p className="text-zinc-300 text-[10px] truncate">{file.name}</p>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Add More Button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center p-4 bg-zinc-800/30 hover:bg-zinc-800/50 rounded-lg border-2 border-dashed border-zinc-600 hover:border-zinc-500 transition-all h-24"
              >
                <svg className="w-6 h-6 text-zinc-500 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="text-zinc-500 text-xs">Add More</span>
              </button>
            </div>

            {/* Clear All Button */}
            <div className="flex justify-end">
              <button
                onClick={() => onClearFiles(type)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Clear All
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.gif,.webp"
              multiple
              onChange={(e) => onFilesSelect(e.target.files, type)}
              className="hidden"
            />
          </div>
        ) : (
          <div
            className={`border-2 border-dashed rounded-xl p-8 transition-all duration-200 cursor-pointer ${isDragging ? 'border-purple-500 bg-purple-500/10' : 'border-zinc-700 hover:border-zinc-600 bg-zinc-800/20 hover:bg-zinc-800/40'}`}
            onDrop={(e) => onDrop(e, type)}
            onDragOver={(e) => onDragOver(e, type)}
            onDragLeave={(e) => onDragLeave(e, type)}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.gif,.webp"
              multiple
              onChange={(e) => onFilesSelect(e.target.files, type)}
              className="hidden"
            />
            <div className="flex flex-col items-center justify-center py-4">
              <div className="w-14 h-14 rounded-full bg-zinc-700/50 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <p className="text-white font-medium mb-1">Drop your files here</p>
              <p className="text-zinc-500 text-sm mb-4">or click to browse</p>
              <div className="flex gap-2">
                <span className="px-3 py-1.5 bg-zinc-700/50 rounded-lg text-zinc-400 text-xs font-medium">PDF</span>
                <span className="px-3 py-1.5 bg-purple-500/20 rounded-lg text-purple-400 text-xs font-medium">Multiple Images</span>
              </div>
            </div>
          </div>
        )
      )}

      {activeTab === 'paste' && (
        <div className="border-2 border-dashed border-zinc-700 rounded-xl bg-zinc-800/20">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste or type your medical report text here..."
            className="w-full h-48 p-4 bg-transparent text-zinc-300 text-sm font-mono resize-none focus:outline-none placeholder-zinc-600"
          />
          {text && (
            <div className="flex items-center justify-between px-4 py-2 border-t border-zinc-700/50">
              <span className="text-zinc-500 text-xs">{text.trim().split(/\s+/).filter(w => w).length} words</span>
              <button onClick={() => setText('')} className="text-zinc-500 hover:text-zinc-300 text-xs">Clear</button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'image' && (
        previews.length > 0 ? (
          <div className="space-y-3">
            {/* Image Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-64 overflow-auto p-2 border-2 border-dashed border-zinc-700 rounded-xl bg-zinc-800/20">
              {files.map((file, index) => (
                <div key={index} className="relative group">
                  <button
                    onClick={() => onRemoveFile(type, index)}
                    className="absolute -top-2 -right-2 p-1 bg-red-500/90 hover:bg-red-500 rounded-full transition-colors z-10 opacity-0 group-hover:opacity-100"
                  >
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                  <div className="relative">
                    <img
                      src={previews[index]}
                      alt={`Preview ${index + 1}`}
                      className="w-full h-24 object-cover rounded-lg border border-zinc-700"
                    />
                    <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/70 rounded text-[10px] text-white">
                      {index + 1}
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-2 py-1 rounded-b-lg">
                      <p className="text-zinc-300 text-[10px] truncate">{file.name}</p>
                    </div>
                  </div>
                </div>
              ))}

              {/* Add More Button */}
              <button
                onClick={() => imageInputRef.current?.click()}
                className="flex flex-col items-center justify-center p-4 bg-zinc-800/30 hover:bg-zinc-800/50 rounded-lg border-2 border-dashed border-zinc-600 hover:border-zinc-500 transition-all h-24"
              >
                <svg className="w-6 h-6 text-zinc-500 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="text-zinc-500 text-xs">Add More</span>
              </button>
            </div>

            {/* Info & Clear */}
            <div className="flex items-center justify-between">
              <span className="text-zinc-500 text-xs flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {files.length} image{files.length > 1 ? 's' : ''} will be processed in order
              </span>
              <button
                onClick={() => onClearFiles(type)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Clear All
              </button>
            </div>

            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => onFilesSelect(e.target.files, type)}
              className="hidden"
            />
          </div>
        ) : (
          <div
            className={`border-2 border-dashed rounded-xl p-8 transition-all duration-200 cursor-pointer ${isDragging ? 'border-purple-500 bg-purple-500/10' : 'border-zinc-700 hover:border-zinc-600 bg-zinc-800/20 hover:bg-zinc-800/40'}`}
            onDrop={(e) => onDrop(e, type)}
            onDragOver={(e) => onDragOver(e, type)}
            onDragLeave={(e) => onDragLeave(e, type)}
            onClick={() => imageInputRef.current?.click()}
          >
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => onFilesSelect(e.target.files, type)}
              className="hidden"
            />
            <div className="flex flex-col items-center justify-center py-4">
              <div className="w-14 h-14 rounded-full bg-zinc-700/50 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-white font-medium mb-1">Upload multiple images</p>
              <p className="text-zinc-500 text-sm mb-4">Drag & drop or click to select</p>
              <div className="flex gap-2 flex-wrap justify-center">
                <span className="px-3 py-1.5 bg-zinc-700/50 rounded-lg text-zinc-400 text-xs font-medium">JPG</span>
                <span className="px-3 py-1.5 bg-zinc-700/50 rounded-lg text-zinc-400 text-xs font-medium">PNG</span>
                <span className="px-3 py-1.5 bg-zinc-700/50 rounded-lg text-zinc-400 text-xs font-medium">GIF</span>
                <span className="px-3 py-1.5 bg-zinc-700/50 rounded-lg text-zinc-400 text-xs font-medium">WEBP</span>
              </div>
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
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-purple-500/20 animate-pulse"></div>
          </div>
        </div>
        <div className="mt-8 text-center">
          <h2 className="text-2xl font-bold text-white mb-2">Computing</h2>
          <p className="text-zinc-400">Analyzing medical reports and extracting codes...</p>
        </div>

        {/* File Summary */}
        {(hpFiles.length > 0 || opFiles.length > 0) && (
          <div className="mt-4 flex gap-4 text-sm">
            {hpFiles.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/20 rounded-full border border-blue-500/30">
                <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                <span className="text-blue-300">HP: {hpFiles.length} file{hpFiles.length > 1 ? 's' : ''}</span>
              </div>
            )}
            {opFiles.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/20 rounded-full border border-emerald-500/30">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span className="text-emerald-300">OP: {opFiles.length} file{opFiles.length > 1 ? 's' : ''}</span>
              </div>
            )}
          </div>
        )}

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
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">MedExtract</h1>
              <p className="text-zinc-500 text-sm">Medical Report OCR & Coding</p>
            </div>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <button onClick={() => navigate('/analytics')} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
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
              <svg className={`w-5 h-5 ${canSkipOcr ? 'text-emerald-400' : 'text-blue-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className={`text-sm font-medium ${canSkipOcr ? 'text-emerald-400' : 'text-blue-400'}`}>
                {canSkipOcr ? 'Direct Mode: Text will be sent directly' : `OCR Mode: ${hpFiles.length + opFiles.length} file(s) will be processed`}
              </span>
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <UploadCard
            title="History & Physical"
            subtitle="Patient history"
            badge="HP"
            badgeColor="from-blue-500 to-blue-700"
            activeTab={hpActiveTab}
            setActiveTab={setHpActiveTab}
            files={hpFiles}
            previews={hpPreviews}
            text={hpText}
            setText={setHpText}
            onFilesSelect={handleFilesSelect}
            onRemoveFile={removeFile}
            onClearFiles={clearFiles}
            fileInputRef={hpFileInputRef}
            imageInputRef={hpImageInputRef}
            isDragging={isDraggingHp}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            type="hp"
          />
          <UploadCard
            title="Operative Report"
            subtitle="Procedure details"
            badge="OP"
            badgeColor="from-emerald-500 to-emerald-700"
            activeTab={opActiveTab}
            setActiveTab={setOpActiveTab}
            files={opFiles}
            previews={opPreviews}
            text={opText}
            setText={setOpText}
            onFilesSelect={handleFilesSelect}
            onRemoveFile={removeFile}
            onClearFiles={clearFiles}
            fileInputRef={opFileInputRef}
            imageInputRef={opImageInputRef}
            isDragging={isDraggingOp}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            type="op"
          />
        </div>

        {needsOcr && (
          <div className="bg-zinc-900/50 rounded-2xl p-4 border border-zinc-800/50 mb-6">
            <div className="flex flex-wrap items-center gap-4 sm:gap-6">
              <div className="flex items-center gap-3">
                <button onClick={() => setGpuEnabled(!gpuEnabled)} className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${gpuEnabled ? 'bg-purple-600' : 'bg-zinc-700'}`}>
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform duration-200 ${gpuEnabled ? 'translate-x-7' : 'translate-x-1'}`} />
                </button>
                <span className="text-zinc-300 text-sm">GPU (Fast)</span>
              </div>

              {/* File count info */}
              <div className="flex items-center gap-4 text-sm text-zinc-500">
                {hpFiles.length > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    HP: {hpFiles.length} file{hpFiles.length > 1 ? 's' : ''}
                  </span>
                )}
                {opFiles.length > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    OP: {opFiles.length} file{opFiles.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        <button
          onClick={handleMainAction}
          disabled={!hasAnyData || isLoading}
          className={`w-full py-4 rounded-xl font-semibold text-lg flex items-center justify-center gap-3 transition-all duration-200 ${hasAnyData && !isLoading ? canSkipOcr ? 'bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white shadow-lg shadow-emerald-500/25' : 'bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white shadow-lg shadow-purple-500/25' : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'}`}
        >
          {isLoading ? (
            <>
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {processingProgress.total > 1
                ? `Processing ${processingProgress.type} ${processingProgress.current}/${processingProgress.total}...`
                : 'Processing...'
              }
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={canSkipOcr ? "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" : "M13 10V3L4 14h7v7l9-11h-7z"} />
              </svg>
              {canSkipOcr ? 'Extract ICD Codes' : `Extract Text & Codes${hpFiles.length + opFiles.length > 1 ? ` (${hpFiles.length + opFiles.length} files)` : ''}`}
            </>
          )}
        </button>

        {error && (
          <div className="mt-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-red-400">{error}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MedExtract;

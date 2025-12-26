import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMedExtractStore } from '../store/resultText';

const backUrl = import.meta.env.VITE_BACKEND_URL;
const API_CONFIG = { CORRECTIONS_API_URL: `${backUrl}/submit-corrections` };

const ResultsPage = () => {
  const navigate = useNavigate();
  const [activeDoc, setActiveDoc] = useState('hp'); // 'hp' | 'op'
  const [viewMode, setViewMode] = useState('summary'); // 'summary' | 'original' | 'document'
  const [copySuccess, setCopySuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAccuracy, setShowAccuracy] = useState(false);
  const [accuracyData, setAccuracyData] = useState(null);

  // Resizable panel state
  const [codesPanelWidth, setCodesPanelWidth] = useState(420); // Default width in pixels
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef(null);

  const { hp, op, icdCodes, originalCodes, documentKey, aiSummary, remarks, setRemarks, clearAll } = useMedExtractStore();

  // Get document URLs from icdCodes
  const hpDocUrl = icdCodes?.s3_hp_doc_url || null;
  const opDocUrl = icdCodes?.s3_op_doc_url || null;
  const hpFileType = icdCodes?.hp_file_type || 'text';
  const opFileType = icdCodes?.op_file_type || 'text';

  // Current document data based on activeDoc
  const currentDocUrl = activeDoc === 'hp' ? hpDocUrl : opDocUrl;
  const currentFileType = activeDoc === 'hp' ? hpFileType : opFileType;
  const currentSummary = activeDoc === 'hp' ? aiSummary?.hp : aiSummary?.op;
  const currentText = activeDoc === 'hp' ? hp?.fullText : op?.fullText;
  const hasDocument = currentDocUrl && (currentFileType === 'pdf' || currentFileType === 'image');

  // Local state for editable codes
  const [localCodes, setLocalCodes] = useState({ admit_dx: '', pdx: '', sdx: [], cpt: [], modifier: '' });
  const [editMode, setEditMode] = useState({ admit_dx: false, pdx: false, sdx: false, cpt: false, modifier: false });
  const [pendingCodes, setPendingCodes] = useState({ sdx: [], cpt: [] });
  const [hasChanges, setHasChanges] = useState(false);

  // Resize handlers
  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!isResizing || !containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const newWidth = containerRect.right - e.clientX;

    // Clamp between min and max widths
    const clampedWidth = Math.min(Math.max(newWidth, 320), 700);
    setCodesPanelWidth(clampedWidth);
  }, [isResizing]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    if (icdCodes) {
      setLocalCodes({
        admit_dx: icdCodes.admit_dx || '',
        pdx: icdCodes.pdx || '',
        sdx: Array.isArray(icdCodes.sdx) ? [...icdCodes.sdx] : [],
        cpt: Array.isArray(icdCodes.cpt) ? [...icdCodes.cpt] : [],
        modifier: icdCodes.modifier || ''
      });
    }
  }, [icdCodes]);

  if (!icdCodes) {
    return (
      <div className="min-h-screen bg-[#0a0a0b] flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl text-white mb-4">No data available</h2>
          <button onClick={() => navigate('/')} className="px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors">Go to MedExtract</button>
        </div>
      </div>
    );
  }

  const handleCopy = async (text, label) => {
    try {
      await navigator.clipboard.writeText(Array.isArray(text) ? text.join(', ') : text);
      setCopySuccess(label);
      setTimeout(() => setCopySuccess(''), 2000);
    } catch (err) { console.error('Copy failed:', err); }
  };

  const toggleEditMode = (field) => {
    const isCurrentlyEditing = editMode[field];
    if (isCurrentlyEditing && (field === 'sdx' || field === 'cpt')) {
      if (pendingCodes[field].length > 0) {
        setLocalCodes(prev => ({ ...prev, [field]: [...prev[field], ...pendingCodes[field]] }));
        setPendingCodes(prev => ({ ...prev, [field]: [] }));
        setHasChanges(true);
      }
    }
    setEditMode(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const handleRemoveCode = (field, code) => {
    setLocalCodes(prev => ({ ...prev, [field]: prev[field].filter(c => c !== code) }));
    setHasChanges(true);
  };

  const handleRemovePendingCode = (field, code) => {
    setPendingCodes(prev => ({ ...prev, [field]: prev[field].filter(c => c !== code) }));
  };

  const handleAddPendingCode = (field, code) => {
    const trimmedCode = code.trim().toUpperCase();
    if (!trimmedCode) return { success: false, error: '' };
    if (localCodes[field].includes(trimmedCode)) {
      return { success: false, error: 'duplicate', existingCode: trimmedCode };
    }
    if (pendingCodes[field].includes(trimmedCode)) {
      return { success: false, error: 'duplicate-pending', existingCode: trimmedCode };
    }
    setPendingCodes(prev => ({ ...prev, [field]: [...prev[field], trimmedCode] }));
    return { success: true };
  };

  const handleUpdateSingleCode = (field, value) => {
    setLocalCodes(prev => ({ ...prev, [field]: value.trim().toUpperCase() }));
    setHasChanges(true);
  };

  const handleSubmitCorrections = async () => {
    setIsSubmitting(true);
    try {
      const response = await fetch(API_CONFIG.CORRECTIONS_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_key: documentKey,
          chart_number: icdCodes.chart_number,
          original: originalCodes,
          corrected: localCodes,
          remarks
        }),
      });
      const data = await response.json();
      if (data.success) {
        setAccuracyData(data.accuracy);
        setShowAccuracy(true);
        setHasChanges(false);
        setEditMode({ admit_dx: false, pdx: false, sdx: false, cpt: false, modifier: false });
        setTimeout(() => { setShowAccuracy(false); }, 4000);
      } else {
        throw new Error(data.error || 'Failed to submit');
      }
    } catch (err) {
      console.error('Submit error:', err);
      alert('Failed to submit corrections. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApprove = () => { handleSubmitCorrections(); };

  const handleSave = () => {
    const data = { icdCodes: localCodes, aiSummary, remarks, hp: hp?.fullText, op: op?.fullText };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `medical-codes-${icdCodes.chart_number || 'export'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleNewExtraction = () => { clearAll(); navigate('/'); };

  // Accuracy Overlay
  if (showAccuracy && accuracyData) {
    return (
      <div className="fixed inset-0 bg-[#0a0a0b] flex flex-col items-center justify-center z-50 animate-fadeIn">
        <div className="text-center">
          <div className="relative mb-8">
            <svg className="w-48 h-48 mx-auto" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="45" stroke="#1a1a1d" strokeWidth="8" fill="none" />
              <circle
                cx="50" cy="50" r="45"
                stroke={accuracyData.percentage >= 90 ? '#10b981' : accuracyData.percentage >= 70 ? '#f59e0b' : '#ef4444'}
                strokeWidth="8" fill="none" strokeLinecap="round"
                strokeDasharray={`${(accuracyData.percentage / 100) * 283} 283`}
                transform="rotate(-90 50 50)"
                className="transition-all duration-1000"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-5xl font-bold text-white">{accuracyData.percentage}%</span>
            </div>
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">AI Accuracy</h2>
          <p className="text-zinc-400 text-lg mb-8">
            {accuracyData.percentage >= 90 ? 'Excellent match!' : accuracyData.percentage >= 70 ? 'Good match with some corrections' : 'Significant corrections made'}
          </p>
          <div className="flex gap-4 justify-center text-sm">
            <div className="bg-[#141417] rounded-lg px-4 py-2 border border-[#1e1e22]">
              <span className="text-zinc-500">Matched: </span>
              <span className="text-emerald-400 font-semibold">{(accuracyData.details?.sdx?.matches?.length || 0) + (accuracyData.details?.cpt?.matches?.length || 0)}</span>
            </div>
            <div className="bg-[#141417] rounded-lg px-4 py-2 border border-[#1e1e22]">
              <span className="text-zinc-500">Added: </span>
              <span className="text-blue-400 font-semibold">{(accuracyData.details?.sdx?.additions?.length || 0) + (accuracyData.details?.cpt?.additions?.length || 0)}</span>
            </div>
            <div className="bg-[#141417] rounded-lg px-4 py-2 border border-[#1e1e22]">
              <span className="text-zinc-500">Removed: </span>
              <span className="text-red-400 font-semibold">{(accuracyData.details?.sdx?.removals?.length || 0) + (accuracyData.details?.cpt?.removals?.length || 0)}</span>
            </div>
          </div>
        </div>
        <div className="absolute bottom-8 text-zinc-600 text-sm animate-pulse">Redirecting...</div>
        <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } } .animate-fadeIn { animation: fadeIn 0.3s ease-out; }`}</style>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#0a0a0b] text-white flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e1e22] bg-[#0a0a0b] shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-2 hover:bg-[#1a1a1d] rounded-lg transition-colors">
            <svg className="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-semibold text-white">Medical Coding Results</h1>
            <p className="text-zinc-500 text-xs">Chart: {icdCodes.chart_number || 'N/A'}</p>
          </div>
        </div>

        {/* Info Pills */}
        <div className="flex items-center gap-2">
          <InfoPill label="MR" value={icdCodes.mr_number} />
          <InfoPill label="Acct" value={icdCodes.acct_number} />
          <InfoPill label="DOS" value={icdCodes.dos} />
        </div>

        <div className="flex items-center gap-2">
          {hasChanges && <span className="px-2 py-1 bg-amber-500/20 text-amber-400 text-xs rounded-full border border-amber-500/30">Unsaved</span>}
          <button onClick={handleNewExtraction} className="px-3 py-2 bg-[#1a1a1d] hover:bg-[#242428] text-zinc-300 text-sm rounded-lg transition-colors border border-[#2a2a2e] flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New
          </button>
        </div>
      </div>

      {/* Main Content - Two Column Layout with Resizable Partition */}
      <div ref={containerRef} className="flex-1 flex overflow-hidden relative">
        {/* Left Panel - Document Viewer */}
        <div className="flex-1 flex flex-col overflow-hidden" style={{ marginRight: codesPanelWidth }}>
          {/* Document Tabs Header */}
          <div className="p-3 border-b border-[#1e1e22] shrink-0">
            {/* HP / OP Toggle */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex bg-[#111113] rounded-lg p-1 border border-[#1e1e22]">
                <button
                  onClick={() => setActiveDoc('hp')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${activeDoc === 'hp'
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                    : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                >
                  <span className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold ${activeDoc === 'hp' ? 'bg-blue-500 text-white' : 'bg-zinc-700 text-zinc-400'
                    }`}>HP</span>
                  History & Physical
                </button>
                <button
                  onClick={() => setActiveDoc('op')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${activeDoc === 'op'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                    : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                >
                  <span className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold ${activeDoc === 'op' ? 'bg-emerald-500 text-white' : 'bg-zinc-700 text-zinc-400'
                    }`}>OP</span>
                  Operative Report
                </button>
              </div>

              <button
                onClick={() => handleCopy(viewMode === 'summary' ? JSON.stringify(currentSummary, null, 2) : currentText, activeDoc)}
                className="p-2 hover:bg-[#1a1a1d] rounded-lg transition-colors border border-[#1e1e22]"
                title="Copy"
              >
                {copySuccess === activeDoc ? (
                  <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
            </div>

            {/* View Mode Tabs */}
            <div className="flex gap-1 bg-[#0a0a0b] rounded-lg p-1">
              <ViewModeButton active={viewMode === 'summary'} onClick={() => setViewMode('summary')} icon="summary" label="AI Summary" />
              <ViewModeButton active={viewMode === 'original'} onClick={() => setViewMode('original')} icon="text" label="Original Text" />
              {hasDocument && (
                <ViewModeButton active={viewMode === 'document'} onClick={() => setViewMode('document')} icon={currentFileType} label="Document" />
              )}
            </div>
          </div>

          {/* Document Content */}
          <div className="flex-1 overflow-auto">
            {viewMode === 'summary' && (
              <div className="p-4 space-y-3">
                {currentSummary ? (
                  activeDoc === 'hp' ? <HPSummary data={currentSummary} /> : <OPSummary data={currentSummary} />
                ) : (
                  <div className="text-zinc-500 text-center py-12 text-sm">No summary available</div>
                )}
              </div>
            )}

            {viewMode === 'original' && (
              <div className="p-4">
                <pre className="text-zinc-300 text-sm font-mono whitespace-pre-wrap leading-relaxed">
                  {currentText || 'No text available'}
                </pre>
              </div>
            )}

            {viewMode === 'document' && hasDocument && (
              <div className="h-full">
                {currentFileType === 'pdf' ? (
                  <iframe src={currentDocUrl} className="w-full h-full border-0" title={`${activeDoc.toUpperCase()} Document`} />
                ) : currentFileType === 'image' ? (
                  <div className="p-4 flex items-center justify-center h-full bg-[#080809]">
                    <img src={currentDocUrl} alt={`${activeDoc.toUpperCase()} Document`} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </div>

        {/* Resizable Divider */}
        <div
          onMouseDown={handleMouseDown}
          className={`absolute top-0 bottom-0 w-1.5 cursor-col-resize z-10 group transition-colors ${isResizing ? 'bg-purple-500' : 'bg-[#1e1e22] hover:bg-purple-500/50'
            }`}
          style={{ right: codesPanelWidth - 3 }}
        >
          {/* Drag Handle Visual */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-1 h-1 rounded-full bg-zinc-400"></div>
            <div className="w-1 h-1 rounded-full bg-zinc-400"></div>
            <div className="w-1 h-1 rounded-full bg-zinc-400"></div>
          </div>
        </div>

        {/* Right Panel - Codes (Resizable) */}
        <div
          className="absolute top-0 bottom-0 right-0 flex flex-col overflow-hidden bg-[#0d0d0f] border-l border-[#1e1e22]"
          style={{ width: codesPanelWidth }}
        >
          <div className="p-3 border-b border-[#1e1e22] flex items-center justify-between shrink-0">
            <h3 className="text-sm font-semibold text-white">Medical Codes</h3>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-zinc-500">Tokens: {icdCodes.tokens_used || 0}</span>
              <span className="text-[10px] text-zinc-600">|</span>
              <span className="text-[10px] text-zinc-500">{Math.round(codesPanelWidth)}px</span>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-3 space-y-2">
            <CompactCodeRow label="Admit DX" value={localCodes.admit_dx} isEditMode={editMode.admit_dx} onToggleEdit={() => toggleEditMode('admit_dx')} onUpdate={(val) => handleUpdateSingleCode('admit_dx', val)} onCopy={() => handleCopy(localCodes.admit_dx, 'admit_dx')} copySuccess={copySuccess === 'admit_dx'} />
            <CompactCodeRow label="PDX" value={localCodes.pdx} isEditMode={editMode.pdx} onToggleEdit={() => toggleEditMode('pdx')} onUpdate={(val) => handleUpdateSingleCode('pdx', val)} onCopy={() => handleCopy(localCodes.pdx, 'pdx')} copySuccess={copySuccess === 'pdx'} highlight />
            <CompactTagRow label="SDX" codes={localCodes.sdx} pendingCodes={pendingCodes.sdx} isEditMode={editMode.sdx} onToggleEdit={() => toggleEditMode('sdx')} onRemove={(code) => handleRemoveCode('sdx', code)} onRemovePending={(code) => handleRemovePendingCode('sdx', code)} onAddPending={(code) => handleAddPendingCode('sdx', code)} onCopy={() => handleCopy(localCodes.sdx, 'sdx')} copySuccess={copySuccess === 'sdx'} />
            <CompactTagRow label="CPT" codes={localCodes.cpt} pendingCodes={pendingCodes.cpt} isEditMode={editMode.cpt} onToggleEdit={() => toggleEditMode('cpt')} onRemove={(code) => handleRemoveCode('cpt', code)} onRemovePending={(code) => handleRemovePendingCode('cpt', code)} onAddPending={(code) => handleAddPendingCode('cpt', code)} onCopy={() => handleCopy(localCodes.cpt, 'cpt')} copySuccess={copySuccess === 'cpt'} tagColor="blue" />
            <CompactCodeRow label="Modifier" value={localCodes.modifier} isEditMode={editMode.modifier} onToggleEdit={() => toggleEditMode('modifier')} onUpdate={(val) => handleUpdateSingleCode('modifier', val)} onCopy={() => handleCopy(localCodes.modifier, 'modifier')} copySuccess={copySuccess === 'modifier'} />

            {/* Remarks */}
            <div className="pt-2">
              <label className="text-[10px] text-zinc-500 mb-1 block uppercase tracking-wider">Remarks</label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Add notes..."
                className="w-full h-24 bg-[#111113] border border-[#1e1e22] rounded-lg p-3 text-zinc-300 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-purple-500/50 focus:border-purple-500/50 placeholder-zinc-600 transition-all"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="p-3 border-t border-[#1e1e22] flex gap-2 shrink-0">
            <button
              onClick={handleApprove}
              disabled={isSubmitting}
              className={`flex-1 px-3 py-2.5 text-white text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2 ${hasChanges
                ? 'bg-amber-600 hover:bg-amber-500'
                : 'bg-emerald-600 hover:bg-emerald-500'
                }`}
            >
              {isSubmitting ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Submitting...
                </>
              ) : hasChanges ? 'Submit Changes' : 'Approve'}
            </button>
            <button
              onClick={handleSave}
              className="px-3 cursor-not-allowed py-2.5 bg-[#1a1a1d]  text-zinc-300 text-sm font-medium rounded-lg transition-colors border border-[#2a2a2e]"
              title="Download JSON"
              disabled
            >
              {/* <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"> */}
              {/*   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /> */}
              {/* </svg> */}
              <span>Upload</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Info Pill Component
const InfoPill = ({ label, value }) => (
  <div className="bg-[#111113] border border-[#1e1e22] rounded-lg px-3 py-1.5 flex items-center gap-2">
    <span className="text-zinc-500 text-[10px] uppercase">{label}</span>
    <span className="text-white font-mono text-xs">{value || 'N/A'}</span>
  </div>
);

// View Mode Button
const ViewModeButton = ({ active, onClick, icon, label }) => {
  const getIcon = () => {
    switch (icon) {
      case 'summary':
        return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>;
      case 'text':
        return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>;
      case 'pdf':
        return <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 2l5 5h-5V4z" /></svg>;
      case 'image':
        return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>;
      default:
        return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>;
    }
  };

  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${active
        ? 'bg-[#1a1a1d] text-white'
        : 'text-zinc-500 hover:text-zinc-300'
        }`}
    >
      {getIcon()}
      {label}
    </button>
  );
};

// HP Summary Component
const HPSummary = ({ data }) => (
  <div className="space-y-3">
    {data.chief_complaint && <SummaryBlock title="Chief Complaint" content={data.chief_complaint} />}
    {data.history_of_present_illness && <SummaryBlock title="History of Present Illness" content={data.history_of_present_illness} />}
    {data.past_medical_history?.length > 0 && <SummaryListBlock title="Past Medical History" items={data.past_medical_history} />}
    {data.medications?.length > 0 && (
      <div className="bg-[#111113] rounded-xl p-4 border border-[#1e1e22]">
        <div className="text-zinc-500 text-xs uppercase tracking-wider mb-2">Medications</div>
        <ul className="text-zinc-300 space-y-1 text-sm">
          {data.medications.map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 mt-2 shrink-0" />
              {typeof item === 'string' ? item : (
                <span>
                  <span className="text-zinc-200 font-medium">{item.name}</span>
                  {item.dosage && <span className="text-zinc-500"> — {item.dosage}</span>}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    )}
    {data.allergies?.length > 0 && <SummaryListBlock title="Allergies" items={data.allergies} color="red" />}
    {data.vital_signs && (
      <div className="bg-[#111113] rounded-xl p-4 border border-[#1e1e22]">
        <div className="text-zinc-500 text-xs uppercase tracking-wider mb-3">Vital Signs</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {data.vital_signs.bp && <VitalBadge label="BP" value={data.vital_signs.bp} />}
          {data.vital_signs.hr && <VitalBadge label="HR" value={data.vital_signs.hr} />}
          {data.vital_signs.temp && <VitalBadge label="Temp" value={data.vital_signs.temp} />}
          {data.vital_signs.spo2 && <VitalBadge label="SpO2" value={data.vital_signs.spo2} />}
          {data.vital_signs.height && <VitalBadge label="Height" value={data.vital_signs.height} />}
          {data.vital_signs.weight && <VitalBadge label="Weight" value={data.vital_signs.weight} />}
          {data.vital_signs.bmi && <VitalBadge label="BMI" value={data.vital_signs.bmi} />}
        </div>
      </div>
    )}
    {data.physical_exam_summary && <SummaryBlock title="Physical Exam" content={data.physical_exam_summary} />}
    {data.assessment && <SummaryBlock title="Assessment" content={data.assessment} />}
  </div>
);

// OP Summary Component
const OPSummary = ({ data }) => (
  <div className="space-y-3">
    {data.procedure_performed?.length > 0 && <SummaryListBlock title="Procedures Performed" items={data.procedure_performed} color="emerald" />}
    {data.indication && <SummaryBlock title="Indication" content={data.indication} />}
    {data.anesthesia && <SummaryBlock title="Anesthesia" content={data.anesthesia} />}
    {data.findings?.colonoscopy?.length > 0 && <SummaryListBlock title="Colonoscopy Findings" items={data.findings.colonoscopy} itemKey="description" />}
    {data.findings?.egd?.length > 0 && <SummaryListBlock title="EGD Findings" items={data.findings.egd} itemKey="description" />}
    {data.specimens && <SummaryBlock title="Specimens" content={data.specimens} />}
    {data.complications && <SummaryBlock title="Complications" content={data.complications} color={data.complications.toLowerCase() === 'none' ? 'emerald' : 'red'} />}
    {data.disposition && <SummaryBlock title="Disposition" content={data.disposition} />}
    {data.recommendations?.length > 0 && <SummaryListBlock title="Recommendations" items={data.recommendations} itemKey="recommendation" color="blue" />}
  </div>
);

// Summary Block Component
const SummaryBlock = ({ title, content, color }) => (
  <div className="bg-[#111113] rounded-xl p-4 border border-[#1e1e22]">
    <div className="text-zinc-500 text-xs uppercase tracking-wider mb-2">{title}</div>
    <p className={`text-sm leading-relaxed ${color === 'emerald' ? 'text-emerald-400' : color === 'red' ? 'text-red-400' : 'text-zinc-300'}`}>{content}</p>
  </div>
);

// Summary List Block Component
const SummaryListBlock = ({ title, items, itemKey = 'name', color }) => (
  <div className="bg-[#111113] rounded-xl p-4 border border-[#1e1e22]">
    <div className="text-zinc-500 text-xs uppercase tracking-wider mb-2">{title}</div>
    <ul className="text-zinc-300 space-y-1 text-sm">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2">
          <span className={`w-1.5 h-1.5 rounded-full mt-2 shrink-0 ${color === 'emerald' ? 'bg-emerald-500' : color === 'red' ? 'bg-red-500' : color === 'blue' ? 'bg-blue-500' : 'bg-zinc-600'}`} />
          {typeof item === 'string' ? item : item[itemKey] || JSON.stringify(item)}
        </li>
      ))}
    </ul>
  </div>
);

// Vital Badge Component
const VitalBadge = ({ label, value }) => (
  <div className="bg-[#0a0a0b] rounded-lg px-3 py-2 border border-[#1a1a1d]">
    <span className="text-zinc-500 text-xs">{label}</span>
    <div className="text-zinc-200 text-sm font-medium">{value}</div>
  </div>
);

// Compact Code Row
const CompactCodeRow = ({ label, value, isEditMode, onToggleEdit, onUpdate, onCopy, copySuccess, highlight }) => {
  const [inputValue, setInputValue] = useState(value);
  useEffect(() => { setInputValue(value); }, [value]);

  const handleSave = () => { onUpdate(inputValue); onToggleEdit(); };
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSave();
    else if (e.key === 'Escape') { setInputValue(value); onToggleEdit(); }
  };

  return (
    <div className="bg-[#111113] rounded-lg border border-[#1e1e22] p-2.5">
      <div className="flex items-center gap-2">
        <div className="w-16 shrink-0">
          <span className={`text-[10px] font-medium uppercase tracking-wider ${highlight ? 'text-emerald-400' : 'text-zinc-500'}`}>{label}</span>
        </div>
        <div className="flex-1 bg-[#0a0a0b] rounded-md px-3 py-2 min-h-[32px] flex items-center border border-[#1a1a1d]">
          {isEditMode ? (
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value.toUpperCase())}
              onKeyDown={handleKeyDown}
              autoFocus
              className="w-full bg-transparent text-white font-mono text-sm outline-none"
              placeholder="Enter code..."
            />
          ) : (
            <span className={`font-mono text-sm ${highlight ? 'text-emerald-400' : 'text-white'}`}>{value || '—'}</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onCopy} className="p-1.5 hover:bg-[#1a1a1d] rounded-md transition-colors">
            {copySuccess ? (
              <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </button>
          <button
            onClick={isEditMode ? handleSave : onToggleEdit}
            className={`p-1.5 rounded-md transition-colors ${isEditMode ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'hover:bg-[#1a1a1d] text-zinc-500'}`}
          >
            {isEditMode ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// Compact Tag Row
const CompactTagRow = ({ label, codes, pendingCodes, isEditMode, onToggleEdit, onRemove, onRemovePending, onAddPending, onCopy, copySuccess, tagColor = 'default' }) => {
  const [newCode, setNewCode] = useState('');
  const [duplicateCode, setDuplicateCode] = useState(null);

  const handleAddCode = () => {
    if (!newCode.trim()) return;
    const result = onAddPending(newCode);
    if (result.success) {
      setNewCode('');
      setDuplicateCode(null);
    } else if (result.error === 'duplicate' || result.error === 'duplicate-pending') {
      setDuplicateCode(result.existingCode);
      setTimeout(() => setDuplicateCode(null), 2000);
    }
  };

  const handleKeyDown = (e) => { if (e.key === 'Enter') handleAddCode(); };

  const getTagColors = (code, isPending = false) => {
    if (code === duplicateCode) return 'bg-red-500/30 border-red-500 text-red-300';
    if (isPending) return 'bg-amber-500/20 border-amber-500/50 text-amber-300 border-dashed';
    if (tagColor === 'blue') return 'bg-blue-500/15 border-blue-500/30 text-blue-300';
    return 'bg-[#1a1a1d] border-[#2a2a2e] text-zinc-300';
  };

  return (
    <div className="bg-[#111113] rounded-lg border border-[#1e1e22] p-2.5">
      <div className="flex items-start gap-2">
        <div className="w-16 shrink-0 pt-1.5">
          <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">{label}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="bg-[#0a0a0b] rounded-md p-2 min-h-[36px] border border-[#1a1a1d]">
            <div className="flex flex-wrap gap-1.5">
              {codes.map((code) => (
                <div key={code} className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border font-mono text-xs ${getTagColors(code)}`}>
                  <span>{code}</span>
                  {isEditMode && (
                    <button onClick={() => onRemove(code)} className="w-3.5 h-3.5 rounded-full bg-zinc-700 hover:bg-red-500 flex items-center justify-center transition-colors">
                      <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}

              {isEditMode && pendingCodes.map((code) => (
                <div key={`pending-${code}`} className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border font-mono text-xs ${getTagColors(code, true)}`}>
                  <span>{code}</span>
                  <button onClick={() => onRemovePending(code)} className="w-3.5 h-3.5 rounded-full bg-amber-600 hover:bg-red-500 flex items-center justify-center transition-colors">
                    <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}

              {isEditMode && (
                <input
                  type="text"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                  onKeyDown={handleKeyDown}
                  placeholder="+ Add"
                  className={`w-16 px-2 py-1 bg-[#111113] border rounded-md text-white font-mono text-xs outline-none focus:border-purple-500 ${duplicateCode ? 'border-red-500' : 'border-[#2a2a2e]'}`}
                />
              )}
              {codes.length === 0 && pendingCodes.length === 0 && !isEditMode && (
                <span className="text-zinc-600 text-xs py-1">No codes</span>
              )}
            </div>
          </div>
          {duplicateCode && <div className="mt-1 text-red-400 text-[10px]">"{duplicateCode}" already exists</div>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onCopy} className="p-1.5 hover:bg-[#1a1a1d] rounded-md transition-colors">
            {copySuccess ? (
              <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </button>
          <button
            onClick={onToggleEdit}
            className={`p-1.5 rounded-md transition-colors ${isEditMode ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'hover:bg-[#1a1a1d] text-zinc-500'}`}
          >
            {isEditMode ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ResultsPage;

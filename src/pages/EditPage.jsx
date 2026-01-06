import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMedExtractStore } from '../store/resultText';

const backUrl = import.meta.env.VITE_BACKEND_URL;
const API_CONFIG = { CORRECTIONS_API_URL: `${backUrl}/submit-corrections` };

// ============================================
// EDIT REASONS CONFIGURATION
// ============================================
const EDIT_REASONS = {
  removal: [
    { id: 'not_documented', label: 'Not documented in chart', description: 'Code not supported by documentation' },
    { id: 'incorrect_code', label: 'Incorrect code selected', description: 'Wrong ICD/CPT code for the condition' },
    { id: 'more_specific', label: 'More specific code available', description: 'A more specific code should be used' },
    { id: 'not_billable', label: 'Not billable', description: 'Code is not billable for this encounter' },
    { id: 'duplicate', label: 'Duplicate code', description: 'Code already captured elsewhere' },
    { id: 'sequencing_error', label: 'Sequencing error', description: 'Code is in wrong position/order' },
    { id: 'laterality_issue', label: 'Laterality issue', description: 'Wrong side specified or missing laterality' },
    { id: 'timing_issue', label: 'Timing/POA issue', description: 'Present on admission status incorrect' },
    { id: 'bundled', label: 'Bundled with another code', description: 'Code is included in another procedure' },
    { id: 'other', label: 'Other reason', description: 'Specify in remarks' },
  ],
  addition: [
    { id: 'missed_diagnosis', label: 'Missed diagnosis', description: 'Documented but not captured by AI' },
    { id: 'missed_procedure', label: 'Missed procedure', description: 'Procedure performed but not captured' },
    { id: 'complication', label: 'Complication/comorbidity', description: 'Additional condition affecting care' },
    { id: 'chronic_condition', label: 'Chronic condition', description: 'Ongoing condition requiring coding' },
    { id: 'secondary_diagnosis', label: 'Secondary diagnosis', description: 'Additional relevant diagnosis' },
    { id: 'hcc_capture', label: 'HCC capture', description: 'Risk adjustment code needed' },
    { id: 'specificity_required', label: 'Specificity required', description: 'More detail needed for accurate coding' },
    { id: 'modifier_needed', label: 'Modifier needed', description: 'Procedure requires modifier' },
    { id: 'other', label: 'Other reason', description: 'Specify in remarks' },
  ],
  change: [
    { id: 'incorrect_principal', label: 'Incorrect principal diagnosis', description: 'PDX does not match reason for admission' },
    { id: 'specificity', label: 'Needs more specificity', description: 'Code requires additional detail' },
    { id: 'clinical_update', label: 'Clinical update', description: 'Diagnosis changed after further evaluation' },
    { id: 'documentation_review', label: 'Documentation review', description: 'Found better supporting documentation' },
    { id: 'coding_guidelines', label: 'Coding guidelines', description: 'Following official coding guidelines' },
    { id: 'query_response', label: 'Query response', description: 'Based on physician query response' },
    { id: 'other', label: 'Other reason', description: 'Specify in remarks' },
  ]
};

const ResultsPage = () => {
  const navigate = useNavigate();
  const [activeDoc, setActiveDoc] = useState('hp');
  const [viewMode, setViewMode] = useState('summary');
  const [copySuccess, setCopySuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAccuracy, setShowAccuracy] = useState(false);
  const [accuracyData, setAccuracyData] = useState(null);

  // Document viewer state
  const [currentDocIndex, setCurrentDocIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [imageZoom, setImageZoom] = useState(1);
  const [imageLoadErrors, setImageLoadErrors] = useState({});

  // Resizable panel state
  const [codesPanelWidth, setCodesPanelWidth] = useState(450);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef(null);

  const { hp, op, icdCodes, originalCodes, documentKey, aiSummary, remarks, setRemarks, clearAll } = useMedExtractStore();

  // DEBUG: Log received icdCodes
  useEffect(() => {
    if (icdCodes) {
      console.log('\n======= RESULTS PAGE - RECEIVED icdCodes =======');
      console.log('Full icdCodes:', icdCodes);
      console.log('s3_hp_doc_url:', icdCodes.s3_hp_doc_url);
      console.log('s3_hp_doc_urls:', icdCodes.s3_hp_doc_urls);
      console.log('s3_op_doc_url:', icdCodes.s3_op_doc_url);
      console.log('s3_op_doc_urls:', icdCodes.s3_op_doc_urls);
      console.log('s3_hp_doc_key:', icdCodes.s3_hp_doc_key);
      console.log('s3_hp_doc_keys:', icdCodes.s3_hp_doc_keys);
      console.log('s3_endpoint:', icdCodes.s3_endpoint);
      console.log('s3_bucket:', icdCodes.s3_bucket);
      console.log('hp_file_count:', icdCodes.hp_file_count);
      console.log('op_file_count:', icdCodes.op_file_count);
      console.log('All keys:', Object.keys(icdCodes));
      console.log('================================================\n');
    }
  }, [icdCodes]);

  // ============================================
  // Get document URLs - Support both single and multiple
  // Check various possible field names for flexibility
  // Also construct URLs from S3 keys if only keys are available
  // ============================================
  const constructS3Url = (key) => {
    if (!key) return null;
    // If it's already a full URL, return as-is
    if (key.startsWith('http://') || key.startsWith('https://')) {
      return key;
    }

    // Try to construct URL from endpoint/bucket info in icdCodes
    const endpoint = icdCodes?.s3_endpoint;
    const bucket = icdCodes?.s3_bucket;

    if (endpoint && bucket) {
      const cleanEndpoint = endpoint.replace(/\/$/, '');
      return `${cleanEndpoint}/${bucket}/${key}`;
    }

    // Fallback: try environment variable
    const envEndpoint = import.meta.env.VITE_S3_ENDPOINT;
    const envBucket = import.meta.env.VITE_S3_BUCKET || 'medextract';

    if (envEndpoint) {
      const cleanEndpoint = envEndpoint.replace(/\/$/, '');
      return `${cleanEndpoint}/${envBucket}/${key}`;
    }

    console.warn('Cannot construct S3 URL - no endpoint available for key:', key);
    return null;
  };

  const getDocUrls = (type) => {
    if (!icdCodes) {
      console.log(`getDocUrls(${type}): No icdCodes available`);
      return [];
    }

    console.log(`\n--- getDocUrls(${type}) called ---`);

    // First try direct URL arrays
    const urlArrayKeys = type === 'hp'
      ? ['s3_hp_doc_urls', 'hp_doc_urls', 'hpDocUrls']
      : ['s3_op_doc_urls', 'op_doc_urls', 'opDocUrls'];

    for (const key of urlArrayKeys) {
      const value = icdCodes[key];
      console.log(`Checking ${key}:`, value);
      if (value && Array.isArray(value) && value.length > 0) {
        const validUrls = value.filter(url => url);
        if (validUrls.length > 0) {
          console.log(`✓ Found ${type} URLs in ${key}:`, validUrls);
          return validUrls;
        }
      }
    }

    // Then try single URL fields
    const singleUrlKeys = type === 'hp'
      ? ['s3_hp_doc_url', 'hp_doc_url', 'hpDocUrl']
      : ['s3_op_doc_url', 'op_doc_url', 'opDocUrl'];

    for (const key of singleUrlKeys) {
      const value = icdCodes[key];
      console.log(`Checking ${key}:`, value);
      if (value) {
        console.log(`✓ Found ${type} URL in ${key}:`, value);
        return [value];
      }
    }

    // Try key arrays and construct URLs
    const keyArrayFields = type === 'hp'
      ? ['s3_hp_doc_keys', 'hp_doc_keys']
      : ['s3_op_doc_keys', 'op_doc_keys'];

    for (const field of keyArrayFields) {
      const value = icdCodes[field];
      console.log(`Checking ${field}:`, value);
      if (value && Array.isArray(value) && value.length > 0) {
        const urls = value.map(constructS3Url).filter(Boolean);
        if (urls.length > 0) {
          console.log(`✓ Constructed ${type} URLs from ${field}:`, urls);
          return urls;
        }
      }
    }

    // Try single key fields and construct URL
    const singleKeyFields = type === 'hp'
      ? ['s3_hp_doc_key', 'hp_doc_key']
      : ['s3_op_doc_key', 'op_doc_key'];

    for (const field of singleKeyFields) {
      const value = icdCodes[field];
      console.log(`Checking ${field}:`, value);
      if (value) {
        const url = constructS3Url(value);
        if (url) {
          console.log(`✓ Constructed ${type} URL from ${field}:`, url);
          return [url];
        }
      }
    }

    console.log(`✗ No ${type} document URLs found`);
    console.log('Available icdCodes keys:', Object.keys(icdCodes));
    return [];
  };

  const getFileType = (type) => {
    if (!icdCodes) return 'text';
    const fileTypeKey = type === 'hp' ? 'hp_file_type' : 'op_file_type';
    return icdCodes[fileTypeKey] || 'text';
  };

  const getFileCount = (type) => {
    if (!icdCodes) return 0;
    const countKey = type === 'hp' ? 'hp_file_count' : 'op_file_count';
    return icdCodes[countKey] || getDocUrls(type).length;
  };

  // Current document data based on activeDoc
  const currentDocUrls = getDocUrls(activeDoc);
  const currentFileType = getFileType(activeDoc);
  const currentFileCount = getFileCount(activeDoc);
  const currentSummary = activeDoc === 'hp' ? aiSummary?.hp : aiSummary?.op;
  const currentText = activeDoc === 'hp' ? hp?.fullText : op?.fullText;
  const hasDocuments = currentDocUrls.length > 0;
  const isMultiDoc = currentDocUrls.length > 1;
  const currentDocUrl = currentDocUrls[currentDocIndex] || null;

  // Determine file type for a URL
  const getUrlFileType = (url) => {
    if (!url) return 'unknown';
    const lower = url.toLowerCase();
    if (lower.endsWith('.pdf')) return 'pdf';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') ||
      lower.endsWith('.gif') || lower.endsWith('.webp')) return 'image';
    // Check file type from icdCodes
    if (currentFileType === 'pdf') return 'pdf';
    if (currentFileType === 'image' || currentFileType === 'multi-image') return 'image';
    return 'image'; // Default to image
  };

  const isCurrentDocImage = getUrlFileType(currentDocUrl) === 'image';
  const isCurrentDocPdf = getUrlFileType(currentDocUrl) === 'pdf';

  // Local state for editable codes
  const [localCodes, setLocalCodes] = useState({ admit_dx: '', pdx: '', sdx: [], cpt: [], modifier: '' });
  const [editMode, setEditMode] = useState({ admit_dx: false, pdx: false, sdx: false, cpt: false, modifier: false });
  const [pendingCodes, setPendingCodes] = useState({ sdx: [], cpt: [] });
  const [hasChanges, setHasChanges] = useState(false);

  const [editReasons, setEditReasons] = useState({
    admit_dx: null,
    pdx: null,
    modifier: null,
    sdx: { additions: {}, removals: {} },
    cpt: { additions: {}, removals: {} }
  });

  // Reset doc index when switching between HP and OP
  useEffect(() => {
    setCurrentDocIndex(0);
    setImageZoom(1);
    setImageLoadErrors({});
  }, [activeDoc]);

  // Resize handlers
  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!isResizing || !containerRef.current) return;
    const containerRect = containerRef.current.getBoundingClientRect();
    const newWidth = containerRect.right - e.clientX;
    const clampedWidth = Math.min(Math.max(newWidth, 350), 750);
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

  // Keyboard navigation for documents
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (viewMode !== 'document' || !isMultiDoc) return;
      if (e.key === 'ArrowLeft' && currentDocIndex > 0) {
        setCurrentDocIndex(prev => prev - 1);
        setImageZoom(1);
      } else if (e.key === 'ArrowRight' && currentDocIndex < currentDocUrls.length - 1) {
        setCurrentDocIndex(prev => prev + 1);
        setImageZoom(1);
      } else if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode, isMultiDoc, currentDocIndex, currentDocUrls.length, isFullscreen]);

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

  const handleRemoveCode = (field, code, reason) => {
    setLocalCodes(prev => ({ ...prev, [field]: prev[field].filter(c => c !== code) }));
    setEditReasons(prev => ({
      ...prev,
      [field]: {
        ...prev[field],
        removals: { ...prev[field].removals, [code]: reason }
      }
    }));
    setHasChanges(true);
  };

  const handleRemovePendingCode = (field, code) => {
    setPendingCodes(prev => ({ ...prev, [field]: prev[field].filter(c => c !== code) }));
    setEditReasons(prev => {
      const newAdditions = { ...prev[field].additions };
      delete newAdditions[code];
      return {
        ...prev,
        [field]: { ...prev[field], additions: newAdditions }
      };
    });
  };

  const handleAddPendingCode = (field, code, reason) => {
    const trimmedCode = code.trim().toUpperCase();
    if (!trimmedCode) return { success: false, error: '' };
    if (localCodes[field].includes(trimmedCode)) {
      return { success: false, error: 'duplicate', existingCode: trimmedCode };
    }
    if (pendingCodes[field].includes(trimmedCode)) {
      return { success: false, error: 'duplicate-pending', existingCode: trimmedCode };
    }
    setPendingCodes(prev => ({ ...prev, [field]: [...prev[field], trimmedCode] }));
    setEditReasons(prev => ({
      ...prev,
      [field]: {
        ...prev[field],
        additions: { ...prev[field].additions, [trimmedCode]: reason }
      }
    }));
    return { success: true };
  };

  const handleUpdateSingleCode = (field, value, reason) => {
    const newValue = value.trim().toUpperCase();
    const oldValue = localCodes[field];
    if (newValue !== oldValue) {
      setLocalCodes(prev => ({ ...prev, [field]: newValue }));
      setEditReasons(prev => ({ ...prev, [field]: { oldValue, newValue, reason } }));
      setHasChanges(true);
    }
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
          edit_reasons: editReasons,
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
    const data = { icdCodes: localCodes, aiSummary, remarks, editReasons, hp: hp?.fullText, op: op?.fullText };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `medical-codes-${icdCodes.chart_number || 'export'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleNewExtraction = () => { clearAll(); navigate('/'); };

  const getChangeCount = () => {
    let count = 0;
    if (editReasons.admit_dx) count++;
    if (editReasons.pdx) count++;
    if (editReasons.modifier) count++;
    count += Object.keys(editReasons.sdx.additions).length;
    count += Object.keys(editReasons.sdx.removals).length;
    count += Object.keys(editReasons.cpt.additions).length;
    count += Object.keys(editReasons.cpt.removals).length;
    return count;
  };

  // Document navigation
  const goToPrevDoc = () => {
    if (currentDocIndex > 0) {
      setCurrentDocIndex(prev => prev - 1);
      setImageZoom(1);
    }
  };

  const goToNextDoc = () => {
    if (currentDocIndex < currentDocUrls.length - 1) {
      setCurrentDocIndex(prev => prev + 1);
      setImageZoom(1);
    }
  };

  const handleImageError = (index) => {
    setImageLoadErrors(prev => ({ ...prev, [index]: true }));
  };

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

  // Fullscreen Document Viewer
  if (isFullscreen && currentDocUrl) {
    return (
      <div className="fixed inset-0 bg-black z-50 flex flex-col">
        {/* Fullscreen Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-black/80 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <span className={`px-2 py-1 rounded text-xs font-bold ${activeDoc === 'hp' ? 'bg-blue-500' : 'bg-emerald-500'}`}>
              {activeDoc.toUpperCase()}
            </span>
            {isMultiDoc && (
              <span className="text-zinc-400 text-sm">
                Document {currentDocIndex + 1} of {currentDocUrls.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Zoom Controls */}
            {isCurrentDocImage && (
              <div className="flex items-center gap-1 mr-4">
                <button
                  onClick={() => setImageZoom(z => Math.max(0.25, z - 0.25))}
                  className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                  </svg>
                </button>
                <span className="text-zinc-400 text-sm w-16 text-center">{Math.round(imageZoom * 100)}%</span>
                <button
                  onClick={() => setImageZoom(z => Math.min(4, z + 0.25))}
                  className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
                <button
                  onClick={() => setImageZoom(1)}
                  className="px-2 py-1 hover:bg-zinc-800 rounded-lg text-zinc-400 text-xs"
                >
                  Reset
                </button>
              </div>
            )}
            <button
              onClick={() => setIsFullscreen(false)}
              className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Fullscreen Content */}
        <div className="flex-1 relative overflow-auto flex items-center justify-center bg-zinc-950">
          {isCurrentDocPdf ? (
            <iframe src={currentDocUrl} className="w-full h-full border-0" title="Document" />
          ) : (
            <div className="overflow-auto w-full h-full flex items-center justify-center p-4">
              <img
                src={currentDocUrl}
                alt={`Document ${currentDocIndex + 1}`}
                style={{ transform: `scale(${imageZoom})`, transformOrigin: 'center' }}
                className="max-w-none transition-transform duration-200"
                onError={() => handleImageError(currentDocIndex)}
              />
            </div>
          )}

          {/* Navigation Arrows */}
          {isMultiDoc && (
            <>
              <button
                onClick={goToPrevDoc}
                disabled={currentDocIndex === 0}
                className={`absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full transition-all ${currentDocIndex === 0
                    ? 'bg-zinc-800/50 text-zinc-600 cursor-not-allowed'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-white'
                  }`}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={goToNextDoc}
                disabled={currentDocIndex === currentDocUrls.length - 1}
                className={`absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full transition-all ${currentDocIndex === currentDocUrls.length - 1
                    ? 'bg-zinc-800/50 text-zinc-600 cursor-not-allowed'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-white'
                  }`}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </>
          )}
        </div>

        {/* Thumbnail Strip */}
        {isMultiDoc && (
          <div className="bg-black/80 border-t border-zinc-800 p-3">
            <div className="flex gap-2 justify-center overflow-auto">
              {currentDocUrls.map((url, idx) => (
                <button
                  key={idx}
                  onClick={() => { setCurrentDocIndex(idx); setImageZoom(1); }}
                  className={`relative w-16 h-16 rounded-lg overflow-hidden border-2 transition-all flex-shrink-0 ${idx === currentDocIndex ? 'border-purple-500 ring-2 ring-purple-500/30' : 'border-zinc-700 hover:border-zinc-500'
                    }`}
                >
                  {getUrlFileType(url) === 'pdf' ? (
                    <div className="w-full h-full bg-zinc-800 flex items-center justify-center">
                      <svg className="w-6 h-6 text-red-500" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 2l5 5h-5V4z" />
                      </svg>
                    </div>
                  ) : (
                    <img src={url} alt={`Thumbnail ${idx + 1}`} className="w-full h-full object-cover" />
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-[10px] text-center text-white py-0.5">
                    {idx + 1}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
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
          {hasChanges && (
            <span className="px-2.5 py-1.5 bg-amber-500/20 text-amber-400 text-xs rounded-full border border-amber-500/30 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
              {getChangeCount()} changes
            </span>
          )}
          <button onClick={handleNewExtraction} className="px-3 py-2 bg-[#1a1a1d] hover:bg-[#242428] text-zinc-300 text-sm rounded-lg transition-colors border border-[#2a2a2e] flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New
          </button>
        </div>
      </div>

      {/* Main Content */}
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
                  <span className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold ${activeDoc === 'hp' ? 'bg-blue-500 text-white' : 'bg-zinc-700 text-zinc-400'}`}>HP</span>
                  History & Physical
                  {getDocUrls('hp').length > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 bg-blue-500/30 rounded text-[10px]">
                      {getDocUrls('hp').length} doc{getDocUrls('hp').length > 1 ? 's' : ''}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setActiveDoc('op')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${activeDoc === 'op'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                    : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                >
                  <span className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold ${activeDoc === 'op' ? 'bg-emerald-500 text-white' : 'bg-zinc-700 text-zinc-400'}`}>OP</span>
                  Operative Report
                  {getDocUrls('op').length > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 bg-emerald-500/30 rounded text-[10px]">
                      {getDocUrls('op').length} doc{getDocUrls('op').length > 1 ? 's' : ''}
                    </span>
                  )}
                </button>
              </div>

              <div className="flex items-center gap-2">
                {viewMode === 'document' && hasDocuments && (
                  <button
                    onClick={() => setIsFullscreen(true)}
                    className="p-2 hover:bg-[#1a1a1d] rounded-lg transition-colors border border-[#1e1e22]"
                    title="Fullscreen"
                  >
                    <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                  </button>
                )}
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
            </div>

            {/* View Mode Tabs */}
            <div className="flex gap-1 bg-[#0a0a0b] rounded-lg p-1">
              <ViewModeButton active={viewMode === 'summary'} onClick={() => setViewMode('summary')} icon="summary" label="AI Summary" />
              <ViewModeButton active={viewMode === 'original'} onClick={() => setViewMode('original')} icon="text" label="Original Text" />
              <ViewModeButton
                active={viewMode === 'document'}
                onClick={() => setViewMode('document')}
                icon={currentFileType === 'pdf' ? 'pdf' : 'image'}
                label={`Document${isMultiDoc ? 's' : ''}`}
                badge={hasDocuments ? currentDocUrls.length : null}
              />
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

            {viewMode === 'document' && (
              <div className="h-full flex flex-col">
                {!hasDocuments ? (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                      <svg className="w-16 h-16 text-zinc-700 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <p className="text-zinc-500 text-sm">No document URLs found</p>
                      <p className="text-zinc-600 text-xs mt-1">Only extracted text is available</p>

                      {/* Debug: Show available fields */}
                      <details className="mt-4 text-left">
                        <summary className="text-zinc-600 text-xs cursor-pointer hover:text-zinc-400">
                          Debug: Show icdCodes fields
                        </summary>
                        <pre className="mt-2 p-2 bg-zinc-900 rounded text-[10px] text-zinc-500 max-h-40 overflow-auto">
                          {JSON.stringify(Object.keys(icdCodes || {}), null, 2)}
                        </pre>
                      </details>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Document Navigation Bar */}
                    {isMultiDoc && (
                      <div className="px-4 py-2 bg-[#0d0d0f] border-b border-[#1e1e22] flex items-center justify-between">
                        <button
                          onClick={goToPrevDoc}
                          disabled={currentDocIndex === 0}
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-colors ${currentDocIndex === 0
                              ? 'text-zinc-600 cursor-not-allowed'
                              : 'text-zinc-400 hover:text-white hover:bg-[#1a1a1d]'
                            }`}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                          </svg>
                          Previous
                        </button>

                        <div className="flex items-center gap-2">
                          {currentDocUrls.map((_, idx) => (
                            <button
                              key={idx}
                              onClick={() => { setCurrentDocIndex(idx); setImageZoom(1); }}
                              className={`w-8 h-8 rounded-lg text-xs font-medium transition-all ${idx === currentDocIndex
                                  ? 'bg-purple-500 text-white'
                                  : 'bg-[#1a1a1d] text-zinc-400 hover:bg-[#242428]'
                                }`}
                            >
                              {idx + 1}
                            </button>
                          ))}
                        </div>

                        <button
                          onClick={goToNextDoc}
                          disabled={currentDocIndex === currentDocUrls.length - 1}
                          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-colors ${currentDocIndex === currentDocUrls.length - 1
                              ? 'text-zinc-600 cursor-not-allowed'
                              : 'text-zinc-400 hover:text-white hover:bg-[#1a1a1d]'
                            }`}
                        >
                          Next
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      </div>
                    )}

                    {/* Document Viewer */}
                    <div className="flex-1 relative">
                      {currentDocUrl ? (
                        imageLoadErrors[currentDocIndex] ? (
                          <div className="flex items-center justify-center h-full">
                            <div className="text-center p-8">
                              <svg className="w-16 h-16 text-zinc-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                              </svg>
                              <p className="text-zinc-500">Failed to load document</p>
                              <p className="text-zinc-600 text-xs mt-2 max-w-md break-all">{currentDocUrl}</p>
                              <button
                                onClick={() => setImageLoadErrors(prev => ({ ...prev, [currentDocIndex]: false }))}
                                className="mt-4 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm rounded-lg"
                              >
                                Retry
                              </button>
                            </div>
                          </div>
                        ) : isCurrentDocPdf ? (
                          <iframe
                            src={currentDocUrl}
                            className="w-full h-full border-0"
                            title={`${activeDoc.toUpperCase()} Document ${currentDocIndex + 1}`}
                          />
                        ) : (
                          <div className="p-4 flex items-center justify-center h-full bg-[#080809] overflow-auto">
                            <img
                              src={currentDocUrl}
                              alt={`${activeDoc.toUpperCase()} Document ${currentDocIndex + 1}`}
                              className="max-w-full max-h-full object-contain rounded-lg shadow-2xl cursor-pointer hover:opacity-90 transition-opacity"
                              onClick={() => setIsFullscreen(true)}
                              onError={() => handleImageError(currentDocIndex)}
                            />
                          </div>
                        )
                      ) : (
                        <div className="flex items-center justify-center h-full text-zinc-500">
                          No document available
                        </div>
                      )}
                    </div>

                    {/* Thumbnail Strip for Multiple Documents */}
                    {isMultiDoc && (
                      <div className="px-4 py-3 bg-[#0d0d0f] border-t border-[#1e1e22]">
                        <div className="flex gap-2 overflow-auto pb-1">
                          {currentDocUrls.map((url, idx) => (
                            <button
                              key={idx}
                              onClick={() => { setCurrentDocIndex(idx); setImageZoom(1); }}
                              className={`relative flex-shrink-0 w-20 h-16 rounded-lg overflow-hidden border-2 transition-all ${idx === currentDocIndex
                                  ? 'border-purple-500 ring-2 ring-purple-500/30'
                                  : 'border-[#2a2a2e] hover:border-zinc-600'
                                }`}
                            >
                              {getUrlFileType(url) === 'pdf' ? (
                                <div className="w-full h-full bg-[#1a1a1d] flex flex-col items-center justify-center">
                                  <svg className="w-6 h-6 text-red-500" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 2l5 5h-5V4z" />
                                  </svg>
                                  <span className="text-[9px] text-zinc-500 mt-1">PDF</span>
                                </div>
                              ) : (
                                <img
                                  src={url}
                                  alt={`Thumb ${idx + 1}`}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                    e.target.parentElement.innerHTML = `<div class="w-full h-full bg-zinc-800 flex items-center justify-center text-zinc-500 text-xs">Error</div>`;
                                  }}
                                />
                              )}
                              <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-[10px] text-center text-white py-0.5">
                                {idx + 1}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Resizable Divider */}
        <div
          onMouseDown={handleMouseDown}
          className={`absolute top-0 bottom-0 w-1.5 cursor-col-resize z-10 group transition-colors ${isResizing ? 'bg-purple-500' : 'bg-[#1e1e22] hover:bg-purple-500/50'}`}
          style={{ right: codesPanelWidth - 3 }}
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-1 h-1 rounded-full bg-zinc-400"></div>
            <div className="w-1 h-1 rounded-full bg-zinc-400"></div>
            <div className="w-1 h-1 rounded-full bg-zinc-400"></div>
          </div>
        </div>

        {/* Right Panel - Codes */}
        <div
          className="absolute top-0 bottom-0 right-0 flex flex-col overflow-hidden bg-[#0d0d0f] border-l border-[#1e1e22]"
          style={{ width: codesPanelWidth }}
        >
          <div className="p-3 border-b border-[#1e1e22] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-white">Medical Codes</h3>
              <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-[10px] rounded-full border border-purple-500/30">
                AI Generated
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-zinc-500">Tokens: {icdCodes.tokens_used || 0}</span>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-3 space-y-2">
            <CompactCodeRow
              label="Admit DX"
              value={localCodes.admit_dx}
              isEditMode={editMode.admit_dx}
              onToggleEdit={() => toggleEditMode('admit_dx')}
              onUpdate={(val, reason) => handleUpdateSingleCode('admit_dx', val, reason)}
              onCopy={() => handleCopy(localCodes.admit_dx, 'admit_dx')}
              copySuccess={copySuccess === 'admit_dx'}
              reasons={EDIT_REASONS.change}
              originalValue={icdCodes?.admit_dx}
            />
            <CompactCodeRow
              label="PDX"
              value={localCodes.pdx}
              isEditMode={editMode.pdx}
              onToggleEdit={() => toggleEditMode('pdx')}
              onUpdate={(val, reason) => handleUpdateSingleCode('pdx', val, reason)}
              onCopy={() => handleCopy(localCodes.pdx, 'pdx')}
              copySuccess={copySuccess === 'pdx'}
              highlight
              reasons={EDIT_REASONS.change}
              originalValue={icdCodes?.pdx}
            />
            <CompactTagRow
              label="SDX"
              codes={localCodes.sdx}
              pendingCodes={pendingCodes.sdx}
              isEditMode={editMode.sdx}
              onToggleEdit={() => toggleEditMode('sdx')}
              onRemove={(code, reason) => handleRemoveCode('sdx', code, reason)}
              onRemovePending={(code) => handleRemovePendingCode('sdx', code)}
              onAddPending={(code, reason) => handleAddPendingCode('sdx', code, reason)}
              onCopy={() => handleCopy(localCodes.sdx, 'sdx')}
              copySuccess={copySuccess === 'sdx'}
              removalReasons={EDIT_REASONS.removal}
              additionReasons={EDIT_REASONS.addition}
              pendingReasons={editReasons.sdx.additions}
            />
            <CompactTagRow
              label="CPT"
              codes={localCodes.cpt}
              pendingCodes={pendingCodes.cpt}
              isEditMode={editMode.cpt}
              onToggleEdit={() => toggleEditMode('cpt')}
              onRemove={(code, reason) => handleRemoveCode('cpt', code, reason)}
              onRemovePending={(code) => handleRemovePendingCode('cpt', code)}
              onAddPending={(code, reason) => handleAddPendingCode('cpt', code, reason)}
              onCopy={() => handleCopy(localCodes.cpt, 'cpt')}
              copySuccess={copySuccess === 'cpt'}
              tagColor="blue"
              removalReasons={EDIT_REASONS.removal}
              additionReasons={EDIT_REASONS.addition}
              pendingReasons={editReasons.cpt.additions}
            />
            <CompactCodeRow
              label="Modifier"
              value={localCodes.modifier}
              isEditMode={editMode.modifier}
              onToggleEdit={() => toggleEditMode('modifier')}
              onUpdate={(val, reason) => handleUpdateSingleCode('modifier', val, reason)}
              onCopy={() => handleCopy(localCodes.modifier, 'modifier')}
              copySuccess={copySuccess === 'modifier'}
              reasons={EDIT_REASONS.change}
              originalValue={icdCodes?.modifier}
            />

            {/* Remarks */}
            <div className="pt-2">
              <label className="text-[10px] text-zinc-500 mb-1 block uppercase tracking-wider">Remarks</label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Add notes or additional context for your changes..."
                className="w-full h-24 bg-[#111113] border border-[#1e1e22] rounded-lg p-3 text-zinc-300 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-purple-500/50 focus:border-purple-500/50 placeholder-zinc-600 transition-all"
              />
            </div>

            {/* Changes Summary */}
            {hasChanges && (
              <div className="pt-2">
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span className="text-amber-400 text-xs font-medium">Pending Changes</span>
                  </div>
                  <p className="text-zinc-400 text-xs">
                    You have {getChangeCount()} unsaved change(s). Click "Submit Changes" to save.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="p-3 border-t border-[#1e1e22] flex gap-2 shrink-0">
            <button
              onClick={handleApprove}
              disabled={isSubmitting}
              className={`flex-1 px-3 py-2.5 text-white text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2 ${hasChanges
                ? 'bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400'
                : 'bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400'
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
              ) : hasChanges ? (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Submit Changes
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Approve
                </>
              )}
            </button>
            <button
              onClick={handleSave}
              className="px-3 py-2.5 bg-[#1a1a1d] hover:bg-[#242428] text-zinc-300 text-sm font-medium rounded-lg transition-colors border border-[#2a2a2e]"
              title="Download JSON"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================
// Helper Components
// ============================================

const InfoPill = ({ label, value }) => (
  <div className="bg-[#111113] border border-[#1e1e22] rounded-lg px-3 py-1.5 flex items-center gap-2">
    <span className="text-zinc-500 text-[10px] uppercase">{label}</span>
    <span className="text-white font-mono text-xs">{value || 'N/A'}</span>
  </div>
);

const ViewModeButton = ({ active, onClick, icon, label, badge, disabled }) => {
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
      disabled={disabled}
      className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${disabled
          ? 'text-zinc-600 cursor-not-allowed'
          : active
            ? 'bg-[#1a1a1d] text-white'
            : 'text-zinc-500 hover:text-zinc-300'
        }`}
    >
      {getIcon()}
      {label}
      {badge && (
        <span className="px-1.5 py-0.5 bg-purple-500/30 text-purple-300 text-[10px] rounded-full">
          {badge}
        </span>
      )}
    </button>
  );
};

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

const SummaryBlock = ({ title, content, color }) => (
  <div className="bg-[#111113] rounded-xl p-4 border border-[#1e1e22]">
    <div className="text-zinc-500 text-xs uppercase tracking-wider mb-2">{title}</div>
    <p className={`text-sm leading-relaxed ${color === 'emerald' ? 'text-emerald-400' : color === 'red' ? 'text-red-400' : 'text-zinc-300'}`}>{content}</p>
  </div>
);

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

const VitalBadge = ({ label, value }) => (
  <div className="bg-[#0a0a0b] rounded-lg px-3 py-2 border border-[#1a1a1d]">
    <span className="text-zinc-500 text-xs">{label}</span>
    <div className="text-zinc-200 text-sm font-medium">{value}</div>
  </div>
);

const ReasonSelect = ({ reasons, value, onChange, placeholder = "Select reason...", compact = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredReasons = reasons.filter(r =>
    r.label.toLowerCase().includes(search.toLowerCase()) ||
    r.description.toLowerCase().includes(search.toLowerCase())
  );

  const selectedReason = reasons.find(r => r.id === value);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between gap-2 bg-[#0a0a0b] border rounded-lg transition-all ${isOpen ? 'border-purple-500 ring-1 ring-purple-500/30' : 'border-[#2a2a2e] hover:border-zinc-600'} ${compact ? 'px-2 py-1.5 text-xs' : 'px-3 py-2 text-sm'}`}
      >
        <span className={selectedReason ? 'text-white' : 'text-zinc-500'}>
          {selectedReason ? selectedReason.label : placeholder}
        </span>
        <svg className={`w-4 h-4 text-zinc-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-[#111113] border border-[#2a2a2e] rounded-lg shadow-xl overflow-hidden">
          <div className="p-2 border-b border-[#1e1e22]">
            <input
              type="text"
              placeholder="Search reasons..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-2 py-1.5 bg-[#0a0a0b] border border-[#2a2a2e] rounded text-sm text-white placeholder-zinc-500 outline-none focus:border-purple-500"
              autoFocus
            />
          </div>
          <div className="max-h-48 overflow-auto">
            {filteredReasons.length === 0 ? (
              <div className="px-3 py-2 text-zinc-500 text-sm">No reasons found</div>
            ) : (
              filteredReasons.map((reason) => (
                <button
                  key={reason.id}
                  type="button"
                  onClick={() => {
                    onChange(reason.id);
                    setIsOpen(false);
                    setSearch('');
                  }}
                  className={`w-full px-3 py-2 text-left hover:bg-[#1a1a1d] transition-colors ${value === reason.id ? 'bg-purple-500/20' : ''}`}
                >
                  <div className="text-sm text-white">{reason.label}</div>
                  <div className="text-xs text-zinc-500">{reason.description}</div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const CompactCodeRow = ({ label, value, isEditMode, onToggleEdit, onUpdate, onCopy, copySuccess, highlight, reasons = [], originalValue }) => {
  const [inputValue, setInputValue] = useState(value);
  const [selectedReason, setSelectedReason] = useState('');

  useEffect(() => { setInputValue(value); }, [value]);

  const isChanged = inputValue.trim().toUpperCase() !== (originalValue || '').trim().toUpperCase();

  const handleSave = () => {
    if (isChanged && !selectedReason) {
      alert('Please select a reason for the change');
      return;
    }
    onUpdate(inputValue, selectedReason);
    setSelectedReason('');
    onToggleEdit();
  };

  const handleCancel = () => {
    setInputValue(value);
    setSelectedReason('');
    onToggleEdit();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSave();
    else if (e.key === 'Escape') handleCancel();
  };

  return (
    <div className={`bg-[#111113] rounded-lg border transition-all ${isEditMode ? 'border-purple-500/50 ring-1 ring-purple-500/20' : 'border-[#1e1e22]'} p-2.5`}>
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
          {isEditMode ? (
            <>
              <button onClick={handleCancel} className="p-1.5 hover:bg-[#1a1a1d] rounded-md transition-colors text-zinc-500">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <button onClick={handleSave} className="p-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-md transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </button>
            </>
          ) : (
            <button onClick={onToggleEdit} className="p-1.5 hover:bg-[#1a1a1d] text-zinc-500 rounded-md transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {isEditMode && isChanged && (
        <div className="mt-2 pt-2 border-t border-[#1e1e22]">
          <label className="text-[10px] text-amber-400 mb-1.5 block uppercase tracking-wider flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Reason for change (required)
          </label>
          <ReasonSelect
            reasons={reasons}
            value={selectedReason}
            onChange={setSelectedReason}
            placeholder="Why are you changing this code?"
            compact
          />
        </div>
      )}
    </div>
  );
};

const CompactTagRow = ({
  label, codes, pendingCodes, isEditMode, onToggleEdit, onRemove, onRemovePending, onAddPending,
  onCopy, copySuccess, tagColor = 'default', removalReasons = [], additionReasons = [], pendingReasons = {}
}) => {
  const [newCode, setNewCode] = useState('');
  const [newCodeReason, setNewCodeReason] = useState('');
  const [duplicateCode, setDuplicateCode] = useState(null);
  const [codeToRemove, setCodeToRemove] = useState(null);
  const [removalReason, setRemovalReason] = useState('');

  const handleAddCode = () => {
    if (!newCode.trim()) return;
    if (!newCodeReason) {
      alert('Please select a reason for adding this code');
      return;
    }
    const result = onAddPending(newCode, newCodeReason);
    if (result.success) {
      setNewCode('');
      setNewCodeReason('');
      setDuplicateCode(null);
    } else if (result.error === 'duplicate' || result.error === 'duplicate-pending') {
      setDuplicateCode(result.existingCode);
      setTimeout(() => setDuplicateCode(null), 2000);
    }
  };

  const handleRemoveCode = (code) => {
    if (!removalReason) {
      setCodeToRemove(code);
      return;
    }
    onRemove(code, removalReason);
    setCodeToRemove(null);
    setRemovalReason('');
  };

  const confirmRemoval = () => {
    if (!removalReason) {
      alert('Please select a reason for removing this code');
      return;
    }
    onRemove(codeToRemove, removalReason);
    setCodeToRemove(null);
    setRemovalReason('');
  };

  const handleKeyDown = (e) => { if (e.key === 'Enter') handleAddCode(); };

  const getTagColors = (code, isPending = false) => {
    if (code === duplicateCode) return 'bg-red-500/30 border-red-500 text-red-300';
    if (isPending) return 'bg-amber-500/20 border-amber-500/50 text-amber-300 border-dashed';
    if (tagColor === 'blue') return 'bg-blue-500/15 border-blue-500/30 text-blue-300';
    return 'bg-[#1a1a1d] border-[#2a2a2e] text-zinc-300';
  };

  const getReasonLabel = (reasonId) => {
    const reason = additionReasons.find(r => r.id === reasonId);
    return reason ? reason.label : reasonId;
  };

  return (
    <div className={`bg-[#111113] rounded-lg border transition-all ${isEditMode ? 'border-purple-500/50 ring-1 ring-purple-500/20' : 'border-[#1e1e22]'} p-2.5`}>
      <div className="flex items-start gap-2">
        <div className="w-16 shrink-0 pt-1.5">
          <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">{label}</span>
          <div className="text-[9px] text-zinc-600 mt-0.5">{codes.length} codes</div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="bg-[#0a0a0b] rounded-md p-2 min-h-[36px] border border-[#1a1a1d]">
            <div className="flex flex-wrap gap-1.5">
              {codes.map((code) => (
                <div key={code} className={`group inline-flex items-center gap-1.5 px-2 py-1 rounded-md border font-mono text-xs ${getTagColors(code)}`}>
                  <span>{code}</span>
                  {isEditMode && (
                    <button onClick={() => handleRemoveCode(code)} className="w-3.5 h-3.5 rounded-full bg-zinc-700 hover:bg-red-500 flex items-center justify-center transition-colors">
                      <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}

              {isEditMode && pendingCodes.map((code) => (
                <div key={`pending-${code}`} className="group relative">
                  <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border font-mono text-xs ${getTagColors(code, true)}`}>
                    <span>{code}</span>
                    <button onClick={() => onRemovePending(code)} className="w-3.5 h-3.5 rounded-full bg-amber-600 hover:bg-red-500 flex items-center justify-center transition-colors">
                      <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  {pendingReasons[code] && (
                    <div className="absolute bottom-full left-0 mb-1 px-2 py-1 bg-amber-500/20 border border-amber-500/30 rounded text-[10px] text-amber-300 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      {getReasonLabel(pendingReasons[code])}
                    </div>
                  )}
                </div>
              ))}

              {codes.length === 0 && pendingCodes.length === 0 && !isEditMode && (
                <span className="text-zinc-600 text-xs py-1">No codes</span>
              )}
            </div>
          </div>

          {isEditMode && codeToRemove && (
            <div className="mt-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                <span className="text-red-400 text-sm font-medium">Remove "{codeToRemove}"?</span>
              </div>
              <ReasonSelect
                reasons={removalReasons}
                value={removalReason}
                onChange={setRemovalReason}
                placeholder="Why are you removing this code?"
                compact
              />
              <div className="flex gap-2 mt-2">
                <button onClick={() => { setCodeToRemove(null); setRemovalReason(''); }} className="flex-1 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white text-xs rounded-md transition-colors">
                  Cancel
                </button>
                <button onClick={confirmRemoval} className="flex-1 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs rounded-md transition-colors">
                  Confirm Remove
                </button>
              </div>
            </div>
          )}

          {isEditMode && !codeToRemove && (
            <div className="mt-2 space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter code..."
                  className={`flex-1 px-3 py-2 bg-[#0a0a0b] border rounded-md text-white font-mono text-sm outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30 transition-all ${duplicateCode ? 'border-red-500' : 'border-[#2a2a2e]'}`}
                />
              </div>

              {newCode.trim() && (
                <div className="space-y-2">
                  <label className="text-[10px] text-emerald-400 block uppercase tracking-wider flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Reason for adding (required)
                  </label>
                  <ReasonSelect
                    reasons={additionReasons}
                    value={newCodeReason}
                    onChange={setNewCodeReason}
                    placeholder="Why are you adding this code?"
                    compact
                  />
                  <button
                    onClick={handleAddCode}
                    disabled={!newCode.trim() || !newCodeReason}
                    className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed text-white text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Code
                  </button>
                </div>
              )}
            </div>
          )}

          {duplicateCode && <div className="mt-1.5 text-red-400 text-xs">"{duplicateCode}" already exists</div>}
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

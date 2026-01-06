import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const backUrl = import.meta.env.VITE_BACKEND_URL;
const API_CONFIG = { ANALYTICS_URL: `${backUrl}/analytics` };

const AnalyticsPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [viewerModal, setViewerModal] = useState(null);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(API_CONFIG.ANALYTICS_URL);
      if (!response.ok) throw new Error('Failed to fetch analytics');
      const result = await response.json();
      if (result.success) {
        setData(result);
      } else {
        throw new Error(result.error || 'Unknown error');
      }
    } catch (err) {
      console.error('Analytics fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getAccuracyColor = (percentage) => {
    const num = parseFloat(percentage) || 0;
    if (num >= 90) return 'text-emerald-400';
    if (num >= 70) return 'text-amber-400';
    return 'text-red-400';
  };

  const getAccuracyBgColor = (percentage) => {
    const num = parseFloat(percentage) || 0;
    if (num >= 90) return 'bg-emerald-500/20';
    if (num >= 70) return 'bg-amber-500/20';
    return 'bg-red-500/20';
  };

  // ============================================
  // Helper to get document URLs (supports both single and multiple)
  // ============================================
  const getDocUrls = (record, reportType) => {
    const isHp = reportType === 'hp';

    // Try array URLs first
    const urlsArray = isHp ? record.s3_hp_doc_urls : record.s3_op_doc_urls;
    if (urlsArray && Array.isArray(urlsArray) && urlsArray.length > 0) {
      return urlsArray.filter(url => url);
    }

    // Fallback to single URL
    const singleUrl = isHp ? record.s3_hp_doc_url : record.s3_op_doc_url;
    if (singleUrl) {
      return [singleUrl];
    }

    return [];
  };

  // ============================================
  // Helper to get file type for a URL
  // ============================================
  const getFileTypeForUrl = (url, record, reportType) => {
    if (!url) return 'text';

    // Check URL extension first
    const urlLower = url.toLowerCase();
    if (urlLower.endsWith('.pdf')) return 'pdf';
    if (urlLower.match(/\.(jpg|jpeg|png|gif|webp)$/)) return 'image';

    // Fallback to record's file type
    const isHp = reportType === 'hp';
    const fileType = isHp ? record.hp_file_type : record.op_file_type;

    if (fileType === 'pdf') return 'pdf';
    if (fileType === 'image' || fileType === 'multi-image') return 'image';

    return 'text';
  };

  // ============================================
  // Open document viewer with multi-document support
  // ============================================
  const openDocumentViewer = (record, type, reportType) => {
    const isHp = reportType === 'hp';
    const summaryUrl = isHp ? record.s3_hp_summary_url : record.s3_op_summary_url;
    const summary = isHp ? record.ai_summary_hp : record.ai_summary_op;
    const text = isHp ? record.hp_text : record.op_text;

    if (type === 'summary') {
      setViewerModal({
        type: 'summary',
        title: `${isHp ? 'HP' : 'OP'} AI Summary`,
        content: summary,
        url: summaryUrl
      });
    } else if (type === 'document') {
      const docUrls = getDocUrls(record, reportType);

      if (docUrls.length > 0) {
        // Has document URLs - show document viewer
        setViewerModal({
          type: 'multi-document',
          title: `${isHp ? 'HP' : 'OP'} Document${docUrls.length > 1 ? 's' : ''}`,
          urls: docUrls,
          currentIndex: 0,
          record,
          reportType,
          fallbackText: text
        });
      } else if (text) {
        // No URLs but has text - show text
        setViewerModal({
          type: 'text',
          title: `${isHp ? 'HP' : 'OP'} Document`,
          content: text
        });
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-zinc-400">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl text-white mb-2">Failed to load analytics</h2>
          <p className="text-zinc-400 mb-4">{error}</p>
          <button onClick={fetchAnalytics} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/')} className="p-2 hover:bg-zinc-800 rounded-lg transition-colors">
              <svg className="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">AI Analytics</h1>
              <p className="text-zinc-500 text-sm">Performance metrics and accuracy tracking</p>
            </div>
          </div>
          <button onClick={fetchAnalytics} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-lg transition-colors flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </button>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <p className="text-zinc-500 text-sm">Total Records</p>
                <p className="text-3xl font-bold text-white">{data?.statistics?.total_records || 0}</p>
              </div>
            </div>
          </div>

          <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <p className="text-zinc-500 text-sm">Average Accuracy</p>
                <p className={`text-3xl font-bold ${getAccuracyColor(data?.statistics?.average_accuracy)}`}>
                  {data?.statistics?.average_accuracy?.toFixed(1) || 0}%
                </p>
              </div>
            </div>
          </div>

          <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <p className="text-zinc-500 text-sm">Completed Today</p>
                <p className="text-3xl font-bold text-white">{data?.statistics?.completed_today || 0}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Records Table */}
        <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 overflow-hidden">
          <div className="px-6 py-4 border-b border-zinc-800/50">
            <h2 className="text-lg font-semibold text-white">Extraction Records</h2>
          </div>

          {data?.records?.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-zinc-800/30">
                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase">MR #</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase">Acct #</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase">DOS</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-zinc-400 uppercase">Accuracy</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-zinc-400 uppercase">Documents</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-400 uppercase">Date</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-zinc-400 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {data.records.map((record) => {
                    const hpDocCount = getDocUrls(record, 'hp').length;
                    const opDocCount = getDocUrls(record, 'op').length;

                    return (
                      <tr key={record.id} className="hover:bg-zinc-800/20 transition-colors">
                        <td className="px-4 py-3 text-sm font-mono text-white">{record.mr_number || 'N/A'}</td>
                        <td className="px-4 py-3 text-sm font-mono text-zinc-300">{record.acct_number || 'N/A'}</td>
                        <td className="px-4 py-3 text-sm text-zinc-300">{record.dos || 'N/A'}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-sm font-medium ${getAccuracyBgColor(record.accuracy_percentage)} ${getAccuracyColor(record.accuracy_percentage)}`}>
                            {parseFloat(record.accuracy_percentage)?.toFixed(1) || 0}%
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-2">
                            {/* HP Documents */}
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-blue-400 font-medium">HP:</span>
                              {(hpDocCount > 0 || record.hp_text) && (
                                <button
                                  onClick={() => openDocumentViewer(record, 'document', 'hp')}
                                  className="p-1 hover:bg-zinc-700 rounded transition-colors flex items-center gap-0.5"
                                  title={`View HP Document${hpDocCount > 1 ? 's' : ''}`}
                                >
                                  <DocIcon type={record.hp_file_type} />
                                  {hpDocCount > 1 && (
                                    <span className="text-[10px] bg-blue-500/30 text-blue-300 px-1 rounded">
                                      {hpDocCount}
                                    </span>
                                  )}
                                </button>
                              )}
                              {(record.s3_hp_summary_url || record.ai_summary_hp) && (
                                <button
                                  onClick={() => openDocumentViewer(record, 'summary', 'hp')}
                                  className="p-1 hover:bg-zinc-700 rounded transition-colors"
                                  title="View HP Summary"
                                >
                                  <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                  </svg>
                                </button>
                              )}
                            </div>
                            <span className="text-zinc-600">|</span>
                            {/* OP Documents */}
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-emerald-400 font-medium">OP:</span>
                              {(opDocCount > 0 || record.op_text) && (
                                <button
                                  onClick={() => openDocumentViewer(record, 'document', 'op')}
                                  className="p-1 hover:bg-zinc-700 rounded transition-colors flex items-center gap-0.5"
                                  title={`View OP Document${opDocCount > 1 ? 's' : ''}`}
                                >
                                  <DocIcon type={record.op_file_type} />
                                  {opDocCount > 1 && (
                                    <span className="text-[10px] bg-emerald-500/30 text-emerald-300 px-1 rounded">
                                      {opDocCount}
                                    </span>
                                  )}
                                </button>
                              )}
                              {(record.s3_op_summary_url || record.ai_summary_op) && (
                                <button
                                  onClick={() => openDocumentViewer(record, 'summary', 'op')}
                                  className="p-1 hover:bg-zinc-700 rounded transition-colors"
                                  title="View OP Summary"
                                >
                                  <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-zinc-400">
                          {new Date(record.updated_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => setSelectedRecord(record)}
                            className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs rounded-lg transition-colors"
                          >
                            Details
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
              </div>
              <p className="text-zinc-400">No completed extractions yet</p>
              <p className="text-zinc-600 text-sm mt-1">Records will appear here after you complete extractions</p>
            </div>
          )}
        </div>

        {/* Detail Modal */}
        {selectedRecord && (
          <DetailModal
            record={selectedRecord}
            onClose={() => setSelectedRecord(null)}
            getAccuracyColor={getAccuracyColor}
            openDocumentViewer={openDocumentViewer}
            getDocUrls={getDocUrls}
          />
        )}

        {/* Document/Summary Viewer Modal */}
        {viewerModal && (
          <ViewerModal
            modal={viewerModal}
            onClose={() => setViewerModal(null)}
            setViewerModal={setViewerModal}
            getFileTypeForUrl={getFileTypeForUrl}
          />
        )}
      </div>
    </div>
  );
};

// Document Icon Component
const DocIcon = ({ type }) => {
  if (type === 'pdf') {
    return (
      <svg className="w-4 h-4 text-red-400" fill="currentColor" viewBox="0 0 24 24">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 2l5 5h-5V4zM8.5 13H7v4h1v-1.5h.5a1.5 1.5 0 000-3H8zm0 1h.5a.5.5 0 010 1h-.5v-1zm3 .5a1.5 1.5 0 013 0v1a1.5 1.5 0 01-3 0v-1zm1 0a.5.5 0 011 0v1a.5.5 0 01-1 0v-1zm3.5-.5h2v1h-1v.5h1v1h-1V17h-1v-4z" />
      </svg>
    );
  }
  if (type === 'image' || type === 'multi-image') {
    return (
      <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    );
  }
  return (
    <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
};

// Viewer Modal Component - Updated with multi-document support
const ViewerModal = ({ modal, onClose, setViewerModal, getFileTypeForUrl }) => {
  const [currentIndex, setCurrentIndex] = useState(modal.currentIndex || 0);
  const [imageZoom, setImageZoom] = useState(1);
  const [imageError, setImageError] = useState(false);

  // For multi-document view
  const isMultiDoc = modal.type === 'multi-document';
  const urls = isMultiDoc ? modal.urls : [];
  const totalDocs = urls.length;
  const currentUrl = isMultiDoc ? urls[currentIndex] : modal.url;
  const currentFileType = isMultiDoc
    ? getFileTypeForUrl(currentUrl, modal.record, modal.reportType)
    : modal.type;

  // Reset state when modal changes
  useEffect(() => {
    setCurrentIndex(modal.currentIndex || 0);
    setImageZoom(1);
    setImageError(false);
  }, [modal]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isMultiDoc) return;
      if (e.key === 'ArrowLeft' && currentIndex > 0) {
        setCurrentIndex(prev => prev - 1);
        setImageZoom(1);
        setImageError(false);
      } else if (e.key === 'ArrowRight' && currentIndex < totalDocs - 1) {
        setCurrentIndex(prev => prev + 1);
        setImageZoom(1);
        setImageError(false);
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMultiDoc, currentIndex, totalDocs, onClose]);

  const goToPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setImageZoom(1);
      setImageError(false);
    }
  };

  const goToNext = () => {
    if (currentIndex < totalDocs - 1) {
      setCurrentIndex(prev => prev + 1);
      setImageZoom(1);
      setImageError(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-zinc-900 rounded-2xl border border-zinc-800 max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-white">{modal.title}</h3>
            {isMultiDoc && totalDocs > 1 && (
              <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 text-xs rounded-full">
                {currentIndex + 1} of {totalDocs}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Zoom controls for images */}
            {(currentFileType === 'image' || (isMultiDoc && getFileTypeForUrl(currentUrl, modal.record, modal.reportType) === 'image')) && (
              <div className="flex items-center gap-1 mr-2">
                <button
                  onClick={() => setImageZoom(prev => Math.max(0.25, prev - 0.25))}
                  className="p-1.5 hover:bg-zinc-800 rounded transition-colors"
                  title="Zoom out"
                >
                  <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                  </svg>
                </button>
                <span className="text-xs text-zinc-400 w-12 text-center">{Math.round(imageZoom * 100)}%</span>
                <button
                  onClick={() => setImageZoom(prev => Math.min(4, prev + 0.25))}
                  className="p-1.5 hover:bg-zinc-800 rounded transition-colors"
                  title="Zoom in"
                >
                  <svg className="w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
                <button
                  onClick={() => setImageZoom(1)}
                  className="px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-800 rounded transition-colors"
                >
                  Reset
                </button>
              </div>
            )}
            {currentUrl && (
              <a
                href={currentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs rounded-lg transition-colors flex items-center gap-1"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                Open in new tab
              </a>
            )}
            <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-lg transition-colors">
              <svg className="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6 relative">
          {/* Multi-document navigation arrows */}
          {isMultiDoc && totalDocs > 1 && (
            <>
              <button
                onClick={goToPrev}
                disabled={currentIndex === 0}
                className={`absolute left-2 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full transition-all ${currentIndex === 0
                    ? 'bg-zinc-800/30 text-zinc-600 cursor-not-allowed'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-white'
                  }`}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={goToNext}
                disabled={currentIndex === totalDocs - 1}
                className={`absolute right-2 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full transition-all ${currentIndex === totalDocs - 1
                    ? 'bg-zinc-800/30 text-zinc-600 cursor-not-allowed'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-white'
                  }`}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </>
          )}

          {/* PDF Viewer */}
          {(modal.type === 'pdf' || (isMultiDoc && getFileTypeForUrl(currentUrl, modal.record, modal.reportType) === 'pdf')) && currentUrl && (
            <iframe
              src={currentUrl}
              className="w-full h-[70vh] rounded-lg border border-zinc-700"
              title="PDF Viewer"
            />
          )}

          {/* Image Viewer */}
          {(modal.type === 'image' || (isMultiDoc && getFileTypeForUrl(currentUrl, modal.record, modal.reportType) === 'image')) && currentUrl && (
            <div className="flex items-center justify-center overflow-auto" style={{ maxHeight: '70vh' }}>
              {imageError ? (
                <div className="text-center py-12">
                  <svg className="w-16 h-16 text-zinc-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <p className="text-zinc-400 mb-2">Failed to load image</p>
                  <p className="text-zinc-600 text-xs mb-4 font-mono break-all max-w-md">{currentUrl}</p>
                  <button
                    onClick={() => setImageError(false)}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm rounded-lg transition-colors"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <img
                  src={currentUrl}
                  alt={`Document ${currentIndex + 1}`}
                  className="max-w-full rounded-lg object-contain transition-transform duration-200"
                  style={{ transform: `scale(${imageZoom})`, transformOrigin: 'center' }}
                  onError={() => setImageError(true)}
                />
              )}
            </div>
          )}

          {/* Text Viewer */}
          {modal.type === 'text' && (
            <pre className="bg-zinc-800/50 rounded-lg p-4 text-zinc-300 text-sm font-mono whitespace-pre-wrap overflow-auto max-h-[70vh]">
              {modal.content}
            </pre>
          )}

          {/* Summary Viewer */}
          {modal.type === 'summary' && modal.content && (
            <div className="space-y-4">
              <SummaryDisplay summary={modal.content} />
            </div>
          )}

          {/* Fallback to text if no URL available */}
          {isMultiDoc && !currentUrl && modal.fallbackText && (
            <pre className="bg-zinc-800/50 rounded-lg p-4 text-zinc-300 text-sm font-mono whitespace-pre-wrap overflow-auto max-h-[70vh]">
              {modal.fallbackText}
            </pre>
          )}
        </div>

        {/* Thumbnail strip for multi-document */}
        {isMultiDoc && totalDocs > 1 && (
          <div className="px-6 py-3 border-t border-zinc-800 bg-zinc-900/80">
            <div className="flex gap-2 overflow-x-auto">
              {urls.map((url, index) => {
                const fileType = getFileTypeForUrl(url, modal.record, modal.reportType);
                const isActive = index === currentIndex;
                return (
                  <button
                    key={index}
                    onClick={() => {
                      setCurrentIndex(index);
                      setImageZoom(1);
                      setImageError(false);
                    }}
                    className={`flex-shrink-0 w-16 h-12 rounded-lg overflow-hidden border-2 transition-all ${isActive ? 'border-purple-500 ring-2 ring-purple-500/30' : 'border-zinc-700 hover:border-zinc-600'
                      }`}
                  >
                    {fileType === 'pdf' ? (
                      <div className="w-full h-full bg-zinc-800 flex items-center justify-center">
                        <svg className="w-6 h-6 text-red-400" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" />
                        </svg>
                      </div>
                    ) : (
                      <img
                        src={url}
                        alt={`Thumbnail ${index + 1}`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.target.style.display = 'none';
                          e.target.parentElement.innerHTML = `<div class="w-full h-full bg-zinc-800 flex items-center justify-center text-zinc-500 text-xs">${index + 1}</div>`;
                        }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Summary Display Component
const SummaryDisplay = ({ summary }) => {
  if (!summary) return <p className="text-zinc-500">No summary available</p>;

  // Helper to render list items (handles both strings and objects)
  const renderListItem = (item, i) => {
    if (typeof item === 'string') return <li key={i}>{item}</li>;
    if (item.name) {
      return (
        <li key={i}>
          <span className="font-medium">{item.name}</span>
          {item.dosage && <span className="text-zinc-400"> - {item.dosage}</span>}
          {item.instructions && <span className="text-zinc-500 text-xs"> ({item.instructions})</span>}
        </li>
      );
    }
    return <li key={i}>{JSON.stringify(item)}</li>;
  };

  return (
    <div className="space-y-4">
      {summary.chief_complaint && (
        <div className="bg-zinc-800/30 rounded-lg p-4">
          <h4 className="text-zinc-400 text-xs uppercase mb-2">Chief Complaint</h4>
          <p className="text-white">{summary.chief_complaint}</p>
        </div>
      )}

      {summary.history_of_present_illness && (
        <div className="bg-zinc-800/30 rounded-lg p-4">
          <h4 className="text-zinc-400 text-xs uppercase mb-2">History of Present Illness</h4>
          <p className="text-white">{summary.history_of_present_illness}</p>
        </div>
      )}

      {summary.procedure_performed?.length > 0 && (
        <div className="bg-zinc-800/30 rounded-lg p-4">
          <h4 className="text-zinc-400 text-xs uppercase mb-2">Procedures Performed</h4>
          <ul className="text-white list-disc list-inside">
            {summary.procedure_performed.map((p, i) => <li key={i}>{typeof p === 'string' ? p : p.name || JSON.stringify(p)}</li>)}
          </ul>
        </div>
      )}

      {summary.past_medical_history?.length > 0 && (
        <div className="bg-zinc-800/30 rounded-lg p-4">
          <h4 className="text-zinc-400 text-xs uppercase mb-2">Past Medical History</h4>
          <ul className="text-white list-disc list-inside">
            {summary.past_medical_history.map((h, i) => <li key={i}>{typeof h === 'string' ? h : h.condition || JSON.stringify(h)}</li>)}
          </ul>
        </div>
      )}

      {summary.medications?.length > 0 && (
        <div className="bg-zinc-800/30 rounded-lg p-4">
          <h4 className="text-zinc-400 text-xs uppercase mb-2">Medications</h4>
          <ul className="text-white list-disc list-inside">
            {summary.medications.map(renderListItem)}
          </ul>
        </div>
      )}

      {summary.allergies?.length > 0 && (
        <div className="bg-zinc-800/30 rounded-lg p-4">
          <h4 className="text-zinc-400 text-xs uppercase mb-2">Allergies</h4>
          <ul className="text-white list-disc list-inside">
            {summary.allergies.map((a, i) => <li key={i}>{typeof a === 'string' ? a : a.allergen || JSON.stringify(a)}</li>)}
          </ul>
        </div>
      )}

      {summary.findings && (
        <div className="bg-zinc-800/30 rounded-lg p-4">
          <h4 className="text-zinc-400 text-xs uppercase mb-2">Findings</h4>
          {summary.findings.colonoscopy?.length > 0 && (
            <div className="mb-2">
              <span className="text-zinc-500 text-sm">Colonoscopy:</span>
              <ul className="text-white list-disc list-inside ml-2">
                {summary.findings.colonoscopy.map((f, i) => <li key={i}>{typeof f === 'string' ? f : f.finding || JSON.stringify(f)}</li>)}
              </ul>
            </div>
          )}
          {summary.findings.egd?.length > 0 && (
            <div>
              <span className="text-zinc-500 text-sm">EGD:</span>
              <ul className="text-white list-disc list-inside ml-2">
                {summary.findings.egd.map((f, i) => <li key={i}>{typeof f === 'string' ? f : f.finding || JSON.stringify(f)}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {summary.specimens && (
        <div className="bg-zinc-800/30 rounded-lg p-4">
          <h4 className="text-zinc-400 text-xs uppercase mb-2">Specimens</h4>
          <p className="text-white">{summary.specimens}</p>
        </div>
      )}

      {summary.complications && (
        <div className="bg-zinc-800/30 rounded-lg p-4">
          <h4 className="text-zinc-400 text-xs uppercase mb-2">Complications</h4>
          <p className="text-white">{summary.complications}</p>
        </div>
      )}

      {summary.disposition && (
        <div className="bg-zinc-800/30 rounded-lg p-4">
          <h4 className="text-zinc-400 text-xs uppercase mb-2">Disposition</h4>
          <p className="text-white">{summary.disposition}</p>
        </div>
      )}

      {summary.recommendations?.length > 0 && (
        <div className="bg-zinc-800/30 rounded-lg p-4">
          <h4 className="text-zinc-400 text-xs uppercase mb-2">Recommendations</h4>
          <ul className="text-white list-disc list-inside">
            {summary.recommendations.map((r, i) => <li key={i}>{typeof r === 'string' ? r : r.recommendation || JSON.stringify(r)}</li>)}
          </ul>
        </div>
      )}

      {summary.vital_signs && (
        <div className="bg-zinc-800/30 rounded-lg p-4">
          <h4 className="text-zinc-400 text-xs uppercase mb-2">Vital Signs</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            {summary.vital_signs.bp && <div><span className="text-zinc-500">BP:</span> <span className="text-white">{summary.vital_signs.bp}</span></div>}
            {summary.vital_signs.hr && <div><span className="text-zinc-500">HR:</span> <span className="text-white">{summary.vital_signs.hr}</span></div>}
            {summary.vital_signs.temp && <div><span className="text-zinc-500">Temp:</span> <span className="text-white">{summary.vital_signs.temp}</span></div>}
            {summary.vital_signs.spo2 && <div><span className="text-zinc-500">SpO2:</span> <span className="text-white">{summary.vital_signs.spo2}</span></div>}
            {summary.vital_signs.height && <div><span className="text-zinc-500">Height:</span> <span className="text-white">{summary.vital_signs.height}</span></div>}
            {summary.vital_signs.weight && <div><span className="text-zinc-500">Weight:</span> <span className="text-white">{summary.vital_signs.weight}</span></div>}
            {summary.vital_signs.bmi && <div><span className="text-zinc-500">BMI:</span> <span className="text-white">{summary.vital_signs.bmi}</span></div>}
          </div>
        </div>
      )}

      {summary.physical_exam_summary && (
        <div className="bg-zinc-800/30 rounded-lg p-4">
          <h4 className="text-zinc-400 text-xs uppercase mb-2">Physical Exam</h4>
          <p className="text-white">{summary.physical_exam_summary}</p>
        </div>
      )}

      {summary.assessment && (
        <div className="bg-zinc-800/30 rounded-lg p-4">
          <h4 className="text-zinc-400 text-xs uppercase mb-2">Assessment</h4>
          <p className="text-white">{summary.assessment}</p>
        </div>
      )}
    </div>
  );
};

// Detail Modal Component - Updated with multi-document support
const DetailModal = ({ record, onClose, getAccuracyColor, openDocumentViewer, getDocUrls }) => {
  const hpDocCount = getDocUrls(record, 'hp').length;
  const opDocCount = getDocUrls(record, 'op').length;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-zinc-900 rounded-2xl border border-zinc-800 max-w-3xl w-full max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between sticky top-0 bg-zinc-900 z-10">
          <div>
            <h3 className="text-lg font-semibold text-white">Extraction Details</h3>
            <p className="text-zinc-500 text-sm">MR: {record.mr_number || 'N/A'} | Acct: {record.acct_number || 'N/A'}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-lg transition-colors">
            <svg className="w-5 h-5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Accuracy Overview */}
          <div className="flex items-center gap-6">
            <div className="relative w-24 h-24 flex-shrink-0">
              <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" stroke="#27272a" strokeWidth="8" fill="none" />
                <circle
                  cx="50" cy="50" r="40"
                  stroke={parseFloat(record.accuracy_percentage) >= 90 ? '#10b981' : parseFloat(record.accuracy_percentage) >= 70 ? '#f59e0b' : '#ef4444'}
                  strokeWidth="8" fill="none"
                  strokeLinecap="round"
                  strokeDasharray={`${(parseFloat(record.accuracy_percentage) / 100) * 251} 251`}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className={`text-xl font-bold ${getAccuracyColor(record.accuracy_percentage)}`}>
                  {parseFloat(record.accuracy_percentage)?.toFixed(0) || 0}%
                </span>
              </div>
            </div>
            <div>
              <h4 className="text-white font-medium mb-1">AI Accuracy Score</h4>
              <p className="text-zinc-400 text-sm">
                {parseFloat(record.accuracy_percentage) >= 90 ? 'Excellent match with user corrections' :
                  parseFloat(record.accuracy_percentage) >= 70 ? 'Good match with some corrections needed' :
                    'Significant corrections were made'}
              </p>
            </div>
          </div>

          {/* Documents & Summaries Quick Access */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-zinc-800/30 rounded-lg p-4">
              <h4 className="text-blue-400 font-medium mb-3 flex items-center gap-2">
                <span className="w-6 h-6 rounded bg-blue-500/20 flex items-center justify-center text-xs font-bold">HP</span>
                History & Physical
                {hpDocCount > 1 && (
                  <span className="text-[10px] bg-blue-500/30 text-blue-300 px-1.5 py-0.5 rounded">
                    {hpDocCount} docs
                  </span>
                )}
              </h4>
              <div className="flex gap-2">
                {(hpDocCount > 0 || record.hp_text) && (
                  <button onClick={() => openDocumentViewer(record, 'document', 'hp')} className="flex-1 px-3 py-2 bg-zinc-700/50 hover:bg-zinc-700 rounded-lg text-sm text-zinc-300 transition-colors">
                    View Document{hpDocCount > 1 ? 's' : ''}
                  </button>
                )}
                {(record.s3_hp_summary_url || record.ai_summary_hp) && (
                  <button onClick={() => openDocumentViewer(record, 'summary', 'hp')} className="flex-1 px-3 py-2 bg-purple-500/20 hover:bg-purple-500/30 rounded-lg text-sm text-purple-300 transition-colors">
                    AI Summary
                  </button>
                )}
              </div>
            </div>

            <div className="bg-zinc-800/30 rounded-lg p-4">
              <h4 className="text-emerald-400 font-medium mb-3 flex items-center gap-2">
                <span className="w-6 h-6 rounded bg-emerald-500/20 flex items-center justify-center text-xs font-bold">OP</span>
                Operative Report
                {opDocCount > 1 && (
                  <span className="text-[10px] bg-emerald-500/30 text-emerald-300 px-1.5 py-0.5 rounded">
                    {opDocCount} docs
                  </span>
                )}
              </h4>
              <div className="flex gap-2">
                {(opDocCount > 0 || record.op_text) && (
                  <button onClick={() => openDocumentViewer(record, 'document', 'op')} className="flex-1 px-3 py-2 bg-zinc-700/50 hover:bg-zinc-700 rounded-lg text-sm text-zinc-300 transition-colors">
                    View Document{opDocCount > 1 ? 's' : ''}
                  </button>
                )}
                {(record.s3_op_summary_url || record.ai_summary_op) && (
                  <button onClick={() => openDocumentViewer(record, 'summary', 'op')} className="flex-1 px-3 py-2 bg-purple-500/20 hover:bg-purple-500/30 rounded-lg text-sm text-purple-300 transition-colors">
                    AI Summary
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Code Comparison */}
          <div className="space-y-4">
            <h4 className="text-white font-medium">Code Comparison</h4>

            <CodeComparisonRow label="Admit DX" aiValue={record.ai_admit_dx} userValue={record.user_admit_dx} />
            <CodeComparisonRow label="PDX" aiValue={record.ai_pdx} userValue={record.user_pdx} />
            <ArrayCodeComparison label="SDX" aiCodes={record.ai_sdx || []} userCodes={record.user_sdx || []} />
            <ArrayCodeComparison label="CPT" aiCodes={record.ai_cpt || []} userCodes={record.user_cpt || []} tagColor="blue" />
            <CodeComparisonRow label="Modifier" aiValue={record.ai_modifier} userValue={record.user_modifier} />
          </div>

          {record.remarks && (
            <div>
              <h4 className="text-white font-medium mb-2">Remarks</h4>
              <p className="text-zinc-400 text-sm bg-zinc-800/50 rounded-lg p-3">{record.remarks}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Code Comparison Row for single values
const CodeComparisonRow = ({ label, aiValue, userValue }) => {
  const isMatch = (aiValue || '') === (userValue || '');

  return (
    <div className="bg-zinc-800/30 rounded-lg p-3">
      <div className="flex items-center gap-4">
        <div className="w-20 shrink-0">
          <span className="text-zinc-400 text-sm">{label}</span>
        </div>
        <div className="flex-1 grid grid-cols-2 gap-4">
          <div>
            <span className="text-zinc-500 text-xs block mb-1">AI</span>
            <span className={`font-mono text-sm ${isMatch ? 'text-zinc-300' : 'text-red-400'}`}>
              {aiValue || 'N/A'}
            </span>
          </div>
          <div>
            <span className="text-zinc-500 text-xs block mb-1">User</span>
            <span className="font-mono text-sm text-emerald-400">
              {userValue || 'N/A'}
            </span>
          </div>
        </div>
        <div className="w-8">
          {isMatch ? (
            <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          )}
        </div>
      </div>
    </div>
  );
};

// Array Code Comparison
const ArrayCodeComparison = ({ label, aiCodes, userCodes, tagColor = 'default' }) => {
  const aiArray = Array.isArray(aiCodes) ? aiCodes : [];
  const userArray = Array.isArray(userCodes) ? userCodes : [];

  const matches = aiArray.filter(code => userArray.includes(code));
  const aiOnly = aiArray.filter(code => !userArray.includes(code));
  const userOnly = userArray.filter(code => !aiArray.includes(code));

  const getTagStyle = (type) => {
    if (type === 'match') return 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300';
    if (type === 'removed') return 'bg-red-500/20 border-red-500/30 text-red-300 line-through';
    if (type === 'added') return 'bg-blue-500/20 border-blue-500/30 text-blue-300';
    return tagColor === 'blue' ? 'bg-blue-500/20 border-blue-500/30 text-blue-300' : 'bg-zinc-700/50 border-zinc-600/50 text-zinc-300';
  };

  return (
    <div className="bg-zinc-800/30 rounded-lg p-3">
      <div className="flex items-start gap-4">
        <div className="w-20 shrink-0 pt-1">
          <span className="text-zinc-400 text-sm">{label}</span>
        </div>
        <div className="flex-1">
          <div className="flex flex-wrap gap-2">
            {matches.map(code => (
              <span key={`match-${code}`} className={`inline-flex items-center gap-1 px-2 py-1 rounded border font-mono text-xs ${getTagStyle('match')}`}>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                {code}
              </span>
            ))}
            {aiOnly.map(code => (
              <span key={`removed-${code}`} className={`inline-flex items-center gap-1 px-2 py-1 rounded border font-mono text-xs ${getTagStyle('removed')}`}>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                {code}
              </span>
            ))}
            {userOnly.map(code => (
              <span key={`added-${code}`} className={`inline-flex items-center gap-1 px-2 py-1 rounded border font-mono text-xs ${getTagStyle('added')}`}>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                {code}
              </span>
            ))}
            {matches.length === 0 && aiOnly.length === 0 && userOnly.length === 0 && (
              <span className="text-zinc-500 text-sm">No codes</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsPage;

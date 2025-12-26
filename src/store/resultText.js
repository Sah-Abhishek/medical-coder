import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useMedExtractStore = create(
  persist(
    (set, get) => ({
      // Stored OCR results
      hp: null,
      op: null,
      summary: {
        totalPages: 0,
        totalWords: 0,
        processingTime: 0,
      },

      // Document key from backend (for S3/DB reference)
      documentKey: null,

      // ICD Codes from AI (original - for accuracy comparison)
      originalCodes: null,

      // ICD Codes (current working copy)
      icdCodes: null,

      // AI Summaries
      aiSummary: {
        hp: null,
        op: null,
      },

      // Remarks
      remarks: '',

      // Actions
      setHpResult: (hp) => set(() => ({ hp })),
      setOpResult: (op) => set(() => ({ op })),
      setSummary: (summary) => set(() => ({ summary })),
      setDocumentKey: (documentKey) => set(() => ({ documentKey })),
      setIcdCodes: (icdCodes) => set(() => ({ icdCodes })),
      setOriginalCodes: (originalCodes) => set(() => ({ originalCodes })),
      setAiSummary: (aiSummary) => set(() => ({ aiSummary })),
      setRemarks: (remarks) => set(() => ({ remarks })),

      // Set all extraction results at once
      setExtractionResults: (data) =>
        set(() => ({
          documentKey: data.extracted.document_key,
          icdCodes: data.extracted,
          originalCodes: {
            admit_dx: data.extracted.admit_dx,
            pdx: data.extracted.pdx,
            sdx: [...(data.extracted.sdx || [])],
            cpt: [...(data.extracted.cpt || [])],
            modifier: data.extracted.modifier
          },
          aiSummary: data.ai_summary,
        })),

      // Clear all data
      clearAll: () =>
        set(() => ({
          hp: null,
          op: null,
          summary: { totalPages: 0, totalWords: 0, processingTime: 0 },
          documentKey: null,
          originalCodes: null,
          icdCodes: null,
          aiSummary: { hp: null, op: null },
          remarks: '',
        })),

      // Clear only codes (keep OCR text)
      clearCodes: () =>
        set(() => ({
          documentKey: null,
          originalCodes: null,
          icdCodes: null,
          aiSummary: { hp: null, op: null },
        })),
    }),
    {
      name: 'med-extract-storage',
      version: 4,
    }
  )
);

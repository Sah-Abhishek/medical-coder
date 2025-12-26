import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import MedExtract from './pages/DocumentUploadPage';
import ResultsPage from './pages/EditPage';
import AnalyticsPage from './pages/AnalyticsPage';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<MedExtract />} />
        <Route path="/results" element={<ResultsPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
      </Routes>
    </Router>
  );
}

export default App;


import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from "react-router";
import './index.css'
import App from './App.tsx'
import UploadFingerprints from './components/uploadFingerprints.tsx';

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}></Route>
        <Route path="upload" element={<UploadFingerprints/>} />
      </Routes>
    </BrowserRouter>
)

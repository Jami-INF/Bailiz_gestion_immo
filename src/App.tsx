import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@/components/ui';
import { AppLayout } from '@/components/AppLayout';
import { TableauDeBordPage } from '@/features/dashboard/TableauDeBordPage';
import { BiensPage } from '@/features/biens/BiensPage';
import { BienFormPage } from '@/features/biens/BienFormPage';
import { BienDetailPage } from '@/features/biens/BienDetailPage';
import { LocatairesPage } from '@/features/locataires/LocatairesPage';
import { BauxPage } from '@/features/baux/BauxPage';
import { BailAssistantPage } from '@/features/baux/BailAssistantPage';
import { BailDetailPage } from '@/features/baux/BailDetailPage';
import { EdlListePage } from '@/features/edl/EdlListePage';
import { EdlTerrainPage } from '@/features/edl/EdlTerrainPage';
import { EdlSignaturePage } from '@/features/edl/EdlSignaturePage';
import { EdlSynthesePage } from '@/features/edl/EdlSynthesePage';
import { DocumentsPage } from '@/features/documents/DocumentsPage';
import { ParametresPage } from '@/features/parametres/ParametresPage';
import { MentionsLegalesPage } from '@/features/legal/MentionsLegalesPage';

export default function App() {
  return (
    <ToastProvider>
      <HashRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<TableauDeBordPage />} />
            <Route path="/biens" element={<BiensPage />} />
            <Route path="/biens/nouveau" element={<BienFormPage />} />
            <Route path="/biens/:id" element={<BienDetailPage />} />
            <Route path="/biens/:id/modifier" element={<BienFormPage />} />
            <Route path="/locataires" element={<LocatairesPage />} />
            <Route path="/baux" element={<BauxPage />} />
            <Route path="/baux/nouveau" element={<BailAssistantPage />} />
            <Route path="/baux/:id" element={<BailDetailPage />} />
            <Route path="/edl" element={<EdlListePage />} />
            <Route path="/edl/:id" element={<EdlTerrainPage />} />
            <Route path="/edl/:id/signature" element={<EdlSignaturePage />} />
            <Route path="/edl/:id/synthese" element={<EdlSynthesePage />} />
            <Route path="/documents" element={<DocumentsPage />} />
            <Route path="/parametres" element={<ParametresPage />} />
            <Route path="/mentions-legales" element={<MentionsLegalesPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </ToastProvider>
  );
}

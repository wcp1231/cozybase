import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './pages/app-layout';
import { AppPageView } from './pages/app-page-view';
import { AppListPage } from './pages/app-list';
import { ModeLandingPage } from './pages/mode-landing-page';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/stable" replace />} />
        <Route path="/:mode" element={<AppLayout />}>
          <Route index element={<ModeLandingPage />} />
          <Route path="apps" element={<AppListPage />} />
          <Route path="apps/:appName/*" element={<AppPageView />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

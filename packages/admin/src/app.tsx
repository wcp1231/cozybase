import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppListPage } from './pages/app-list';
import { AppLayout } from './pages/app-layout';
import { AppPageView } from './pages/app-page-view';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/apps" replace />} />
        <Route path="/apps" element={<AppListPage />} />
        <Route path="/apps/:appName" element={<AppLayout />}>
          <Route index element={<AppPageView />} />
          <Route path=":pageId" element={<AppPageView />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

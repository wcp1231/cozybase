import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppListPage } from './pages/app-list';
import { AppLayout } from './pages/app-layout';
import { AppPageView } from './pages/app-page-view';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/stable/apps" replace />} />
        <Route path="/:mode/apps" element={<AppLayout />}>
          <Route index element={<AppListPage />} />
          <Route path=":appName" element={<AppPageView />} />
          <Route path=":appName/:pageId" element={<AppPageView />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

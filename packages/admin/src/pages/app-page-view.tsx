import { useParams, Navigate } from 'react-router-dom';
import { SchemaRenderer } from '@cozybase/ui';
import { useAppContext } from './app-layout';

export function AppPageView() {
  const { appName, pageId } = useParams<{ appName: string; pageId: string }>();
  const { pagesJson } = useAppContext();

  // If no pageId (index route), redirect to the first page
  if (!pageId) {
    if (pagesJson.pages.length === 0) {
      return (
        <div style={{ padding: 24, color: '#6b7280' }}>
          No pages defined in this app.
        </div>
      );
    }
    return <Navigate to={`/apps/${appName}/${pagesJson.pages[0].id}`} replace />;
  }

  const page = pagesJson.pages.find((p) => p.id === pageId);

  if (!page) {
    return (
      <div style={{ padding: 24, color: '#dc2626' }}>
        页面不存在
      </div>
    );
  }

  const baseUrl = `/stable/apps/${appName}`;

  return (
    <SchemaRenderer
      schema={page}
      baseUrl={baseUrl}
      components={pagesJson.components}
    />
  );
}

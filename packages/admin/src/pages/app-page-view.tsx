import { useParams, useSearchParams, Navigate } from 'react-router-dom';
import { SchemaRenderer } from '@cozybase/ui';
import { useAppContext } from './app-layout';
import { resolveContentSlotState } from './content-slot';

export function AppPageView() {
  const { appName, pageId } = useParams<{ appName: string; pageId: string }>();
  const [searchParams] = useSearchParams();
  const { appLoading, appError, pagesJson } = useAppContext();
  const mode = searchParams.get('mode') === 'draft' ? 'draft' : 'stable';

  const slotState = resolveContentSlotState({
    appName,
    pageId,
    mode,
    pagesJson,
    appLoading,
    appError,
  });

  if (slotState.type === 'loading') {
    return <div className="p-6 text-text-muted">Loading page...</div>;
  }

  if (slotState.type === 'error') {
    return <div className="p-6 text-danger">Error: {slotState.message}</div>;
  }

  if (slotState.type === 'no-ui') {
    return <div className="p-6 text-text-muted">{slotState.message}</div>;
  }

  if (slotState.type === 'not-found') {
    return <div className="p-6 text-danger">{slotState.message}</div>;
  }

  if (slotState.type === 'redirect') {
    return <Navigate to={slotState.to} replace />;
  }

  const params = Object.fromEntries(searchParams.entries());

  return (
    <SchemaRenderer
      schema={slotState.page}
      baseUrl={slotState.baseUrl}
      components={pagesJson?.components}
      params={params}
    />
  );
}

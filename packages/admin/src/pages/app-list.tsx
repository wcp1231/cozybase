import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import { useAppContext } from './app-layout';

const stateBadgeClasses: Record<string, string> = {
  draft_only: 'bg-bg-muted text-text-secondary',
  stable: 'bg-success-bg text-success-text',
  stable_draft: 'bg-warning-bg text-warning-text',
};

function StateBadge({ state }: { state: string }) {
  const cls = stateBadgeClasses[state] ?? stateBadgeClasses.draft_only;
  return (
    <span
      className={clsx(
        'inline-block px-2 py-0.5 rounded-full text-xs font-medium',
        cls,
      )}
    >
      {state}
    </span>
  );
}

export function AppListPage() {
  const { apps, appsLoading, appsError } = useAppContext();

  if (appsLoading) {
    return <div className="p-6 text-text-muted">Loading apps...</div>;
  }

  if (appsError) {
    return <div className="p-6 text-danger">Error: {appsError}</div>;
  }

  return (
    <div className="w-full max-w-5xl">
      <h1 className="text-2xl font-semibold text-text m-0 mb-2">Apps</h1>
      <p className="m-0 mb-6 text-sm text-text-muted">
        Select an app to open it in the center content slot.
      </p>

      {apps.length === 0 ? (
        <div className="text-text-muted border border-border rounded-md p-6">
          No apps found.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {apps.map((app) => (
            <Link
              key={app.name}
              to={`/apps/${app.name}`}
              className="no-underline text-inherit"
            >
              <div className="bg-bg border border-border rounded-md p-4 cursor-pointer transition-shadow hover:shadow-md h-full">
                <div className="flex justify-between items-center mb-2 gap-2">
                  <span className="text-base font-semibold text-text">
                    {app.name}
                  </span>
                  <div className="flex gap-1.5 items-center shrink-0">
                    {!app.has_ui && (
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-error-bg text-error-text">
                        No UI
                      </span>
                    )}
                    <StateBadge state={app.state} />
                  </div>
                </div>
                <p className="text-sm text-text-muted m-0 leading-normal">
                  {app.description || 'No description'}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

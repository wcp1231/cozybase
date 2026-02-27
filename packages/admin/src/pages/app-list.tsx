import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';

interface App {
  name: string;
  description: string;
  status: string;
  current_version: number;
  published_version: number;
  created_at: string;
  updated_at: string;
  state: string;
  has_ui: boolean;
}

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
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/v1/apps')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        setApps(json.data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="p-12 text-center text-text-muted">
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-12 text-center text-danger">
        Error: {error}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-subtle">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-semibold text-text m-0 mb-6">
          Apps
        </h1>

        {apps.length === 0 ? (
          <div className="text-text-muted text-center p-12">
            No apps found.
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
            {apps.map((app) => (
              <Link
                key={app.name}
                to={`/apps/${app.name}`}
                className="no-underline text-inherit"
              >
                <div className="bg-bg border border-border rounded-md p-5 cursor-pointer transition-shadow hover:shadow-md">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-base font-semibold text-text">
                      {app.name}
                    </span>
                    <div className="flex gap-1.5 items-center">
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
    </div>
  );
}

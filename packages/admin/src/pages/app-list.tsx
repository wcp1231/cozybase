import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

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

const stateBadgeStyles: Record<string, { background: string; color: string }> = {
  draft_only: { background: '#f3f4f6', color: '#374151' },
  stable: { background: '#d1fae5', color: '#065f46' },
  stable_draft: { background: '#fef3c7', color: '#92400e' },
};

function StateBadge({ state }: { state: string }) {
  const style = stateBadgeStyles[state] ?? stateBadgeStyles.draft_only;
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 9999,
        fontSize: 12,
        fontWeight: 500,
        background: style.background,
        color: style.color,
      }}
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
      <div style={{ padding: 48, textAlign: 'center', color: '#6b7280' }}>
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: '#dc2626' }}>
        Error: {error}
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb' }}>
      <div
        style={{
          maxWidth: 1024,
          margin: '0 auto',
          padding: '32px 24px',
        }}
      >
        <h1
          style={{
            fontSize: 24,
            fontWeight: 600,
            color: '#111827',
            margin: '0 0 24px 0',
          }}
        >
          Apps
        </h1>

        {apps.length === 0 ? (
          <div style={{ color: '#6b7280', textAlign: 'center', padding: 48 }}>
            No apps found.
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 16,
            }}
          >
            {apps.map((app) => (
              <Link
                key={app.name}
                to={`/apps/${app.name}`}
                style={{ textDecoration: 'none', color: 'inherit' }}
              >
                <div
                  style={{
                    background: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    padding: 20,
                    cursor: 'pointer',
                    transition: 'box-shadow 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.boxShadow =
                      '0 1px 3px rgba(0,0,0,0.1)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.boxShadow = 'none';
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 8,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 16,
                        fontWeight: 600,
                        color: '#111827',
                      }}
                    >
                      {app.name}
                    </span>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {!app.has_ui && (
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 9999,
                            fontSize: 12,
                            fontWeight: 500,
                            background: '#fee2e2',
                            color: '#991b1b',
                          }}
                        >
                          No UI
                        </span>
                      )}
                      <StateBadge state={app.state} />
                    </div>
                  </div>
                  <p
                    style={{
                      fontSize: 14,
                      color: '#6b7280',
                      margin: 0,
                      lineHeight: 1.5,
                    }}
                  >
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

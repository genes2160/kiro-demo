'use client';

import { useState, useEffect, useRef } from 'react';

type Status = 'success' | 'blocked' | 'partial' | 'error' | 'idle';

interface FetchResult {
  status: Status;
  data: any[];
  error: string | null;
  duration_ms: number;
  items_count: number;
}

interface QueryResult {
  target: string;
  timestamp: string;
  native: FetchResult;
  brightdata: FetchResult;
}

interface HistoryRow {
  id: number;
  target: string;
  native_status: string;
  native_items_count: number;
  native_duration_ms: number;
  brightdata_status: string;
  brightdata_items_count: number;
  brightdata_duration_ms: number;
  created_at: string;
}

interface Aggregate {
  total: number;
  native_success: number;
  native_blocked: number;
  brightdata_success: number;
  avg_native_ms: number;
  avg_brightdata_ms: number;
  native_total_items: number;
  brightdata_total_items: number;
}

const STATUS_CONFIG: Record<Status | string, { color: string; bg: string; dot: string; label: string }> = {
  success: { color: '#22c55e', bg: 'rgba(34,197,94,0.08)', dot: '#22c55e', label: 'SUCCESS' },
  blocked: { color: '#ef4444', bg: 'rgba(239,68,68,0.08)', dot: '#ef4444', label: 'BLOCKED' },
  partial: { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', dot: '#f59e0b', label: 'PARTIAL' },
  error: { color: '#ef4444', bg: 'rgba(239,68,68,0.08)', dot: '#ef4444', label: 'ERROR' },
  idle: { color: '#545d6e', bg: 'rgba(84,93,110,0.08)', dot: '#545d6e', label: 'IDLE' },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.idle;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: cfg.bg, color: cfg.color,
      border: `1px solid ${cfg.color}22`,
      borderRadius: 6, padding: '3px 10px',
      fontSize: 11, fontWeight: 600, letterSpacing: '0.08em',
      fontFamily: 'var(--mono)',
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: cfg.dot,
        boxShadow: `0 0 6px ${cfg.dot}`,
        animation: status === 'success' ? 'pulse 2s infinite' : 'none',
      }} />
      {cfg.label}
    </span>
  );
}

function Spinner() {
  return (
    <div style={{ display: 'inline-block', width: 16, height: 16 }}>
      <svg viewBox="0 0 16 16" style={{ animation: 'spin 0.8s linear infinite' }}>
        <circle cx="8" cy="8" r="6" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2" />
        <path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke="#4f7cff" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function MetricCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{
      background: 'var(--bg-2)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '18px 20px',
      flex: 1,
      minWidth: 120,
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 6, fontFamily: 'var(--mono)' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: color || 'var(--text)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function DataTable({ data, target }: { data: any[]; target: string }) {
  if (!data || data.length === 0) return null;

  const isReddit = target === 'reddit';
  const cols = isReddit
    ? ['Title', 'Score', 'Author', 'Comments']
    : ['Rank', 'Product'];

  return (
    <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--bg-3)' }}>
            {cols.map(c => (
              <th key={c} style={{
                padding: '8px 12px', textAlign: 'left',
                color: 'var(--text-3)', fontWeight: 500,
                fontSize: 11, letterSpacing: '0.06em',
                borderBottom: '1px solid var(--border)',
                fontFamily: 'var(--mono)',
                whiteSpace: 'nowrap',
              }}>{c.toUpperCase()}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 10).map((row, i) => (
            <tr key={i} style={{
              borderBottom: i < data.length - 1 ? '1px solid var(--border)' : 'none',
              transition: 'background 0.15s',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-3)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {isReddit ? (
                <>
                  <td style={{ padding: '10px 12px', color: 'var(--text)', maxWidth: 300 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }} title={row.title}>{row.title}</div>
                  </td>
                  <td style={{ padding: '10px 12px', color: '#22c55e', fontFamily: 'var(--mono)', fontSize: 12, whiteSpace: 'nowrap' }}>
                    ↑ {(row.score || 0).toLocaleString()}
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--text-2)', fontFamily: 'var(--mono)', fontSize: 12, whiteSpace: 'nowrap' }}>
                    u/{row.author}
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--text-3)', fontFamily: 'var(--mono)', fontSize: 12, whiteSpace: 'nowrap' }}>
                    {(row.comments || 0).toLocaleString()}
                  </td>
                </>
              ) : (
                <>
                  <td style={{ padding: '10px 12px', color: 'var(--text-3)', fontFamily: 'var(--mono)', fontSize: 12, width: 40 }}>#{row.rank}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--text)' }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 340 }} title={row.title}>{row.title}</div>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResultPanel({
  label, result, loading, side
}: {
  label: string; result: FetchResult | null; loading: boolean; side: 'native' | 'bright';
}) {
  const isNative = side === 'native';
  const accentColor = isNative ? '#8b93a8' : '#4f7cff';

  return (
    <div style={{
      background: 'var(--bg-2)',
      border: `1px solid ${result?.status === 'success' && !isNative ? 'rgba(79,124,255,0.25)' : 'var(--border)'}`,
      borderRadius: 16,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: !isNative && result?.status === 'success' ? '0 0 40px rgba(79,124,255,0.06)' : 'none',
    }}>
      {/* Panel header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: isNative ? 'var(--bg-3)' : 'rgba(79,124,255,0.04)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: accentColor,
            boxShadow: !isNative ? `0 0 10px ${accentColor}` : 'none',
          }} />
          <span style={{ fontWeight: 600, color: 'var(--text)', fontSize: 14 }}>{label}</span>
          {!isNative && (
            <span style={{
              fontSize: 10, background: 'rgba(79,124,255,0.15)', color: '#4f7cff',
              padding: '2px 7px', borderRadius: 4, fontWeight: 600, letterSpacing: '0.06em',
            }}>WEB UNLOCKER</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {loading ? <Spinner /> : result && (
            <>
              <StatusBadge status={result.status} />
              <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--mono)' }}>
                {result.duration_ms}ms
              </span>
            </>
          )}
        </div>
      </div>

      {/* Stats row */}
      {result && !loading && (
        <div style={{
          padding: '12px 20px',
          borderBottom: result.data.length > 0 ? '1px solid var(--border)' : 'none',
          display: 'flex', gap: 20, flexWrap: 'wrap',
        }}>
          <div>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Items extracted</span>
            <div style={{ fontSize: 20, fontWeight: 700, color: result.data.length > 0 ? '#22c55e' : '#ef4444' }}>
              {result.data.length}
            </div>
          </div>
          <div>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Response time</span>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{result.duration_ms}<span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-3)' }}>ms</span></div>
          </div>
          {result.error && (
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Error</span>
              <div style={{ fontSize: 12, color: '#ef4444', marginTop: 2, fontFamily: 'var(--mono)' }}>{result.error}</div>
            </div>
          )}
        </div>
      )}

      {/* Empty / loading state */}
      {!result && !loading && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
          Run a query to see results
        </div>
      )}

      {loading && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
          <div style={{ marginBottom: 8 }}>
            <Spinner />
          </div>
          <div style={{ fontSize: 13 }}>{isNative ? 'Sending native HTTP request...' : 'Routing through Bright Data...'}</div>
        </div>
      )}

      {/* Data table */}
      {result && result.data.length > 0 && (
        <div style={{ padding: '0 0 4px 0', flex: 1 }}>
          {/* placeholder — target passed from parent */}
          <DataTable data={result.data} target={(result as any)._target || 'reddit'} />
        </div>
      )}

      {/* Blocked/error state */}
      {result && result.data.length === 0 && !loading && (
        <div style={{
          padding: 32, textAlign: 'center',
          color: result.status === 'blocked' ? '#ef4444' : 'var(--text-3)',
        }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>
            {result.status === 'blocked' ? '🚫' : result.status === 'partial' ? '⚠️' : '❌'}
          </div>
          <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 15 }}>
            {result.status === 'blocked' ? 'Request Blocked' : result.status === 'partial' ? 'Partial Response' : 'No Data'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', maxWidth: 280, margin: '0 auto' }}>
            {result.error || 'No structured data could be extracted from this response.'}
          </div>
        </div>
      )}
    </div>
  );
}

function HistoryTable({ history }: { history: HistoryRow[] }) {
  if (!history.length) return (
    <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
      No queries recorded yet. Run your first comparison above.
    </div>
  );

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: 'var(--bg-3)' }}>
            {['#', 'Target', 'Native Status', 'Native Items', 'Native ms', 'BD Status', 'BD Items', 'BD ms', 'Time'].map(h => (
              <th key={h} style={{
                padding: '10px 14px', textAlign: 'left',
                color: 'var(--text-3)', fontWeight: 500, fontSize: 11,
                letterSpacing: '0.06em', borderBottom: '1px solid var(--border)',
                whiteSpace: 'nowrap', fontFamily: 'var(--mono)',
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {history.map((row, i) => (
            <tr key={row.id} style={{
              borderBottom: i < history.length - 1 ? '1px solid var(--border)' : 'none',
              transition: 'background 0.12s',
            }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-3)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <td style={{ padding: '10px 14px', color: 'var(--text-3)', fontFamily: 'var(--mono)', fontSize: 12 }}>#{row.id}</td>
              <td style={{ padding: '10px 14px' }}>
                <span style={{
                  background: row.target === 'reddit' ? 'rgba(255,106,0,0.12)' : 'rgba(255,153,0,0.12)',
                  color: row.target === 'reddit' ? '#ff6a00' : '#ff9900',
                  borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600,
                }}>{row.target.toUpperCase()}</span>
              </td>
              <td style={{ padding: '10px 14px' }}><StatusBadge status={row.native_status} /></td>
              <td style={{ padding: '10px 14px', fontFamily: 'var(--mono)', fontSize: 12, color: row.native_items_count > 0 ? '#22c55e' : '#ef4444' }}>
                {row.native_items_count}
              </td>
              <td style={{ padding: '10px 14px', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-3)' }}>
                {row.native_duration_ms}ms
              </td>
              <td style={{ padding: '10px 14px' }}><StatusBadge status={row.brightdata_status} /></td>
              <td style={{ padding: '10px 14px', fontFamily: 'var(--mono)', fontSize: 12, color: row.brightdata_items_count > 0 ? '#22c55e' : '#ef4444' }}>
                {row.brightdata_items_count}
              </td>
              <td style={{ padding: '10px 14px', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-3)' }}>
                {row.brightdata_duration_ms}ms
              </td>
              <td style={{ padding: '10px 14px', color: 'var(--text-3)', fontSize: 11, whiteSpace: 'nowrap' }}>
                {new Date(row.created_at).toLocaleTimeString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Page() {
  const [target, setTarget] = useState<'reddit' | 'amazon'>('reddit');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [aggregate, setAggregate] = useState<Aggregate | null>(null);
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'scrape' | 'api'>('scrape');
  const [activeTab, setActiveTab] = useState<'live' | 'history'>('live');
  const queryCount = useRef(0);

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/query/native');
      const data = await res.json();
      setHistory(data.recent || []);
      setAggregate(data.aggregate || null);
    } catch {}
  };

  useEffect(() => { fetchHistory(); }, []);

  const runQuery = async () => {
    if (loading) return;
    setLoading(true);
    queryCount.current++;

    try {
      const res = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, query, mode }),
      });
      const data = await res.json();

      // Inject target for table rendering
      if (data.native) data.native._target = target;
      if (data.brightdata) data.brightdata._target = target;

      setResult(data);
      setActiveTab('live');
      fetchHistory();
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const brightdataRate = aggregate && aggregate.total > 0
    ? Math.round((aggregate.brightdata_success / aggregate.total) * 100)
    : null;

  return (
    <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .fade-in { animation: fadeIn 0.3s ease forwards; }
        .tab-btn { cursor: pointer; border: none; background: none; font-family: var(--font); transition: all 0.15s; }
        .tab-btn:hover { color: var(--text) !important; }
        .target-btn { cursor: pointer; border: 1px solid var(--border); font-family: var(--font); transition: all 0.15s; }
        .target-btn:hover { border-color: var(--border-bright) !important; }
        .run-btn { cursor: pointer; border: none; font-family: var(--font); transition: all 0.2s; }
        .run-btn:hover:not(:disabled) { opacity: 0.85; transform: translateY(-1px); }
        .run-btn:active:not(:disabled) { transform: translateY(0); }
        .run-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>

      {/* Header */}
      <header style={{
        borderBottom: '1px solid var(--border)',
        background: 'rgba(7,8,10,0.9)',
        backdropFilter: 'blur(20px)',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'linear-gradient(135deg, #4f7cff, #7c3aed)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, fontWeight: 700,
              }}>⚡</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: '-0.01em' }}>Kiro Demo</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.04em' }}>NATIVE HTTP vs BRIGHT DATA</div>
              </div>
            </div>

            {/* Live aggregate pills */}
            {aggregate && aggregate.total > 0 && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--text-3)', marginRight: 4 }}>{aggregate.total} runs</span>
                <span style={{
                  background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                  border: '1px solid rgba(239,68,68,0.2)',
                  borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 600,
                }}>
                  Native {aggregate.total > 0 ? Math.round((aggregate.native_success / aggregate.total) * 100) : 0}%
                </span>
                <span style={{
                  background: 'rgba(79,124,255,0.1)', color: '#4f7cff',
                  border: '1px solid rgba(79,124,255,0.25)',
                  borderRadius: 6, padding: '3px 10px', fontSize: 11, fontWeight: 600,
                }}>
                  Bright Data {brightdataRate}%
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px' }}>

        {/* Hero */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{
            fontSize: 'clamp(24px, 4vw, 38px)',
            fontWeight: 700, letterSpacing: '-0.03em',
            lineHeight: 1.15, marginBottom: 10,
          }}>
            Same request.{' '}
            <span style={{ color: '#ef4444' }}>Native fails.</span>{' '}
            <span style={{ color: '#4f7cff' }}>Bright Data delivers.</span>
          </h1>
          <p style={{ color: 'var(--text-2)', fontSize: 15, maxWidth: 560 }}>
            Watch real-time as the same data request succeeds or gets blocked — side by side, zero ambiguity.
          </p>
        </div>

        {/* Control bar */}
        <div style={{
          background: 'var(--bg-2)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: '20px 24px',
          marginBottom: 24,
          display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        }}>
          <div style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 500, whiteSpace: 'nowrap' }}>Target source:</div>

          <div style={{ display: 'flex', gap: 8 }}>
            {(['reddit', 'amazon'] as const).map(t => (
              <button
                key={t}
                className="target-btn"
                onClick={() => setTarget(t)}
                style={{
                  padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                  color: target === t ? 'var(--text)' : 'var(--text-2)',
                  background: target === t ? 'var(--bg-4)' : 'transparent',
                  borderColor: target === t ? 'var(--border-bright)' : 'var(--border)',
                }}
              >
                {t === 'reddit' ? '🔴 Reddit' : '📦 Amazon'}
              </button>
            ))}
          </div>

          <div style={{ flex: 1 }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter query (e.g. wireless headphones, ai, software engineer)"
            style={{
              flex: 1,
              minWidth: 240,
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-1)',
              color: 'var(--text)',
              fontSize: 13,
            }}
          />
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as any)}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-3)',
              color: 'var(--text)',
              fontSize: 13,
            }}
          >
            <option value="scrape">Scrape (HTML)</option>
            <option value="api">API Mode</option>
          </select>
          <button
            className="run-btn"
            onClick={runQuery}
            disabled={loading}
            style={{
              padding: '10px 28px', borderRadius: 10,
              background: loading ? '#2a3040' : 'linear-gradient(135deg, #4f7cff, #6366f1)',
              color: 'white', fontSize: 14, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 8,
              boxShadow: loading ? 'none' : '0 4px 20px rgba(79,124,255,0.3)',
            }}
          >
            {loading && <Spinner />}
            {loading ? 'Running...' : '▶ Run Comparison'}
          </button>
        </div>

        {/* Aggregate stats */}
        {aggregate && aggregate.total > 0 && (
          <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
            <MetricCard label="TOTAL RUNS" value={aggregate.total} />
            <MetricCard
              label="NATIVE SUCCESS RATE"
              value={`${Math.round((aggregate.native_success / aggregate.total) * 100)}%`}
              sub={`${aggregate.native_success} of ${aggregate.total}`}
              color="#ef4444"
            />
            <MetricCard
              label="BRIGHT DATA SUCCESS"
              value={`${brightdataRate}%`}
              sub={`${aggregate.brightdata_success} of ${aggregate.total}`}
              color="#4f7cff"
            />
            <MetricCard
              label="ITEMS EXTRACTED (BD)"
              value={aggregate.brightdata_total_items || 0}
              sub={`vs ${aggregate.native_total_items || 0} native`}
              color="#22c55e"
            />
            <MetricCard
              label="AVG LATENCY"
              value={`${Math.round(aggregate.avg_brightdata_ms || 0)}ms`}
              sub="Bright Data avg"
            />
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
          {(['live', 'history'] as const).map(tab => (
            <button
              key={tab}
              className="tab-btn"
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '10px 20px', fontSize: 13, fontWeight: 600,
                color: activeTab === tab ? 'var(--text)' : 'var(--text-3)',
                borderBottom: activeTab === tab ? '2px solid #4f7cff' : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              {tab === 'live' ? '⚡ Live Result' : `📊 Query History ${history.length > 0 ? `(${history.length})` : ''}`}
            </button>
          ))}
        </div>

        {/* Live result */}
        {activeTab === 'live' && (
          <div className="fade-in" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <ResultPanel
              label="Native HTTP"
              result={result?.native || null}
              loading={loading}
              side="native"
            />
            <ResultPanel
              label="Bright Data"
              result={result?.brightdata || null}
              loading={loading}
              side="bright"
            />
          </div>
        )}

        {/* History tab */}
        {activeTab === 'history' && (
          <div className="fade-in" style={{
            background: 'var(--bg-2)',
            border: '1px solid var(--border)',
            borderRadius: 16,
            overflow: 'hidden',
          }}>
            
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Query History</div>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Persisted in SQLite · Last 20 runs</span>
            </div>
            <HistoryTable history={history} />
          </div>
        )}

        {/* Footer */}
        <div style={{
          marginTop: 48, paddingTop: 24,
          borderTop: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', flexWrap: 'wrap', gap: 12,
        }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
            Results stored in SQLite
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{
              fontSize: 11, background: 'var(--green-dim)', color: 'var(--green)',
              border: '1px solid rgba(34,197,94,0.15)', borderRadius: 4, padding: '3px 8px',
            }}>LIVE</span>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Kiro Demo v1.0</span>
          </div>
        </div>
      </main>
    </div>
  );
}

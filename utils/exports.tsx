'use client';

import React, { useState } from 'react';
import { HistoryRow } from './interfaces';

// ── Types ─────────────────────────────────────────────────────────────────────


// ── Helpers ───────────────────────────────────────────────────────────────────

const CSV_HEADERS: (keyof HistoryRow)[] = [
  'id', 'query_type', 'target',
  'native_status', 'native_items_count', 'native_duration_ms', 'native_error',
  'brightdata_status', 'brightdata_items_count', 'brightdata_duration_ms', 'brightdata_error',
  'created_at',
];

function escapeCSV(value: unknown): string {
  if (value == null) return '';
  const s = String(value);
  return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

function toCSV(rows: HistoryRow[]): string {
  const header = CSV_HEADERS.join(',');
  const body = rows.map(r => CSV_HEADERS.map(k => escapeCSV(r[k])).join(','));
  return [header, ...body].join('\n');
}

function toPlainText(rows: HistoryRow[]): string {
  return rows.map(r =>
    `[${r.created_at}] ${r.target} (${r.query_type}) | ` +
    `Native: ${r.native_status} · ${r.native_items_count} items · ${r.native_duration_ms}ms | ` +
    `BD: ${r.brightdata_status} · ${r.brightdata_items_count} items · ${r.brightdata_duration_ms}ms`
  ).join('\n');
}

// ── Component ─────────────────────────────────────────────────────────────────

interface ExportButtonsProps {
  history: HistoryRow[];
}

export function ExportButtons({ history }: ExportButtonsProps) {
  const [copied, setCopied] = useState(false);

  if (!history.length) return null;

  function handleCSV() {
    triggerDownload(new Blob([toCSV(history)], { type: 'text/csv' }), 'kiro-history.csv');
  }

  function handleJSON() {
    triggerDownload(
      new Blob([JSON.stringify(history, null, 2)], { type: 'application/json' }),
      'kiro-history.json',
    );
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(toPlainText(history));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard permission denied — silently ignore or show a toast
    }
  }

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <Btn onClick={handleCSV}>↓ CSV</Btn>
      <Btn onClick={handleJSON}>↓ JSON</Btn>
      <Btn onClick={handleCopy}>{copied ? '✓ Copied' : '⎘ Copy'}</Btn>
    </div>
  );
}

function Btn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 10px',
        borderRadius: 6,
        border: '1px solid var(--border)',
        background: 'var(--bg-3)',
        color: 'var(--text-2)',
        fontSize: 12,
        cursor: 'pointer',
        fontFamily: 'var(--font)',
      }}
    >
      {children}
    </button>
  );
}
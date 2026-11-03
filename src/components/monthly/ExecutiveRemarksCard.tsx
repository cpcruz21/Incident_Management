'use client';

import React, { useMemo } from 'react';

interface ExecutiveRemarksCardProps {
  remarks: string;
}

interface KpiLine {
  title: string;
  status: 'Met' | 'Failed';
  percent: string;
  desc: string;
}

interface ParsedRemarks {
  summary: string;
  kpiLines: KpiLine[];
  bodyLines: string[]; // observations + recommendation as plain paragraphs
}

function parseRemarks(remarks: string): ParsedRemarks {
  const lines = remarks
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  let summary = '';
  const kpiLines: KpiLine[] = [];
  const bodyLines: string[] = [];

  for (const line of lines) {
    // Skip legacy section headers if they ever appear
    if (/^observations:$/i.test(line)) continue;

    // Match KPI lines: "Target Resolution Time: Met (96.72%) - description"
    const kpiMatch = line.match(
      /^(Target\s+\w[\w\s]+?):\s*(Met|Failed|Passed|Not Met)\s*\(([^)]+)\)\s*[-–]?\s*(.*)?$/i
    );
    if (kpiMatch) {
      const rawStatus = kpiMatch[2].toLowerCase();
      kpiLines.push({
        title: kpiMatch[1].trim(),
        status: rawStatus === 'met' || rawStatus === 'passed' ? 'Met' : 'Failed',
        percent: kpiMatch[3].trim(),
        desc: kpiMatch[4]?.trim() ?? '',
      });
      continue;
    }

    // First non-KPI line is the summary
    if (!summary) {
      summary = line;
      continue;
    }

    // Everything else is body (observations + recommendation as plain text)
    bodyLines.push(line);
  }

  return { summary, kpiLines, bodyLines };
}

export function ExecutiveRemarksCard({ remarks }: ExecutiveRemarksCardProps) {
  const { summary, kpiLines, bodyLines } = useMemo(
    () => parseRemarks(remarks),
    [remarks]
  );

  if (!remarks?.trim()) return null;

  return (
    <div
      style={{
        background: '#111c30',
        border: '1px solid #1e293b',
        borderRadius: '16px',
        padding: '22px 26px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
        marginTop: '16px',
      }}
    >
      {/* ── Heading ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '16px',
          paddingBottom: '12px',
          borderBottom: '1px solid #1e293b',
        }}
      >
        <span style={{ fontSize: '16px' }}>📝</span>
        <h3
          style={{
            fontSize: '13px',
            fontWeight: 800,
            color: '#f8fafc',
            margin: 0,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          Executive Remarks &amp; Strategic Observations
        </h3>
      </div>

      {/* ── Continuous narrative ── */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          fontSize: '13px',
          lineHeight: 1.75,
          color: '#cbd5e1',
        }}
      >
        {/* Summary */}
        {summary && (
          <p style={{ margin: 0, color: '#e2e8f0' }}>{summary}</p>
        )}

        {/* KPI lines */}
        {kpiLines.map((kpi, i) => {
          const isMet = kpi.status === 'Met';
          return (
            <p key={i} style={{ margin: 0 }}>
              <span style={{ fontWeight: 700, color: '#93c5fd' }}>
                {kpi.title}:{' '}
              </span>
              <span
                style={{
                  fontWeight: 800,
                  color: isMet ? '#34d399' : '#f87171',
                  background: isMet
                    ? 'rgba(16,185,129,0.12)'
                    : 'rgba(239,68,68,0.12)',
                  padding: '1px 7px',
                  borderRadius: '4px',
                  marginRight: '4px',
                }}
              >
                {isMet ? '✓ Met' : '⚠ Failed'} ({kpi.percent})
              </span>
              {kpi.desc && (
                <span style={{ color: '#cbd5e1' }}>— {kpi.desc}</span>
              )}
            </p>
          );
        })}

        {/* Body paragraphs — observations + recommendation, plain text, no labels */}
        {bodyLines.length > 0 && (
          <>
            <div style={{ height: '1px', background: '#1e293b', margin: '4px 0' }} />
            {bodyLines.map((line, i) => (
              <p key={i} style={{ margin: 0, color: '#cbd5e1' }}>
                {line}
              </p>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

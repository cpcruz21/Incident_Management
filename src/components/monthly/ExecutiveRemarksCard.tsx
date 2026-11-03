'use client';

import React, { useMemo } from 'react';

interface ExecutiveRemarksCardProps {
  remarks: string;
}

export function ExecutiveRemarksCard({ remarks }: ExecutiveRemarksCardProps) {
  const { summary, kpiLines, observationLines, recommendation } = useMemo(() => {
    const rawLines = remarks.split('\n').map((l) => l.trim()).filter(Boolean);
    let summaryText = '';
    const kpis: { title: string; status: 'Met' | 'Failed'; percent: string; desc: string }[] = [];
    const obs: string[] = [];
    let recText = '';
    let inObs = false;

    for (const line of rawLines) {
      const targetMatch = line.match(/^Target\s+(.*?):\s*(Met|Failed)\s*\((.*?)\)\s*-\s*(.*)$/i);
      if (targetMatch) {
        kpis.push({
          title: `Target ${targetMatch[1]}`,
          status: targetMatch[2].toLowerCase() === 'met' ? 'Met' : 'Failed',
          percent: targetMatch[3],
          desc: targetMatch[4],
        });
        continue;
      }
      if (/^observations:/i.test(line)) {
        inObs = true;
        continue;
      }
      const recMatch = line.match(/^recommendation:\s*(.*)$/i);
      if (recMatch) {
        inObs = false;
        recText = recMatch[1];
        continue;
      }
      if (inObs) {
        obs.push(line);
        continue;
      }
      if (!summaryText && !line.startsWith('Target') && !line.startsWith('Observations') && !line.startsWith('Recommendation')) {
        summaryText = line;
      }
    }

    return { summary: summaryText, kpiLines: kpis, observationLines: obs, recommendation: recText };
  }, [remarks]);

  const isStructured = kpiLines.length > 0 || observationLines.length > 0 || Boolean(recommendation);

  return (
    <div
      style={{
        background: '#111c30',
        border: '1px solid #1e293b',
        borderRadius: '16px',
        padding: '22px 24px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #1e293b', paddingBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px' }}>📝</span>
          <h3 style={{ fontSize: '13px', fontWeight: 800, color: '#f8fafc', margin: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Executive Remarks &amp; Strategic Observations
          </h3>
        </div>
        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: '999px',
            background: 'rgba(56, 189, 248, 0.12)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            color: '#38bdf8',
          }}
        >
          Executive Summary
        </span>
      </div>

      {!isStructured ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', color: '#cbd5e1', lineHeight: 1.6 }}>
          {remarks.split('\n').map((line, i) => {
            const trimmed = line.trim();
            if (!trimmed) return null;
            return <p key={i} style={{ margin: 0 }}>{trimmed}</p>;
          })}
        </div>
      ) : (
        <>
          {/* 1. High-level Summary Banner */}
          {summary && (
            <div
              style={{
                background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.1) 0%, rgba(8, 145, 178, 0.06) 100%)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                borderLeft: '4px solid #38bdf8',
                borderRadius: '10px',
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <span style={{ fontSize: '20px', flexShrink: 0 }}>📌</span>
              <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: '#f8fafc', lineHeight: 1.6 }}>
                {summary}
              </p>
            </div>
          )}

          {/* 2. KPI Evaluation Highlights Grid */}
          {kpiLines.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '12px' }}>
              {kpiLines.map((kpi, idx) => {
                const isMet = kpi.status === 'Met';
                return (
                  <div
                    key={idx}
                    style={{
                      background: '#091426',
                      border: '1px solid #1e293b',
                      borderRadius: '12px',
                      padding: '14px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        {kpi.title}
                      </span>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: isMet ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                          color: isMet ? '#34d399' : '#f87171',
                          border: `1px solid ${isMet ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                        }}
                      >
                        {isMet ? '✓ MET' : '⚠️ MISSED'} {kpi.percent && `(${kpi.percent})`}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '12px', color: '#cbd5e1', lineHeight: 1.5 }}>
                      {kpi.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {/* 3. Operational Observations */}
          {observationLines.length > 0 && (
            <div
              style={{
                background: '#091426',
                border: '1px solid #1e293b',
                borderRadius: '12px',
                padding: '16px 18px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '14px' }}>🔍</span>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Key Operational Observations
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {observationLines.map((obs, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <span style={{ color: '#38bdf8', fontSize: '14px', lineHeight: 1.4 }}>•</span>
                    <p style={{ margin: 0, fontSize: '12px', color: '#cbd5e1', lineHeight: 1.5 }}>
                      {obs}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4. Strategic Recommendation Callout */}
          {recommendation && (
            <div
              style={{
                background: 'rgba(56, 189, 248, 0.04)',
                border: '1px solid rgba(56, 189, 248, 0.22)',
                borderLeft: '4px solid #38bdf8',
                borderRadius: '12px',
                padding: '16px 18px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '16px' }}>💡</span>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Strategic Recommendation
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '12px', color: '#e2e8f0', lineHeight: 1.6 }}>
                {recommendation}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

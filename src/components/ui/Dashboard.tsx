'use client';

import React, { useState, useEffect } from 'react';
import type { Account } from '@/lib/auth';
import { isAdmin } from '@/lib/auth';
import { StoredReportsList } from '@/components/report/StoredReportsList';
import type { StoredReport } from '@/lib/storage/report-storage';

export type DashboardView = 'dashboard' | 'weekly' | 'monthly' | 'aging';

interface DashboardProps {
  account: Account;
  onSelectReport: (view: DashboardView) => void;
  onOpenStoredReport?: (report: StoredReport) => void;
  onLogout: () => void;
}

export function Dashboard({ account, onSelectReport, onOpenStoredReport, onLogout }: DashboardProps) {
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    // Load Tailwind CDN
    if (!document.getElementById('tailwind-cdn')) {
      const script = document.createElement('script');
      script.id = 'tailwind-cdn';
      script.src = 'https://cdn.tailwindcss.com/3.4.17';
      document.head.appendChild(script);
    }
    // Load Lucide CDN
    if (!document.getElementById('lucide-cdn')) {
      const script = document.createElement('script');
      script.id = 'lucide-cdn';
      script.src = 'https://cdn.jsdelivr.net/npm/lucide@0.577.0/dist/umd/lucide.min.js';
      script.onload = () => {
        // @ts-ignore
        if (window.lucide) window.lucide.createIcons();
      };
      document.head.appendChild(script);
    } else {
      // @ts-ignore
      if (window.lucide) window.lucide.createIcons();
    }
  }, [selected]); // re-run lucide icons when selection changes if needed

  function handleOpen(view: DashboardView) {
    onSelectReport(view);
  }

  return (
    <div className="dashboard-body shell" style={{ background: 'rgb(9, 20, 38)' }}>
        <header className="topbar">
          <div className="topbar-inner mx-auto flex h-full max-w-[1240px] items-center justify-between px-8">
            <div className="flex items-center gap-4">
              <div className="grid h-29 w-16 place-items-center" aria-hidden="true">
                <img src="/images/EQUI.png" alt="Equicom Logo" className="w-full h-full object-contain scale-110" />
              </div>
              <div>
                <p className="m-0 text-[10px] font-bold uppercase tracking-[.14em] text-sky-300" style={{ color: 'rgb(125, 211, 252)', fontWeight: 700, fontStyle: 'normal', fontSize: '10px', letterSpacing: '0.12rem' }}>Incident Management</p>
                <h1 className="m-0 text-sm font-bold text-white" style={{ color: 'rgb(255, 255, 255)', fontWeight: 700, fontStyle: 'normal', fontSize: '30px' }}>SMAC REPORTING</h1>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={onLogout}
                className="header-user-badge"
                title="Click to log out"
              >
                👤 {account.name}
                {isAdmin(account) && (
                  <span className="badge-role">Admin</span>
                )}
              </button>
            </div>
          </div>
        </header>
        <main className="page-wrap">
          <section id="landing-view" className="view active" aria-labelledby="landing-heading">
            <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow mb-2" style={{ color: 'rgb(85, 214, 255)', fontWeight: 700, fontStyle: 'normal', fontSize: '15px' }}>Reporting workspace</p>
                <h2 id="landing-heading" className="m-0 text-3xl font-bold tracking-tight text-white" style={{ color: 'rgb(255, 255, 255)', fontWeight: 700, fontStyle: 'normal', fontSize: '23px' }}>Choose a report section</h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300" style={{ color: 'rgb(203, 213, 225)', fontWeight: 400, fontStyle: 'normal', fontSize: '15px' }}>Select a scheduled workflow to generate an incident report.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3" aria-label="Available report sections">

              <article className={`report-card card ${selected === 'weekly' ? 'is-selected' : ''}`} onClick={() => setSelected('weekly')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-blue-500/15 text-blue-300">
                    <i data-lucide="calendar-days" style={{ width: 21, height: 21 }}></i>
                  </div>
                  <span className="flex items-center gap-2 text-xs text-slate-300">
                    <span className="status-dot"></span><span className="selection-copy">{selected === 'weekly' ? 'Selected' : 'Not selected'}</span>
                  </span>
                </div>
                <p className="mt-7 text-xs font-bold uppercase tracking-[.12em] text-sky-300" style={{ color: 'rgb(125, 211, 252)', fontWeight: 700, fontStyle: 'normal', fontSize: '15px' }}>Scheduled follow-up</p>
                <h3 className="mt-2 text-xl font-bold leading-tight text-white" style={{ color: 'rgb(255, 255, 255)', fontWeight: 700, fontStyle: 'normal', fontSize: '18px' }}>Weekly Report</h3>
                <button type="button" className="open-report primary-btn mt-auto flex w-full items-center justify-center gap-2 px-4 py-3" onClick={(e) => { e.stopPropagation(); handleOpen('weekly'); }}>
                  <span>Open report</span><i data-lucide="arrow-right" style={{ width: 16, height: 16 }}></i>
                </button>
              </article>

              <article className={`report-card card ${selected === 'monthly' ? 'is-selected' : ''}`} onClick={() => setSelected('monthly')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-violet-500/15 text-violet-300">
                    <i data-lucide="calendar-range" style={{ width: 21, height: 21 }}></i>
                  </div>
                  <span className="flex items-center gap-2 text-xs text-slate-300">
                    <span className="status-dot"></span><span className="selection-copy">{selected === 'monthly' ? 'Selected' : 'Not selected'}</span>
                  </span>
                </div>
                <p className="mt-7 text-xs font-bold uppercase tracking-[.12em] text-violet-300" style={{ color: 'rgb(196, 181, 253)', fontWeight: 700, fontStyle: 'normal', fontSize: '15px' }}>Monthly review</p>
                <h3 className="mt-2 text-xl font-bold leading-tight text-white" style={{ color: 'rgb(255, 255, 255)', fontWeight: 700, fontStyle: 'normal', fontSize: '18px' }}>Monthly Incident Report</h3>
                <button type="button" className="open-report primary-btn mt-auto flex w-full items-center justify-center gap-2 px-4 py-3" onClick={(e) => { e.stopPropagation(); handleOpen('monthly'); }}>
                  <span>Open report</span><i data-lucide="arrow-right" style={{ width: 16, height: 16 }}></i>
                </button>
              </article>

              <article className={`report-card card ${selected === 'aging' ? 'is-selected' : ''}`} onClick={() => setSelected('aging')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="grid h-11 w-11 place-items-center rounded-xl bg-amber-500/15 text-amber-300">
                    <i data-lucide="trending-up" style={{ width: 21, height: 21 }}></i>
                  </div>
                  <span className="flex items-center gap-2 text-xs text-slate-300">
                    <span className="status-dot"></span><span className="selection-copy">{selected === 'aging' ? 'Selected' : 'Not selected'}</span>
                  </span>
                </div>
                <p className="mt-7 text-xs font-bold uppercase tracking-[.12em] text-amber-300" style={{ color: 'rgb(252, 211, 77)', fontWeight: 700, fontStyle: 'normal', fontSize: '15px' }}>Aging trends</p>
                <h3 className="mt-2 text-xl font-bold leading-tight text-white" style={{ color: 'rgb(255, 255, 255)', fontWeight: 700, fontStyle: 'normal', fontSize: '18px' }}>Aging Incident Report</h3>
                <button type="button" className="open-report primary-btn mt-auto flex w-full items-center justify-center gap-2 px-4 py-3" onClick={(e) => { e.stopPropagation(); handleOpen('aging'); }}>
                  <span>Open report</span><i data-lucide="arrow-right" style={{ width: 16, height: 16 }}></i>
                </button>
              </article>
            </div>

            {/* Stored Reports Section */}
            <div className="mt-10">
              <StoredReportsList
                onOpenReport={(report) => {
                  if (onOpenStoredReport) {
                    onOpenStoredReport(report);
                  }
                }}
              />
            </div>
          </section>
        </main>
        <footer className="mt-8 border-t border-slate-600/60 px-6 py-4">
          <div className="flex flex-col items-center justify-center text-center">
            <p className="m-0 text-[10px] leading-4 text-slate-500">
              ©SMAC-S 2026.
            </p>
          </div>
        </footer>
      </div>
  );
}

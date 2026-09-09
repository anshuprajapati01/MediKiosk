"use client";

import { useMemo } from "react";

export interface TimelineEvent {
  id: string;
  date: string;
  type: "interview" | "document" | "lab_result" | "medication";
  title: string;
  description?: string;
  sourceRef?: string;
}

interface MedicalTimelineProps {
  events: TimelineEvent[];
  className?: string;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getTypeConfig(type: TimelineEvent["type"]) {
  switch (type) {
    case "interview":
      return {
        dot: "bg-emerald-400",
        ring: "ring-emerald-400/30",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        ),
        label: "Interview",
      };
    case "document":
      return {
        dot: "bg-sky-400",
        ring: "ring-sky-400/30",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        ),
        label: "Document",
      };
    case "lab_result":
      return {
        dot: "bg-amber-400",
        ring: "ring-amber-400/30",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        ),
        label: "Lab Result",
      };
    case "medication":
      return {
        dot: "bg-rose-400",
        ring: "ring-rose-400/30",
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12.75l-6 6m0 0l-6-6m6 6V3" />
          </svg>
        ),
        label: "Medication",
      };
    default:
      return {
        dot: "bg-slate-400",
        ring: "ring-slate-400/30",
        icon: null,
        label: type,
      };
  }
}

export default function MedicalTimeline({ events, className }: MedicalTimelineProps) {
  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [events],
  );

  if (sortedEvents.length === 0) {
    return (
      <div
        className={`rounded-2xl border border-white/10 bg-slate-800/40 p-6 text-center backdrop-blur-md ${className ?? ""}`.trim()}
      >
        <p className="text-sm text-slate-400">No timeline events available.</p>
      </div>
    );
  }

  return (
    <div
      className={`relative rounded-2xl border border-white/10 bg-slate-800/40 backdrop-blur-md ${className ?? ""}`.trim()}
    >
      <div className="absolute left-8 top-4 bottom-4 w-px bg-slate-700" />

      <div className="max-h-72 overflow-y-auto pr-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700/60 hover:scrollbar-thumb-slate-600/80">
        <div className="flex flex-col gap-3 py-3">
          {sortedEvents.map((event) => {
            const config = getTypeConfig(event.type);

            return (
              <div key={event.id} className="relative flex gap-3 pl-2">
                <div className="flex flex-col items-center">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 ring-2 ${config.ring}`}
                  >
                    <span className={`h-2.5 w-2.5 rounded-full ${config.dot}`} />
                  </span>
                </div>

                <div className="min-w-0 flex-1 rounded-lg border border-white/5 bg-white/5 p-3 transition-colors hover:bg-white/10">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border ${config.ring} bg-slate-900/60 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-300`}
                    >
                      {config.icon}
                      {config.label}
                    </span>
                    <span className="text-xs text-slate-400">{formatDate(event.date)}</span>
                  </div>

                  <h4 className="mt-1 text-sm font-semibold text-white">{event.title}</h4>

                  {event.description && (
                    <p className="mt-0.5 text-xs text-slate-400">{event.description}</p>
                  )}

                  {event.sourceRef && (
                    <span className="mt-1 inline-block text-[10px] text-sky-400">Ref: {event.sourceRef}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 rounded-b-2xl bg-gradient-to-t from-slate-800/90 to-transparent" />
    </div>
  );
}
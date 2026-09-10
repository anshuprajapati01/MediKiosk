"use client";

import { useEffect, useState } from "react";
import { createSupabaseClient } from "@/lib/supabase/client";

type Stats = {
  total: number;
  pendingTriage: number;
  underReview: number;
  completed: number;
};

type NavTab = "overview" | "staff" | "departments" | "questionnaires" | "settings";

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<NavTab>("overview");
  const [stats, setStats] = useState<Stats>({
    total: 0,
    pendingTriage: 0,
    underReview: 0,
    completed: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  type StaffMember = {
    id: string;
    name: string;
    email: string;
    role: "Doctor" | "Triage" | "Admin";
    department: string;
    status: "Active" | "Inactive";
  };

  const initialStaff: StaffMember[] = [
    { id: "1", name: "Dr. Sharma", email: "sharma@medikiosk.com", role: "Doctor", department: "Cardiology", status: "Active" },
    { id: "2", name: "Nurse Anjali", email: "anjali@medikiosk.com", role: "Triage", department: "Emergency", status: "Active" },
    { id: "3", name: "Dr. Gupta", email: "gupta@medikiosk.com", role: "Doctor", department: "General", status: "Active" },
    { id: "4", name: "Admin Priya", email: "priya@medikiosk.com", role: "Admin", department: "Operations", status: "Inactive" },
  ];

  const [staffMembers, setStaffMembers] = useState<StaffMember[]>(initialStaff);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newStaffName, setNewStaffName] = useState("");
  const [newStaffEmail, setNewStaffEmail] = useState("");
  const [newStaffRole, setNewStaffRole] = useState<"Doctor" | "Triage" | "Admin">("Doctor");
  const [newStaffDepartment, setNewStaffDepartment] = useState("General");

  useEffect(() => {
    if (!isModalOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsModalOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isModalOpen]);

  useEffect(() => {
    async function loadStats() {
      try {
        const supabase = createSupabaseClient();

        const { data: interviewsData, error: interviewsError } = await supabase
          .from("interviews")
          .select("status")
          .order("created_at", { ascending: true });

        if (interviewsError) {
          setError("Unable to load analytics. Please try again later.");
          setIsLoading(false);
          return;
        }

        const all = interviewsData ?? [];
        setStats({
          total: all.length,
          pendingTriage: all.filter((i) => i.status === "awaiting_review").length,
          underReview: all.filter((i) => i.status === "under_review").length,
          completed: all.filter((i) => i.status === "completed").length,
        });
      } catch {
        setError("An unexpected error occurred. Please try again later.");
      } finally {
        setIsLoading(false);
      }
    }

    loadStats();
  }, []);

  const navItems: { id: NavTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "staff", label: "Staff Management" },
    { id: "departments", label: "Departments" },
    { id: "questionnaires", label: "Questionnaires" },
    { id: "settings", label: "Settings" },
  ];

  function handleOpenModal() {
    setNewStaffName("");
    setNewStaffEmail("");
    setNewStaffRole("Doctor");
    setNewStaffDepartment("General");
    setIsModalOpen(true);
  }

  function handleSaveStaff() {
    if (!newStaffName.trim() || !newStaffEmail.trim()) return;
    const newMember: StaffMember = {
      id: Date.now().toString(),
      name: newStaffName.trim(),
      email: newStaffEmail.trim(),
      role: newStaffRole,
      department: newStaffDepartment,
      status: "Active",
    };
    setStaffMembers((prev) => [...prev, newMember]);
    setIsModalOpen(false);
  }

  const renderTab = () => {
    switch (activeTab) {
      case "overview":
        return (
          <div className="flex flex-col gap-6">
            {isLoading ? (
              <div className="flex flex-1 items-center justify-center py-20">
                <div className="flex flex-col items-center gap-4">
                  <div className="h-12 w-12 animate-spin rounded-full border-4 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
                  <p className="text-lg text-zinc-600 dark:text-zinc-400">Loading analytics...</p>
                </div>
              </div>
            ) : error ? (
              <div className="w-full max-w-md px-6">
                <div className="rounded-2xl border-2 border-red-500 bg-red-50 p-8 text-center dark:bg-red-950">
                  <h2 className="mb-2 text-xl font-semibold text-red-900 dark:text-red-200">Something went wrong</h2>
                  <p className="text-base text-red-800 dark:text-red-300">{error}</p>
                </div>
              </div>
            ) : (
              <>
                <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
                  {[
                    {
                      label: "Total Cases",
                      value: stats.total,
                      gradient: "from-indigo-500 to-indigo-600",
                      shadow: "rgba(99,102,241,0.4)",
                      icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                        </svg>
                      ),
                    },
                    {
                      label: "Pending Triage",
                      value: stats.pendingTriage,
                      gradient: "from-amber-500 to-amber-600",
                      shadow: "rgba(245,158,11,0.4)",
                      icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      ),
                    },
                    {
                      label: "Under Doctor Review",
                      value: stats.underReview,
                      gradient: "from-purple-500 to-purple-600",
                      shadow: "rgba(168,85,247,0.4)",
                      icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                        </svg>
                      ),
                    },
                    {
                      label: "Completed",
                      value: stats.completed,
                      gradient: "from-emerald-500 to-emerald-600",
                      shadow: "rgba(16,185,129,0.4)",
                      icon: (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15l2.55-2.55L15 14.25l-3.75 3.75L7.5 15z" />
                          <circle cx={12} cy={12} r={9} />
                        </svg>
                      ),
                    },
                  ].map((stat) => (
                    <div
                      key={stat.label}
                      className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur-md transition hover:border-white/20 dark:border-white/5 dark:bg-white/5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">{stat.label}</span>
                        <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${stat.gradient} text-white shadow-[0_0_20px_${stat.shadow}]`}>
                          {stat.icon}
                        </div>
                      </div>
                      <p className="text-3xl font-bold text-white">{stat.value}</p>
                    </div>
                  ))}
                </div>

                <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-md dark:border-white/5 dark:bg-white/5">
                  <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent pointer-events-none" />
                  <div className="relative">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">Case Volume Trends</h2>
                        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Monthly intake and completion analytics for the current period.</p>
                      </div>
                      <span className="inline-flex items-center rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-indigo-300">
                        Last 12 months
                      </span>
                    </div>
                    <div className="mt-8 flex h-64 items-center justify-center rounded-xl border-2 border-dashed border-white/10 bg-white/5">
                      <div className="text-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="mx-auto h-12 w-12 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125h-2.25A1.125 1.125 0 013 16.125v-2.25zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v8.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125v-8.25zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V16.5m-13.5-6.375h13.5c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125H3.375c-.621 0-1.125-.504-1.125-1.125v-9.75c0-.621.504-1.125 1.125-1.125z" />
                        </svg>
                        <p className="mt-3 text-sm text-slate-400">Analytics chart integration pending for Phase 18.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        );
       case "staff":
         return (
           <div className="flex flex-col gap-6">
             <div className="flex items-center justify-between">
               <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Hospital Staff &amp; Access Control</h2>
               <button
                 type="button"
                 onClick={handleOpenModal}
                 className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-[0_0_20px_rgba(16,185,129,0.4)] transition-transform hover:scale-[1.01] hover:shadow-[0_0_25px_rgba(16,185,129,0.5)] focus:ring-2 focus:ring-emerald-400 focus:outline-none"
               >
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                   <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                 </svg>
                 Add New Staff
               </button>
             </div>

             <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/5 shadow-2xl backdrop-blur-md">
               <table className="w-full text-left text-sm">
                 <thead>
                   <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-gray-400">
                     <th className="px-6 py-4 font-semibold">Name</th>
                     <th className="px-6 py-4 font-semibold">Role</th>
                     <th className="px-6 py-4 font-semibold">Department</th>
                     <th className="px-6 py-4 font-semibold">Status</th>
                     <th className="px-6 py-4 font-semibold text-right">Actions</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-white/5">
                   {staffMembers.map((member) => (
                     <tr key={member.id} className="transition hover:bg-white/5">
                       <td className="px-6 py-4">
                         <div className="flex flex-col">
                           <span className="font-semibold text-white">{member.name}</span>
                           <span className="text-xs text-gray-400">{member.email}</span>
                         </div>
                       </td>
                       <td className="px-6 py-4">
                         <span
                           className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                             member.role === "Doctor"
                               ? "border border-blue-500/30 bg-blue-500/10 text-blue-300"
                               : member.role === "Triage"
                                 ? "border border-amber-500/30 bg-amber-500/10 text-amber-300"
                                 : "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                           }`}
                         >
                           {member.role}
                         </span>
                       </td>
                       <td className="px-6 py-4 text-gray-300">{member.department}</td>
                       <td className="px-6 py-4">
                         <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                           <span className="h-2 w-2 rounded-full bg-emerald-400" />
                           {member.status}
                         </span>
                       </td>
                       <td className="px-6 py-4 text-right">
                         <div className="flex items-center justify-end gap-2">
                           <button
                             type="button"
                             className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-slate-400 transition hover:text-white hover:border-white/20 focus:ring-2 focus:ring-white/20 focus:outline-none"
                           >
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                               <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.862 4.487z" />
                             </svg>
                           </button>
                           <button
                             type="button"
                             className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-slate-400 transition hover:text-rose-400 hover:border-rose-500/30 focus:ring-2 focus:ring-rose-500/20 focus:outline-none"
                           >
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                               <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                               <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l6 6M15 15l-6-6" />
                             </svg>
                           </button>
                         </div>
                       </td>
                     </tr>
                   ))}
                 </tbody>
               </table>
             </div>

             {isModalOpen && (
               <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                 <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
                 <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-slate-900/90 p-6 shadow-2xl backdrop-blur-xl">
                   <div className="flex items-center justify-between">
                     <h3 className="text-lg font-bold text-white">Add New Staff</h3>
                     <button
                       type="button"
                       onClick={() => setIsModalOpen(false)}
                       className="shrink-0 rounded-lg border border-white/10 bg-white/5 p-1.5 text-slate-400 transition hover:text-white hover:border-white/20 focus:ring-2 focus:ring-white/20 focus:outline-none"
                     >
                       <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                         <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                       </svg>
                     </button>
                   </div>

                   <div className="mt-5 flex flex-col gap-4">
                     <div>
                       <label htmlFor="staff-name" className="block text-xs font-semibold uppercase tracking-wider text-slate-400">Full Name</label>
                       <input
                         id="staff-name"
                         type="text"
                         value={newStaffName}
                         onChange={(e) => setNewStaffName(e.target.value)}
                         className="mt-2 w-full rounded-xl border border-white/10 bg-zinc-900/50 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                         placeholder="Dr. Full Name"
                       />
                     </div>
                     <div>
                       <label htmlFor="staff-email" className="block text-xs font-semibold uppercase tracking-wider text-slate-400">Email</label>
                       <input
                         id="staff-email"
                         type="email"
                         value={newStaffEmail}
                         onChange={(e) => setNewStaffEmail(e.target.value)}
                         className="mt-2 w-full rounded-xl border border-white/10 bg-zinc-900/50 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                         placeholder="name@medikiosk.com"
                       />
                     </div>
                     <div>
                       <label htmlFor="staff-role" className="block text-xs font-semibold uppercase tracking-wider text-slate-400">Role</label>
                       <select
                         id="staff-role"
                         value={newStaffRole}
                         onChange={(e) => setNewStaffRole(e.target.value as "Doctor" | "Triage" | "Admin")}
                         className="mt-2 w-full rounded-xl border border-white/10 bg-zinc-900/50 px-4 py-2.5 text-sm text-zinc-100 focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                       >
                         <option value="Doctor">Doctor</option>
                         <option value="Triage">Triage</option>
                         <option value="Admin">Admin</option>
                       </select>
                     </div>
                     <div>
                       <label htmlFor="staff-dept" className="block text-xs font-semibold uppercase tracking-wider text-slate-400">Department</label>
                       <select
                         id="staff-dept"
                         value={newStaffDepartment}
                         onChange={(e) => setNewStaffDepartment(e.target.value)}
                         className="mt-2 w-full rounded-xl border border-white/10 bg-zinc-900/50 px-4 py-2.5 text-sm text-zinc-100 focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                       >
                         <option value="General">General</option>
                         <option value="Cardiology">Cardiology</option>
                         <option value="Neurology">Neurology</option>
                         <option value="Emergency">Emergency</option>
                         <option value="Operations">Operations</option>
                       </select>
                     </div>
                     <div className="flex items-center justify-end gap-3">
                       <button
                         type="button"
                         onClick={() => setIsModalOpen(false)}
                         className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:border-white/20 hover:text-white focus:ring-2 focus:ring-white/20 focus:outline-none"
                       >
                         Cancel
                       </button>
                       <button
                         type="button"
                         onClick={handleSaveStaff}
                         className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-2.5 text-sm font-bold text-white shadow-[0_0_20px_rgba(99,102,241,0.35)] transition-transform hover:scale-[1.01] hover:shadow-[0_0_25px_rgba(99,102,241,0.45)] focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                       >
                         Save
                       </button>
                     </div>
                   </div>
                 </div>
               </div>
             )}
           </div>
         );
      case "departments":
        return (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/5 p-12">
            <p className="text-lg text-zinc-600 dark:text-zinc-400">Departments — coming in a future phase.</p>
          </div>
        );
      case "questionnaires":
        return (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/5 p-12">
            <p className="text-lg text-zinc-600 dark:text-zinc-400">Questionnaires — coming in a future phase.</p>
          </div>
        );
      case "settings":
        return (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/5 p-12">
            <p className="text-lg text-zinc-600 dark:text-zinc-400">Settings — coming in a future phase.</p>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex min-h-screen bg-zinc-50 dark:bg-black">
      <aside className="flex w-60 flex-col border-r border-white/10 bg-white/5 backdrop-blur-xl dark:border-white/5 dark:bg-zinc-900/60">
        <div className="flex h-16 items-center justify-center border-b border-white/10">
          <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">MediKiosk Admin</h1>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? "bg-indigo-500/15 text-indigo-300"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-3">
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-400 transition hover:bg-white/5 hover:text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
            </svg>
            Sign Out
          </button>
        </div>
      </aside>

      <main className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-white/10 bg-white/5 px-8 backdrop-blur-xl dark:border-white/5 dark:bg-zinc-900/40">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
            {navItems.find((n) => n.id === activeTab)?.label}
          </h2>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15l2.55-2.55L15 14.25l-3.75 3.75L7.5 15z" />
                <circle cx={12} cy={12} r={9} />
              </svg>
              Admin Profile
            </span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8">{renderTab()}</div>
      </main>
    </div>
  );
}

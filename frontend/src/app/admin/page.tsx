"use client";

import { useCallback, useEffect, useState } from "react";
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
    role: "Doctor" | "Nurse" | "Triage" | "Admin";
    department: string;
    status: "Active" | "Inactive";
  };

  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [newStaffName, setNewStaffName] = useState("");
  const [newStaffEmail, setNewStaffEmail] = useState("");
  const [newStaffPassword, setNewStaffPassword] = useState("");
  const [newStaffRole, setNewStaffRole] = useState<"Doctor" | "Nurse" | "Triage" | "Admin">("Doctor");
  const [newStaffDepartmentId, setNewStaffDepartmentId] = useState("");
  const [staffFormError, setStaffFormError] = useState<string | null>(null);

  type DepartmentType = {
    id: string;
    name: string;
    hospital_id: string;
    is_active: boolean;
    hospitals?: { name: string }[] | null;
  };

  const [departments, setDepartments] = useState<DepartmentType[]>([]);
  const [departmentsLoading, setDepartmentsLoading] = useState(false);
  const [departmentsError, setDepartmentsError] = useState<string | null>(null);
  const [isDepartmentModalOpen, setIsDepartmentModalOpen] = useState(false);
  const [newDepartmentName, setNewDepartmentName] = useState("");
  const [newDepartmentHospitalId, setNewDepartmentHospitalId] = useState("");
  const [departmentFormError, setDepartmentFormError] = useState<string | null>(null);

  type QuestionType = {
    id: string;
    questionnaire_id: string;
    text: string;
    type: string;
    category: string | null;
    sort_order: number;
    is_active: boolean;
  };

  type QuestionnaireWithQuestions = {
    id: string;
    name: string;
    version: string;
    category: string;
    description: string | null;
    is_active: boolean;
    created_at: string;
    questions: QuestionType[];
  };

  const [questionnaires, setQuestionnaires] = useState<QuestionnaireWithQuestions[]>([]);
  const [questionnairesLoading, setQuestionnairesLoading] = useState(false);
  const [questionnairesError, setQuestionnairesError] = useState<string | null>(null);
  const [expandedQuestionnaire, setExpandedQuestionnaire] = useState<string | null>(null);

  const [hospitals, setHospitals] = useState<{ id: string; name: string }[]>([]);
  const [departmentsList, setDepartmentsList] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!isStaffModalOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setIsStaffModalOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isStaffModalOpen]);

  useEffect(() => {
    if (!isDepartmentModalOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setIsDepartmentModalOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isDepartmentModalOpen]);

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

  useEffect(() => {
    async function load() {
      try {
        const supabase = createSupabaseClient();
        const [{ data: hospitalsData }, { data: deptsData }] = await Promise.all([
          supabase.from("hospitals").select("id, name").order("name"),
          supabase.from("departments").select("id, name").order("name"),
        ]);
        setHospitals(hospitalsData ?? []);
        setDepartmentsList(deptsData ?? []);
      } catch {
        // silent fail for reference data
      }
    }
    load();
  }, []);

  interface UserWithDoctors {
    id: string;
    email: string;
    full_name: string | null;
    role: string;
    is_active: boolean;
    doctors: Array<{
      department_id: string;
      departments: Array<{ id: string; name: string }>;
    }> | null;
  }

  const loadStaff = useCallback(async () => {
    setStaffLoading(true);
    setStaffError(null);
    try {
      const supabase = createSupabaseClient();
      const { data, error } = await supabase
        .from("users")
        .select(`
          id,
          email,
          full_name,
          role,
          is_active,
          doctors (
            department_id,
            departments (
              id,
              name
            )
          )
        `)
        .in("role", ["doctor", "triage", "admin"])
        .order("created_at", { ascending: false });

      if (error) throw error;

      const mapped: StaffMember[] = ((data ?? []) as unknown as UserWithDoctors[]).map((u) => {
        const deptName = u.doctors?.[0]?.departments?.[0]?.name || "—";
        return {
          id: u.id,
          name: u.full_name || "Unknown",
          email: u.email,
          role: u.role === "doctor" ? "Doctor" : u.role === "triage" ? "Nurse" : "Admin",
          department: deptName,
          status: u.is_active ? "Active" : "Inactive",
        };
      });

      setStaffMembers(mapped);
    } catch (err) {
      setStaffError(err instanceof Error ? err.message : "Failed to load staff");
    } finally {
      setStaffLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab !== "staff") return;
    async function load() {
      await loadStaff();
    }
    load();
  }, [activeTab, loadStaff]);

  interface DepartmentWithHospital {
    id: string;
    name: string;
    hospital_id: string;
    is_active: boolean;
    hospitals?: { name: string }[] | null;
  }

  async function loadDepartments() {
    setDepartmentsLoading(true);
    setDepartmentsError(null);
    try {
      const supabase = createSupabaseClient();
      const { data, error } = await supabase
        .from("departments")
        .select(`
          id,
          name,
          hospital_id,
          is_active,
          hospitals ( name )
        `)
        .order("name");

      if (error) throw error;
      setDepartments((data ?? []) as DepartmentWithHospital[]);
    } catch (err) {
      setDepartmentsError(err instanceof Error ? err.message : "Failed to load departments");
    } finally {
      setDepartmentsLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab !== "departments") return;
    async function load() {
      setDepartmentsLoading(true);
      setDepartmentsError(null);
      try {
        const supabase = createSupabaseClient();
        const { data, error } = await supabase
          .from("departments")
          .select(`
            id,
            name,
            hospital_id,
            is_active,
            hospitals ( name )
          `)
          .order("name");

        if (error) throw error;
        setDepartments((data ?? []) as DepartmentWithHospital[]);
      } catch (err) {
        setDepartmentsError(err instanceof Error ? err.message : "Failed to load departments");
      } finally {
        setDepartmentsLoading(false);
      }
    }
    load();
  }, [activeTab]);

  interface QuestionRow {
    id: string;
    questionnaire_id: string;
    text: string;
    type: string;
    category: string | null;
    sort_order: number;
    is_active: boolean;
  }

  interface QuestionnaireRow {
    id: string;
    name: string;
    version: string;
    category: string;
    description: string | null;
    is_active: boolean;
    created_at: string;
  }

  useEffect(() => {
    if (activeTab !== "questionnaires") return;
    async function load() {
      setQuestionnairesLoading(true);
      setQuestionnairesError(null);
      try {
        const supabase = createSupabaseClient();
        const { data: qData, error: qError } = await supabase
          .from("questionnaires")
          .select("*")
          .eq("is_active", true)
          .order("name");

        if (qError) throw qError;

        const qIds = (qData ?? []).map((q) => q.id);
        const questionsMap: Record<string, QuestionType[]> = {};

        if (qIds.length > 0) {
          const { data: questionsData, error: questionsError } = await supabase
            .from("questions")
            .select("*")
            .in("questionnaire_id", qIds)
            .order("sort_order");

          if (questionsError) throw questionsError;

          for (const q of (questionsData ?? []) as QuestionRow[]) {
            if (!questionsMap[q.questionnaire_id]) {
              questionsMap[q.questionnaire_id] = [];
            }
            questionsMap[q.questionnaire_id].push(q);
          }
        }

        setQuestionnaires(
          ((qData ?? []) as QuestionnaireRow[]).map((q) => ({
            ...q,
            questions: questionsMap[q.id] ?? [],
          }))
        );
      } catch (err) {
        setQuestionnairesError(err instanceof Error ? err.message : "Failed to load questionnaires");
      } finally {
        setQuestionnairesLoading(false);
      }
    }
    load();
  }, [activeTab]);

  async function loadReferenceData() {
    if (hospitals.length > 0 && departmentsList.length > 0) return;
    const supabase = createSupabaseClient();
    const [{ data: hospitalsData }, { data: deptsData }] = await Promise.all([
      supabase.from("hospitals").select("id, name").order("name"),
      supabase.from("departments").select("id, name").order("name"),
    ]);
    setHospitals(hospitalsData ?? []);
    setDepartmentsList(deptsData ?? []);
  }

  function handleOpenStaffModal() {
    setNewStaffName("");
    setNewStaffEmail("");
    setNewStaffPassword("");
    setNewStaffRole("Doctor");
    setNewStaffDepartmentId("");
    setStaffFormError(null);
    loadReferenceData();
    setIsStaffModalOpen(true);
  }

  async function handleSaveStaff() {
    if (!newStaffName.trim() || !newStaffEmail.trim() || !newStaffPassword.trim()) {
      setStaffFormError("Name, email, and password are required.");
      return;
    }

    const supabase = createSupabaseClient();
    const roleValue = newStaffRole.toLowerCase() as "doctor" | "nurse" | "triage" | "admin";

    setStaffFormError(null);

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: newStaffEmail.trim(),
      password: newStaffPassword,
    });

    if (authError || !authData.user) {
      setStaffFormError("Failed to create account: " + (authError?.message || "Unknown error"));
      return;
    }

    const { error: userError } = await supabase.from("users").insert({
      id: authData.user.id,
      email: newStaffEmail.trim(),
      full_name: newStaffName.trim(),
      role: roleValue === "nurse" ? "triage" : roleValue,
      is_active: true,
    });

    if (userError) {
      setStaffFormError("Failed to create profile: " + userError.message);
      return;
    }

    if (roleValue === "doctor" && newStaffDepartmentId) {
      const { error: doctorError } = await supabase.from("doctors").insert({
        user_id: authData.user.id,
        department_id: newStaffDepartmentId,
      });
      if (doctorError) {
        setStaffFormError("Staff created but department assignment failed: " + doctorError.message);
        await loadStaff();
        setIsStaffModalOpen(false);
        return;
      }
    }

    await loadStaff();
    setIsStaffModalOpen(false);
  }

  function handleOpenDepartmentModal() {
    setNewDepartmentName("");
    setNewDepartmentHospitalId(hospitals[0]?.id || "");
    setDepartmentFormError(null);
    loadReferenceData();
    setIsDepartmentModalOpen(true);
  }

  async function handleSaveDepartment() {
    if (!newDepartmentName.trim() || !newDepartmentHospitalId) {
      setDepartmentFormError("Department name and hospital are required.");
      return;
    }

    const supabase = createSupabaseClient();
    const { error } = await supabase.from("departments").insert({
      name: newDepartmentName.trim(),
      hospital_id: newDepartmentHospitalId,
      is_active: true,
    });

    if (error) {
      setDepartmentFormError("Failed to add department: " + error.message);
      return;
    }

    await loadDepartments();
    await loadReferenceData();
    setIsDepartmentModalOpen(false);
  }

  const navItems: { id: NavTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "staff", label: "Staff Management" },
    { id: "departments", label: "Departments" },
    { id: "questionnaires", label: "Questionnaires" },
    { id: "settings", label: "Settings" },
  ];

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
                 onClick={handleOpenStaffModal}
                 className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-[0_0_20px_rgba(16,185,129,0.4)] transition-transform hover:scale-[1.01] hover:shadow-[0_0_25px_rgba(16,185,129,0.5)] focus:ring-2 focus:ring-emerald-400 focus:outline-none"
               >
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                   <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                 </svg>
                 Add New Staff
               </button>
             </div>

             {staffLoading ? (
               <div className="flex flex-1 items-center justify-center py-20">
                 <div className="flex flex-col items-center gap-4">
                   <div className="h-12 w-12 animate-spin rounded-full border-4 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
                   <p className="text-lg text-zinc-600 dark:text-zinc-400">Loading staff...</p>
                 </div>
               </div>
             ) : staffError ? (
               <div className="w-full max-w-md px-6">
                 <div className="rounded-2xl border-2 border-red-500 bg-red-50 p-8 text-center dark:bg-red-950">
                   <h2 className="mb-2 text-xl font-semibold text-red-900 dark:text-red-200">Something went wrong</h2>
                   <p className="text-base text-red-800 dark:text-red-300">{staffError}</p>
                 </div>
               </div>
             ) : (
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
                                 : member.role === "Nurse" || member.role === "Triage"
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
            )}

            {isStaffModalOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsStaffModalOpen(false)} />
                <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-slate-900/90 p-6 shadow-2xl backdrop-blur-xl">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-white">Add New Staff</h3>
                    <button
                      type="button"
                      onClick={() => setIsStaffModalOpen(false)}
                      className="shrink-0 rounded-lg border border-white/10 bg-white/5 p-1.5 text-slate-400 transition hover:text-white hover:border-white/20 focus:ring-2 focus:ring-white/20 focus:outline-none"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {staffFormError && (
                    <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
                      {staffFormError}
                    </div>
                  )}

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
                      <label htmlFor="staff-password" className="block text-xs font-semibold uppercase tracking-wider text-slate-400">Password</label>
                      <input
                        id="staff-password"
                        type="password"
                        value={newStaffPassword}
                        onChange={(e) => setNewStaffPassword(e.target.value)}
                        className="mt-2 w-full rounded-xl border border-white/10 bg-zinc-900/50 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        placeholder="Temporary password"
                      />
                    </div>
                    <div>
                      <label htmlFor="staff-role" className="block text-xs font-semibold uppercase tracking-wider text-slate-400">Role</label>
                      <select
                        id="staff-role"
                        value={newStaffRole}
                        onChange={(e) => setNewStaffRole(e.target.value as "Doctor" | "Nurse" | "Triage" | "Admin")}
                        className="mt-2 w-full rounded-xl border border-white/10 bg-zinc-900/50 px-4 py-2.5 text-sm text-zinc-100 focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      >
                        <option value="Doctor">Doctor</option>
                        <option value="Nurse">Nurse</option>
                        <option value="Triage">Triage</option>
                        <option value="Admin">Admin</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="staff-dept" className="block text-xs font-semibold uppercase tracking-wider text-slate-400">Department</label>
                      <select
                        id="staff-dept"
                        value={newStaffDepartmentId}
                        onChange={(e) => setNewStaffDepartmentId(e.target.value)}
                        className="mt-2 w-full rounded-xl border border-white/10 bg-zinc-900/50 px-4 py-2.5 text-sm text-zinc-100 focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      >
                        <option value="">Select department</option>
                        {departmentsList.map((dept) => (
                          <option key={dept.id} value={dept.id}>{dept.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => setIsStaffModalOpen(false)}
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
           <div className="flex flex-col gap-6">
             <div className="flex items-center justify-between">
               <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Departments</h2>
               <button
                 type="button"
                 onClick={handleOpenDepartmentModal}
                 className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-[0_0_20px_rgba(16,185,129,0.4)] transition-transform hover:scale-[1.01] hover:shadow-[0_0_25px_rgba(16,185,129,0.5)] focus:ring-2 focus:ring-emerald-400 focus:outline-none"
               >
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                   <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                 </svg>
                 Add Department
               </button>
             </div>

             {departmentsLoading ? (
               <div className="flex flex-1 items-center justify-center py-20">
                 <div className="flex flex-col items-center gap-4">
                   <div className="h-12 w-12 animate-spin rounded-full border-4 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
                   <p className="text-lg text-zinc-600 dark:text-zinc-400">Loading departments...</p>
                 </div>
               </div>
             ) : departmentsError ? (
               <div className="w-full max-w-md px-6">
                 <div className="rounded-2xl border-2 border-red-500 bg-red-50 p-8 text-center dark:bg-red-950">
                   <h2 className="mb-2 text-xl font-semibold text-red-900 dark:text-red-200">Something went wrong</h2>
                   <p className="text-base text-red-800 dark:text-red-300">{departmentsError}</p>
                 </div>
               </div>
             ) : (
               <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/5 shadow-2xl backdrop-blur-md">
                 <table className="w-full text-left text-sm">
                   <thead>
                     <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-gray-400">
                       <th className="px-6 py-4 font-semibold">Name</th>
                       <th className="px-6 py-4 font-semibold">Hospital</th>
                       <th className="px-6 py-4 font-semibold">Status</th>
                       <th className="px-6 py-4 font-semibold text-right">Actions</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-white/5">
                     {departments.map((dept) => (
                       <tr key={dept.id} className="transition hover:bg-white/5">
                         <td className="px-6 py-4">
                           <span className="font-semibold text-white">{dept.name}</span>
                         </td>
                         <td className="px-6 py-4 text-gray-300">{dept.hospitals?.[0]?.name || "—"}</td>
                         <td className="px-6 py-4">
                           <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                             <span className="h-2 w-2 rounded-full bg-emerald-400" />
                             {dept.is_active ? "Active" : "Inactive"}
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
             )}

             {isDepartmentModalOpen && (
               <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                 <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsDepartmentModalOpen(false)} />
                 <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-slate-900/90 p-6 shadow-2xl backdrop-blur-xl">
                   <div className="flex items-center justify-between">
                     <h3 className="text-lg font-bold text-white">Add New Department</h3>
                     <button
                       type="button"
                       onClick={() => setIsDepartmentModalOpen(false)}
                       className="shrink-0 rounded-lg border border-white/10 bg-white/5 p-1.5 text-slate-400 transition hover:text-white hover:border-white/20 focus:ring-2 focus:ring-white/20 focus:outline-none"
                     >
                       <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                         <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                       </svg>
                     </button>
                   </div>

                   {departmentFormError && (
                     <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
                       {departmentFormError}
                     </div>
                   )}

                   <div className="mt-5 flex flex-col gap-4">
                     <div>
                       <label htmlFor="dept-name" className="block text-xs font-semibold uppercase tracking-wider text-slate-400">Department Name</label>
                       <input
                         id="dept-name"
                         type="text"
                         value={newDepartmentName}
                         onChange={(e) => setNewDepartmentName(e.target.value)}
                         className="mt-2 w-full rounded-xl border border-white/10 bg-zinc-900/50 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                         placeholder="e.g. Cardiology"
                       />
                     </div>
                     <div>
                       <label htmlFor="dept-hospital" className="block text-xs font-semibold uppercase tracking-wider text-slate-400">Hospital</label>
                       <select
                         id="dept-hospital"
                         value={newDepartmentHospitalId}
                         onChange={(e) => setNewDepartmentHospitalId(e.target.value)}
                         className="mt-2 w-full rounded-xl border border-white/10 bg-zinc-900/50 px-4 py-2.5 text-sm text-zinc-100 focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                       >
                         <option value="">Select hospital</option>
                         {hospitals.map((h) => (
                           <option key={h.id} value={h.id}>{h.name}</option>
                         ))}
                       </select>
                     </div>
                     <div className="flex items-center justify-end gap-3">
                       <button
                         type="button"
                         onClick={() => setIsDepartmentModalOpen(false)}
                         className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-300 transition hover:border-white/20 hover:text-white focus:ring-2 focus:ring-white/20 focus:outline-none"
                       >
                         Cancel
                       </button>
                       <button
                         type="button"
                         onClick={handleSaveDepartment}
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
       case "questionnaires":
         return (
           <div className="flex flex-col gap-6">
             <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Clinical Questionnaires</h2>

             {questionnairesLoading ? (
               <div className="flex flex-1 items-center justify-center py-20">
                 <div className="flex flex-col items-center gap-4">
                   <div className="h-12 w-12 animate-spin rounded-full border-4 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
                   <p className="text-lg text-zinc-600 dark:text-zinc-400">Loading questionnaires...</p>
                 </div>
               </div>
             ) : questionnairesError ? (
               <div className="w-full max-w-md px-6">
                 <div className="rounded-2xl border-2 border-red-500 bg-red-50 p-8 text-center dark:bg-red-950">
                   <h2 className="mb-2 text-xl font-semibold text-red-900 dark:text-red-200">Something went wrong</h2>
                   <p className="text-base text-red-800 dark:text-red-300">{questionnairesError}</p>
                 </div>
               </div>
             ) : questionnaires.length === 0 ? (
               <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-12 text-center">
                 <p className="text-lg text-zinc-600 dark:text-zinc-400">No active questionnaires found.</p>
               </div>
             ) : (
               <div className="flex flex-col gap-4">
                 {questionnaires.map((q) => (
                   <div
                     key={q.id}
                     className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-2xl backdrop-blur-md transition hover:border-white/20"
                   >
                     <button
                       type="button"
                       onClick={() => setExpandedQuestionnaire(expandedQuestionnaire === q.id ? null : q.id)}
                       className="flex w-full items-center justify-between px-6 py-5 text-left"
                     >
                       <div className="flex flex-col gap-1">
                         <span className="text-lg font-bold text-zinc-900 dark:text-zinc-50">{q.name}</span>
                         <span className="text-sm text-zinc-600 dark:text-zinc-400">
                           v{q.version} · {q.category} · {q.questions.length} questions
                         </span>
                       </div>
                       <svg
                         xmlns="http://www.w3.org/2000/svg"
                         className={`h-5 w-5 text-slate-400 transition-transform ${expandedQuestionnaire === q.id ? "rotate-180" : ""}`}
                         fill="none"
                         viewBox="0 0 24 24"
                         stroke="currentColor"
                         strokeWidth={2}
                       >
                         <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                       </svg>
                     </button>
                     {expandedQuestionnaire === q.id && (
                       <div className="border-t border-white/10 bg-black/20 px-6 py-5">
                         {q.description && (
                           <p className="mb-4 text-sm text-zinc-400">{q.description}</p>
                         )}
                         <div className="flex flex-col gap-3">
                           {q.questions.map((question) => (
                             <div
                               key={question.id}
                               className="flex items-start justify-between gap-4 rounded-xl border border-white/5 bg-white/5 p-4"
                             >
                               <div className="flex flex-col gap-1">
                                 <span className="text-sm font-medium text-zinc-200">{question.text}</span>
                                 <span className="text-xs text-zinc-500">
                                   Type: {question.type} {question.category ? `· ${question.category}` : ""} · Order: {question.sort_order}
                                 </span>
                               </div>
                               <span
                                 className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                                   question.is_active
                                     ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                                     : "border-red-500/30 bg-red-500/10 text-red-300"
                                 }`}
                               >
                                 {question.is_active ? "Active" : "Inactive"}
                               </span>
                             </div>
                           ))}
                           {q.questions.length === 0 && (
                             <p className="text-sm text-zinc-500">No questions configured for this questionnaire.</p>
                           )}
                         </div>
                       </div>
                     )}
                   </div>
                 ))}
               </div>
             )}
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

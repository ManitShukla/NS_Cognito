import React, { useState, useEffect } from 'react';
import { apiClient, ApiError } from '../api/client';
import type {
  MasterSectionTimetable,
  MasterTimetableSlot,
  DayOfWeek,
  StudentAcademicInference,
} from '../types/api';
import {
  Sparkles,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';

const DEPARTMENTS = [
  { code: 'CSB', name: 'Computer Science & Bioscience' },
  { code: 'CSE', name: 'Computer Science & Engineering' },
  { code: 'CSDA', name: 'Computer Science (Data Analytics)' },
  { code: 'IT', name: 'Information Technology' },
  { code: 'ITNS', name: 'Information Technology (Network & Security)' },
  { code: 'ECE', name: 'Electronics & Communication Engineering' },
  { code: 'EE', name: 'Electrical Engineering' },
  { code: 'ICE', name: 'Instrumentation & Control Engineering' },
  { code: 'ME', name: 'Mechanical Engineering' },
  { code: 'BT', name: 'Biotechnology' },
  { code: 'MAC', name: 'Mathematics & Computing' },
];

const DAYS: DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const ExplorerPage: React.FC = () => {
  const [rollInput, setRollInput] = useState('');
  const [inferenceData, setInferenceData] = useState<StudentAcademicInference | null>(null);

  // Filter state
  const [program, setProgram] = useState('B.Tech');
  const [branch, setBranch] = useState('CSB');
  const [semester, setSemester] = useState(5);
  const [section, setSection] = useState('1');
  const [groupFilter, setGroupFilter] = useState<'All' | 'G1' | 'G2'>('All');

  // Timetable result state
  const [timetable, setTimetable] = useState<MasterSectionTimetable | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isInferring, setIsInferring] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch timetable query
  const loadTimetable = async (
    b = branch,
    sem = semester,
    sec = section,
    grp = groupFilter,
    prog = program
  ) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await apiClient.queryTimetable({
        program: prog,
        branch: b,
        semester: sem,
        section: sec,
        group: grp,
      });
      setTimetable(data);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(`[${err.code}] ${err.message}`);
      } else {
        setErrorMessage('Failed to query timetable matrix from telemetry cache.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    loadTimetable();
  }, []);

  // Debounced auto-infer as user types valid roll number format (>= 10 chars)
  useEffect(() => {
    const trimmed = rollInput.trim().toUpperCase();
    if (trimmed.length < 10) return;

    const timeout = setTimeout(async () => {
      try {
        const inferred = await apiClient.inferAcademicStanding(trimmed);
        setInferenceData(inferred);
        setBranch(inferred.branchCode);
        setSemester(inferred.currentSemester);
        setSection(inferred.defaultSection || '1');
        setProgram(inferred.program || 'B.Tech');
        loadTimetable(
          inferred.branchCode,
          inferred.currentSemester,
          inferred.defaultSection || '1',
          groupFilter,
          inferred.program || 'B.Tech'
        );
      } catch {
        // Silently skip partial matching during live input
      }
    }, 350);

    return () => clearTimeout(timeout);
  }, [rollInput, groupFilter]);

  // Handle Roll Auto-Infer
  const handleAutoInfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rollInput.trim()) return;

    setIsInferring(true);
    setErrorMessage(null);
    try {
      const inferred = await apiClient.inferAcademicStanding(rollInput.trim().toUpperCase());
      setInferenceData(inferred);
      setBranch(inferred.branchCode);
      setSemester(inferred.currentSemester);
      setSection(inferred.defaultSection || '1');
      setProgram(inferred.program || 'B.Tech');

      // Trigger automatic reload
      await loadTimetable(
        inferred.branchCode,
        inferred.currentSemester,
        inferred.defaultSection || '1',
        groupFilter,
        inferred.program || 'B.Tech'
      );
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(`[${err.code}] ${err.message}`);
      } else {
        setErrorMessage('Unable to infer academic standing from supplied roll number.');
      }
    } finally {
      setIsInferring(false);
    }
  };

  // Force Re-sync Cache
  const handleForceSync = async () => {
    setIsSyncing(true);
    setErrorMessage(null);
    try {
      const resynced = await apiClient.syncTimetable({
        program,
        branch,
        semester,
        section,
      });
      setTimetable(resynced);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(`[${err.code}] ${err.message}`);
      } else {
        setErrorMessage('Failed to force re-sync timetable with upstream Plumware portal.');
      }
    } finally {
      setIsSyncing(false);
    }
  };

  // Filter slots for a given day according to groupFilter
  const getFilteredDaySlots = (day: DayOfWeek): MasterTimetableSlot[] => {
    if (!timetable?.grid[day]) return [];
    const rawList = timetable.grid[day].filter((s): s is MasterTimetableSlot => s !== null);

    if (groupFilter === 'All') return rawList;

    return rawList
      .map((slot) => {
        const filteredCandidates = slot.candidateSessions.filter((c) => {
          const grp = c.group.toUpperCase();
          return grp === 'ALL' || grp.includes(groupFilter.toUpperCase());
        });
        if (filteredCandidates.length === 0) return null;
        return {
          ...slot,
          candidateSessions: filteredCandidates,
        };
      })
      .filter((s): s is MasterTimetableSlot => s !== null);
  };

  return (
    <div className="bg-co-surface min-h-screen py-8 text-co-ink">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* ============================================================== */}
        {/* HEADER & SMART ROLL INFERENCE STRIP                            */}
        {/* ============================================================== */}
        <section className="bg-white border border-co-rule border-b-2 border-b-co-red p-6 sm:p-8 relative">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-co-rule pb-4 mb-6">
            <div className="flex items-center space-x-3">
              <span className="font-mono text-xs text-co-red font-bold uppercase tracking-wider">
                SEC // 04.UNIVERSAL_TIMETABLE_EXPLORER
              </span>
              <span className="text-co-rule">|</span>
              <span className="font-mono text-xs text-co-muted uppercase tracking-wider">
                CAMPUS_WIDE_MASTER_DIRECTORY
              </span>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={handleForceSync}
                disabled={isSyncing || isLoading}
                className="px-3 py-1.5 bg-co-ink text-white font-mono text-xs font-bold uppercase border border-co-ink hover:-translate-y-0.5 transition-transform flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>FORCE_CACHE_SYNC</span>
              </button>
            </div>
          </div>

          {/* Roll Number Inference Bar */}
          <form onSubmit={handleAutoInfer} className="mb-6">
            <label className="block font-mono text-xs text-co-muted uppercase tracking-wider mb-2">
              QUICK_AUTO_INFER // ENTER ROLL NUMBER FOR INSTANT RESOLUTION :
            </label>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={rollInput}
                onChange={(e) => setRollInput(e.target.value)}
                placeholder="E.G. 2024UCB1234"
                className="flex-1 px-4 py-2.5 bg-co-surface border border-co-rule font-mono text-sm uppercase tracking-wider input-swiss placeholder:text-co-disabled text-co-ink"
              />
              <button
                type="submit"
                disabled={isInferring}
                className="px-6 py-2.5 bg-co-blue text-white font-mono text-xs font-bold uppercase border border-co-blue hover:-translate-y-0.5 transition-transform flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                <span>{isInferring ? 'INFERRING...' : 'AUTO_INFER_SCHEDULE'}</span>
              </button>
            </div>
          </form>

          {/* Inferred Status Chip */}
          {inferenceData && (
            <div className="p-3 bg-blue-50 border border-blue-200 font-mono text-xs flex flex-wrap items-center gap-3 text-co-blue">
              <span className="font-bold">INFERRED :</span>
              <span>{inferenceData.branchName} ({inferenceData.branchCode})</span>
              <span>• SEMESTER {inferenceData.currentSemester}</span>
              <span>• SECTION {inferenceData.defaultSection}</span>
              <span>• AY {inferenceData.academicYear}</span>
            </div>
          )}

          {/* Manual Overrides Form */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4 pt-4 border-t border-co-rule">
            {/* Program */}
            <div>
              <label className="block font-mono text-[11px] text-co-muted uppercase mb-1">PROGRAM</label>
              <select
                value={program}
                onChange={(e) => {
                  setProgram(e.target.value);
                  loadTimetable(branch, semester, section, groupFilter, e.target.value);
                }}
                className="w-full p-2 bg-co-surface border border-co-rule font-mono text-xs text-co-ink"
              >
                <option value="B.Tech">B.Tech</option>
                <option value="M.Tech">M.Tech</option>
                <option value="BBA">BBA</option>
                <option value="MBA">MBA</option>
              </select>
            </div>

            {/* Department */}
            <div>
              <label className="block font-mono text-[11px] text-co-muted uppercase mb-1">DEPARTMENT</label>
              <select
                value={branch}
                onChange={(e) => {
                  setBranch(e.target.value);
                  loadTimetable(e.target.value, semester, section, groupFilter, program);
                }}
                className="w-full p-2 bg-co-surface border border-co-rule font-mono text-xs text-co-ink"
              >
                {DEPARTMENTS.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.code} - {d.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Semester */}
            <div>
              <label className="block font-mono text-[11px] text-co-muted uppercase mb-1">SEMESTER</label>
              <select
                value={semester}
                onChange={(e) => {
                  const s = Number(e.target.value);
                  setSemester(s);
                  loadTimetable(branch, s, section, groupFilter, program);
                }}
                className="w-full p-2 bg-co-surface border border-co-rule font-mono text-xs text-co-ink"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                  <option key={s} value={s}>
                    Semester {s}
                  </option>
                ))}
              </select>
            </div>

            {/* Section */}
            <div>
              <label className="block font-mono text-[11px] text-co-muted uppercase mb-1">SECTION</label>
              <select
                value={section}
                onChange={(e) => {
                  setSection(e.target.value);
                  loadTimetable(branch, semester, e.target.value, groupFilter, program);
                }}
                className="w-full p-2 bg-co-surface border border-co-rule font-mono text-xs text-co-ink"
              >
                {['1', '2', '3', '4'].map((sec) => (
                  <option key={sec} value={sec}>
                    Section {sec}
                  </option>
                ))}
              </select>
            </div>

            {/* Sub-Group Filter */}
            <div>
              <label className="block font-mono text-[11px] text-co-muted uppercase mb-1">SUB-GROUP</label>
              <div className="flex border border-co-rule bg-co-surface">
                {(['All', 'G1', 'G2'] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => {
                      setGroupFilter(g);
                      loadTimetable(branch, semester, section, g, program);
                    }}
                    className={`flex-1 py-1.5 font-mono text-xs font-bold transition-colors cursor-pointer ${
                      groupFilter === g ? 'bg-co-ink text-white' : 'text-co-ink hover:bg-white'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Error notification */}
        {errorMessage && (
          <div className="p-4 bg-red-50 border-l-2 border-co-red text-red-900 font-mono text-xs flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-co-red shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* ============================================================== */}
        {/* MASTER TIMETABLE 2D MATRIX VIEW                                */}
        {/* ============================================================== */}
        <section className="bg-white border border-co-rule p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-co-rule pb-3">
            <span className="font-mono text-xs text-co-muted font-bold uppercase tracking-wider">
              SECTION TIMETABLE MATRIX // {program} - {branch} - SEM_{semester} - SEC_{section}
            </span>
            <div className="flex items-center space-x-3 font-mono text-xs text-co-muted">
              <span>GROUP FILTER: {groupFilter}</span>
              {timetable?.isCached && <span className="text-co-blue font-bold">[CACHED_NODE]</span>}
            </div>
          </div>

          {isLoading ? (
            <div className="p-16 flex flex-col items-center justify-center space-y-3 font-mono text-xs text-co-muted">
              <RefreshCw className="w-6 h-6 animate-spin text-co-red" />
              <span>RETRIEVING MASTER TIMETABLE DE-MERGED MATRIX...</span>
            </div>
          ) : timetable ? (
            <div className="space-y-6">
              {DAYS.map((day) => {
                const slots = getFilteredDaySlots(day);
                return (
                  <div key={day} className="border border-co-rule">
                    {/* Day Row Header */}
                    <div className="bg-co-surface px-4 py-2 border-b border-co-rule font-mono text-xs font-bold text-co-ink flex items-center justify-between">
                      <span className="tracking-wider">{day.toUpperCase()}</span>
                      <span className="text-co-muted text-[11px] font-normal">
                        {slots.length} SESSIONS SCHEDULED
                      </span>
                    </div>

                    {/* Day Sessions Grid */}
                    {slots.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 p-4 bg-white">
                        {slots.map((slot, sIdx) => {
                          return (
                            <div
                              key={sIdx}
                              className="p-3 bg-co-surface border border-co-rule font-mono text-xs space-y-2"
                            >
                              <div className="flex items-center justify-between border-b border-co-rule pb-1.5">
                                <span className="font-bold text-co-ink">
                                  {slot.startTime} - {slot.endTime}
                                </span>
                                {slot.spanHours > 1 && (
                                  <span className="bg-co-night text-white text-[10px] px-1.5 py-0.2 font-bold">
                                    {slot.spanHours}-HR
                                  </span>
                                )}
                              </div>

                              {slot.candidateSessions.map((c, cIdx) => (
                                <div key={cIdx} className="space-y-1">
                                  <div className="flex justify-between items-baseline">
                                    <span className="font-bold text-co-red">{c.courseCode}</span>
                                    <span className="text-[10px] bg-white px-1.5 py-0.2 border border-co-rule text-co-muted">
                                      {c.component} ({c.group})
                                    </span>
                                  </div>
                                  <div className="font-sans font-bold text-co-ink truncate text-xs">
                                    {c.courseName || c.courseCode}
                                  </div>
                                  <div className="text-[10px] text-co-muted flex justify-between">
                                    <span>ROOM: {c.room || 'TBA'}</span>
                                    <span>{c.faculty || 'FACULTY'}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="p-4 text-center font-mono text-xs text-co-disabled">
                        NO SESSIONS SCHEDULED
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-12 text-center font-mono text-xs text-co-muted">
              Select department and semester to explore academic timetable.
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

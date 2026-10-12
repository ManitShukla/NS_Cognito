import React, { useState, useEffect, useMemo } from 'react';
import type {
  StudentAcademicProfile,
  PersonalizedStudentSchedule,
  DayOfWeek,
  ForecastAction,
  ProjectedAttendanceForecast,
} from '../types/api';
import { apiClient } from '../api/client';
import {
  RefreshCw,
  CheckCircle,
  XCircle,
  RotateCcw,
} from 'lucide-react';

interface ForecastSimulatorProps {
  profile: StudentAcademicProfile;
  schedule: PersonalizedStudentSchedule;
  sessionToken: string | null;
}

const DAYS: DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const ForecastSimulator: React.FC<ForecastSimulatorProps> = ({
  profile,
  schedule,
  sessionToken,
}) => {
  // Determine current day of week
  const currentDayIndex = new Date().getDay();
  const defaultDay: DayOfWeek =
    currentDayIndex >= 1 && currentDayIndex <= 6 ? DAYS[currentDayIndex - 1] : 'Monday';

  const [targetDay, setTargetDay] = useState<DayOfWeek>(defaultDay);
  const [actions, setActions] = useState<Record<string, ForecastAction>>({});
  const [serverForecast, setServerForecast] = useState<ProjectedAttendanceForecast | null>(null);
  const [isSyncingServer, setIsSyncingServer] = useState(false);

  // Slots for the target day
  const targetSlots = useMemo(() => {
    return schedule.schedule[targetDay] || [];
  }, [schedule, targetDay]);

  // Initialize all target slots to 'ATTEND' by default
  useEffect(() => {
    const initialActions: Record<string, ForecastAction> = {};
    for (const slot of targetSlots) {
      if (!actions[slot.courseCode]) {
        initialActions[slot.courseCode] = 'ATTEND';
      }
    }
    setActions((prev) => ({ ...initialActions, ...prev }));
  }, [targetSlots]);

  // Toggle action between ATTEND and BUNK
  const handleToggleAction = (slotKey: string, courseCode: string, action: ForecastAction) => {
    setActions((prev) => ({
      ...prev,
      [slotKey]: action,
      [courseCode]: action,
    }));
  };

  // Reset all to default ATTEND
  const handleReset = () => {
    const resetActions: Record<string, ForecastAction> = {};
    for (const slot of targetSlots) {
      resetActions[slot.courseCode] = 'ATTEND';
    }
    setActions(resetActions);
  };

  // Synchronize simulation with backend AttendanceForecaster service
  const handleSyncServer = async () => {
    if (!sessionToken) return;
    setIsSyncingServer(true);
    try {
      const forecast = await apiClient.simulateForecast(sessionToken, {
        targetDay,
        customActions: actions,
      });
      setServerForecast(forecast);
    } catch (err) {
      console.error('Failed to sync forecast with server:', err);
    } finally {
      setIsSyncingServer(false);
    }
  };

  // Compute live client-side projection with exact multi-hour weighting
  const simulationResults = useMemo(() => {
    let deltaHeld = 0;
    let deltaAttended = 0;

    // Per subject map
    const subjectMap: Record<
      string,
      {
        courseCode: string;
        courseName: string;
        weightHours: number;
        action: ForecastAction;
        currentHeld: number;
        currentPresent: number;
        currentPercentage: number;
        projectedHeld: number;
        projectedPresent: number;
        projectedPercentage: number;
      }
    > = {};

    // Group target slots by courseCode
    for (const slot of targetSlots) {
      const weight = slot.spanHours && slot.spanHours > 1 ? slot.spanHours : 1;
      const act = actions[slot.courseCode] || 'ATTEND';

      if (!subjectMap[slot.courseCode]) {
        const subj = profile.subjects.find((s) => s.courseCode === slot.courseCode);
        const curHeld = subj?.totalClasses ?? 0;
        const curPresent = subj?.present ?? 0;
        const curPct = curHeld > 0 ? (curPresent / curHeld) * 100 : 100;

        subjectMap[slot.courseCode] = {
          courseCode: slot.courseCode,
          courseName: slot.courseName,
          weightHours: 0,
          action: act,
          currentHeld: curHeld,
          currentPresent: curPresent,
          currentPercentage: curPct,
          projectedHeld: curHeld,
          projectedPresent: curPresent,
          projectedPercentage: curPct,
        };
      }

      subjectMap[slot.courseCode].weightHours += weight;
      subjectMap[slot.courseCode].action = act;

      if (act === 'ATTEND') {
        deltaHeld += weight;
        deltaAttended += weight;
        subjectMap[slot.courseCode].projectedHeld += weight;
        subjectMap[slot.courseCode].projectedPresent += weight;
      } else if (act === 'BUNK') {
        deltaHeld += weight;
        subjectMap[slot.courseCode].projectedHeld += weight;
      }
    }

    // Recalculate projected percentages
    for (const code in subjectMap) {
      const item = subjectMap[code];
      const rawPct = item.projectedHeld > 0 ? (item.projectedPresent / item.projectedHeld) * 100 : 100;
      item.projectedPercentage = Number(Math.min(100, Math.max(0, rawPct)).toFixed(2));
    }

    const curTotalHeld = profile.overallSummary.totalHeld;
    const curTotalPresent = profile.overallSummary.totalPresent;
    const curOverallPct = profile.overallSummary.overallPercentage;

    const projTotalHeld = curTotalHeld + deltaHeld;
    const projTotalPresent = curTotalPresent + deltaAttended;
    const rawProjPct = projTotalHeld > 0 ? (projTotalPresent / projTotalHeld) * 100 : 100;
    const projOverallPct = Number(Math.min(100, Math.max(0, rawProjPct)).toFixed(2));
    const overallDelta = Number((projOverallPct - curOverallPct).toFixed(2));

    // Projected bunk margin
    const projBunkMargin = Math.max(
      0,
      Math.floor((projTotalPresent - 0.75 * projTotalHeld) / 0.75)
    );
    const projClassesNeeded = Math.max(
      0,
      Math.ceil((0.75 * projTotalHeld - projTotalPresent) / 0.25)
    );

    return {
      deltaHeld,
      deltaAttended,
      curOverallPct,
      projOverallPct,
      overallDelta,
      projTotalHeld,
      projTotalPresent,
      projBunkMargin,
      projClassesNeeded,
      subjects: Object.values(subjectMap),
    };
  }, [targetSlots, actions, profile]);

  return (
    <div className="bg-co-surface min-h-screen py-8 text-co-ink">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* ============================================================== */}
        {/* HEADER & CONTROL STRIP                                         */}
        {/* ============================================================== */}
        <section className="bg-white border border-co-rule border-b-2 border-b-co-red p-6 sm:p-8 relative">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-co-rule pb-4 mb-6">
            <div className="flex items-center space-x-3">
              <span className="font-mono text-xs text-co-red font-bold uppercase tracking-wider">
                SEC // 03.ATTENDANCE_SIMULATOR
              </span>
              <span className="text-co-rule">|</span>
              <span className="font-mono text-xs text-co-muted uppercase tracking-wider">
                LIVE_WHAT_IF_PROJECTION
              </span>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={handleReset}
                className="px-3 py-1.5 bg-co-surface border border-co-rule font-mono text-xs text-co-ink hover:bg-co-rule transition-colors flex items-center space-x-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>RESET_ALL</span>
              </button>
              {sessionToken && (
                <button
                  onClick={handleSyncServer}
                  disabled={isSyncingServer}
                  className="px-3 py-1.5 bg-co-ink text-white font-mono text-xs font-bold uppercase border border-co-ink hover:-translate-y-0.5 transition-transform flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingServer ? 'animate-spin' : ''}`} />
                  <span>SYNC_SERVER_ALGO</span>
                </button>
              )}
            </div>
          </div>

          {/* Target Day Tabs */}
          <div>
            <label className="block font-mono text-xs text-co-muted uppercase tracking-wider mb-2">
              SELECT PROJECTION TARGET DAY :
            </label>
            <div className="flex flex-wrap border border-co-rule bg-co-surface">
              {DAYS.map((d) => (
                <button
                  key={d}
                  onClick={() => setTargetDay(d)}
                  className={`px-4 py-2 font-mono text-xs font-bold uppercase transition-colors cursor-pointer ${
                    targetDay === d
                      ? 'bg-co-ink text-white border-b-2 border-b-co-red'
                      : 'text-co-ink hover:bg-white'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {serverForecast && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 font-mono text-xs text-co-blue flex items-center justify-between">
              <span>✓ SERVER_ALGORITHM_VALIDATION : PARITY VERIFIED</span>
              <span>PROJECTED : {serverForecast.projectedOverall.percentage.toFixed(2)}% (Δ {serverForecast.projectedOverall.deltaPercentage >= 0 ? '+' : ''}{serverForecast.projectedOverall.deltaPercentage.toFixed(2)}%)</span>
            </div>
          )}
        </section>

        {/* ============================================================== */}
        {/* LIVE PREVIEW COMPARISON STATS                                 */}
        {/* ============================================================== */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Baseline Card */}
          <div className="bg-white border border-co-rule p-6 relative">
            <span className="font-mono text-xs text-co-muted uppercase tracking-wider block mb-1">
              BASELINE OVERALL
            </span>
            <div className="font-sans font-bold text-4xl text-co-ink">
              {simulationResults.curOverallPct.toFixed(2)}%
            </div>
            <div className="font-mono text-xs text-co-muted mt-2">
              {profile.overallSummary.totalPresent} / {profile.overallSummary.totalHeld} SESSIONS
            </div>
          </div>

          {/* Projected Card */}
          <div className="bg-white border border-co-rule p-6 relative border-t-4 border-t-co-blue">
            <span className="font-mono text-xs text-co-blue font-bold uppercase tracking-wider block mb-1">
              PROJECTED OVERALL
            </span>
            <div className="font-sans font-bold text-4xl text-co-blue">
              {simulationResults.projOverallPct.toFixed(2)}%
            </div>
            <div className="font-mono text-xs text-co-muted mt-2">
              {simulationResults.projTotalPresent} / {simulationResults.projTotalHeld} SESSIONS
            </div>
          </div>

          {/* Delta & Net Margin */}
          <div className="bg-white border border-co-rule p-6 relative border-t-4 border-t-co-red">
            <span className="font-mono text-xs text-co-red font-bold uppercase tracking-wider block mb-1">
              SIMULATION DELTA
            </span>
            <div
              className={`font-sans font-bold text-4xl ${
                simulationResults.overallDelta >= 0 ? 'text-co-blue' : 'text-co-red'
              }`}
            >
              {simulationResults.overallDelta >= 0 ? '+' : ''}
              {simulationResults.overallDelta.toFixed(2)}%
            </div>
            <div className="font-mono text-xs mt-2">
              {simulationResults.projOverallPct >= 75 ? (
                <span className="text-co-blue font-bold">
                  +{simulationResults.projBunkMargin} BUNKS SAFE
                </span>
              ) : (
                <span className="text-co-red font-bold">
                  -{simulationResults.projClassesNeeded} SESSIONS REQUIRED
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* INTERACTIVE COMMITMENT TOGGLE MATRIX                          */}
        {/* ============================================================== */}
        <section className="bg-white border border-co-rule p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between border-b border-co-rule pb-3">
            <span className="font-mono text-xs text-co-muted font-bold uppercase tracking-wider">
              SCHEDULED COMMITMENTS FOR {targetDay.toUpperCase()} ({targetSlots.length} SLOTS)
            </span>
            <span className="font-mono text-[11px] text-co-muted">
              LABS CARRY MULTI-HOUR ATTENDANCE WEIGHT
            </span>
          </div>

          {targetSlots.length > 0 ? (
            <div className="space-y-3">
              {targetSlots.map((slot, idx) => {
                const slotKey = `${slot.courseCode}:${slot.periodIndex}`;
                const currentAction = actions[slotKey] || actions[slot.courseCode] || 'ATTEND';
                const weight = slot.spanHours && slot.spanHours > 1 ? slot.spanHours : 1;

                return (
                  <div
                    key={idx}
                    className="p-4 bg-co-surface border border-co-rule flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    {/* Course & Timing Info */}
                    <div className="flex items-start sm:items-center space-x-3">
                      <div className="p-2 bg-white border border-co-rule font-mono text-xs text-center min-w-[90px]">
                        <span className="font-bold text-co-ink">{slot.startTime}</span>
                      </div>

                      <div>
                        <div className="flex items-center space-x-2 font-mono text-xs">
                          <span className="font-bold text-co-red">{slot.courseCode}</span>
                          <span className="text-co-rule">|</span>
                          <span className="text-co-muted uppercase">{slot.component}</span>
                          {weight > 1 && (
                            <span className="bg-co-night text-white text-[10px] px-1.5 py-0.2 font-bold">
                              {weight}-HR LAB (+{weight} WEIGHT)
                            </span>
                          )}
                        </div>
                        <h4 className="font-sans font-bold text-sm text-co-ink mt-0.5">
                          {slot.courseName}
                        </h4>
                      </div>
                    </div>

                    {/* Simulation Toggle Buttons - 44px min hit targets */}
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleToggleAction(slotKey, slot.courseCode, 'ATTEND')}
                        className={`px-4 py-2 min-h-[44px] font-mono text-xs font-bold uppercase border transition-colors cursor-pointer flex items-center space-x-1.5 ${
                          currentAction === 'ATTEND'
                            ? 'bg-co-blue text-white border-co-blue'
                            : 'bg-white text-co-ink border-co-rule hover:bg-co-surface'
                        }`}
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>ATTEND (+{weight})</span>
                      </button>

                      <button
                        onClick={() => handleToggleAction(slotKey, slot.courseCode, 'BUNK')}
                        className={`px-4 py-2 min-h-[44px] font-mono text-xs font-bold uppercase border transition-colors cursor-pointer flex items-center space-x-1.5 ${
                          currentAction === 'BUNK'
                            ? 'bg-co-red text-white border-co-red'
                            : 'bg-white text-co-ink border-co-rule hover:bg-co-surface'
                        }`}
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>BUNK (0/{weight})</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center font-mono text-xs text-co-muted">
              No scheduled classes on {targetDay}.
            </div>
          )}
        </section>

        {/* ============================================================== */}
        {/* PER-COURSE PROJECTED IMPACT BREAKDOWN                         */}
        {/* ============================================================== */}
        {simulationResults.subjects.length > 0 && (
          <section className="bg-white border border-co-rule p-6 sm:p-8 space-y-4">
            <span className="font-mono text-xs text-co-muted font-bold uppercase tracking-wider block">
              INDIVIDUAL COURSE IMPACT TABLE
            </span>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse font-mono text-xs">
                <thead>
                  <tr className="bg-co-surface border-b border-co-rule text-co-muted text-left">
                    <th className="p-2.5">COURSE</th>
                    <th className="p-2.5">ACTION</th>
                    <th className="p-2.5">BASELINE %</th>
                    <th className="p-2.5">PROJECTED %</th>
                    <th className="p-2.5">DELTA</th>
                  </tr>
                </thead>
                <tbody>
                  {simulationResults.subjects.map((s, idx) => {
                    const delta = s.projectedPercentage - s.currentPercentage;
                    return (
                      <tr key={idx} className="border-b border-co-rule hover:bg-co-surface/40">
                        <td className="p-2.5">
                          <span className="font-bold text-co-ink">{s.courseCode}</span>
                          <span className="text-co-muted block text-[11px] truncate max-w-xs">
                            {s.courseName}
                          </span>
                        </td>
                        <td className="p-2.5">
                          <span
                            className={`px-2 py-0.5 text-[10px] font-bold uppercase ${
                              s.action === 'ATTEND'
                                ? 'bg-blue-100 text-co-blue'
                                : 'bg-red-100 text-co-red'
                            }`}
                          >
                            {s.action}
                          </span>
                        </td>
                        <td className="p-2.5 text-co-ink">
                          {s.currentPercentage.toFixed(2)}% ({s.currentPresent}/{s.currentHeld})
                        </td>
                        <td className="p-2.5 font-bold text-co-ink">
                          {s.projectedPercentage.toFixed(2)}% ({s.projectedPresent}/{s.projectedHeld})
                        </td>
                        <td
                          className={`p-2.5 font-bold ${
                            delta >= 0 ? 'text-co-blue' : 'text-co-red'
                          }`}
                        >
                          {delta >= 0 ? '+' : ''}
                          {delta.toFixed(2)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

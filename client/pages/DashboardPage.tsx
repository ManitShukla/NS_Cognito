import React, { useState } from 'react';
import type { StudentAcademicProfile, AttendanceMatrixRecord } from '../types/api';
import {
  ShieldCheck,
  Calendar,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  Clock,
} from 'lucide-react';

interface DashboardPageProps {
  profile: StudentAcademicProfile;
  onNavigateToSchedule: () => void;
  onNavigateToSimulator: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  profile,
  onNavigateToSchedule,
  onNavigateToSimulator,
}) => {
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);

  const {
    rollNo,
    studentName = 'STUDENT_USER',
    program = 'B.Tech',
    branch = 'CSB',
    semester = 5,
    academicYear = '2026-27',
    overallSummary,
    subjects,
    groupProfile,
    attendanceRecords,
    lastUpdated,
  } = profile;

  const toggleSubjectDrawer = (courseCode: string) => {
    setSelectedSubject((prev) => (prev === courseCode ? null : courseCode));
  };

  // Filter matrix records for the expanded subject
  const getSubjectRecords = (courseCode: string): AttendanceMatrixRecord[] => {
    return (attendanceRecords || []).filter((r) => r.courseTokens && r.courseTokens[courseCode]);
  };

  return (
    <div className="bg-co-surface min-h-screen py-8 text-co-ink">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* ============================================================== */}
        {/* 1. STUDENT IDENTITY STRIP WITH 2PX RED LOWER RULE              */}
        {/* ============================================================== */}
        <section className="bg-white border border-co-rule border-b-2 border-b-co-red p-6 sm:p-8 relative">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-co-rule pb-4 mb-6">
            <div className="flex items-center space-x-3">
              <span className="font-mono text-xs text-co-red font-bold uppercase tracking-wider">
                ID // STUDENT_TELEMETRY
              </span>
              <span className="text-co-rule">|</span>
              <span className="font-mono text-xs text-co-muted uppercase tracking-wider">
                SESSION :: ACTIVE
              </span>
            </div>

            <div className="flex items-center space-x-4 font-mono text-xs text-co-muted">
              <div className="flex items-center space-x-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>SYNCED: {new Date(lastUpdated).toLocaleTimeString()}</span>
              </div>
              <div className="flex items-center space-x-1.5 text-co-blue font-bold">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>INTEGRITY_VERIFIED</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-end">
            <div className="md:col-span-7">
              <h1 className="font-sans font-bold text-3xl sm:text-4xl text-co-ink tracking-tight uppercase">
                {studentName}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-3 font-mono text-xs text-co-muted-strong">
                <span className="bg-co-surface px-2.5 py-1 border border-co-rule text-co-ink font-bold">
                  ROLL : {rollNo}
                </span>
                <span className="bg-co-surface px-2.5 py-1 border border-co-rule">
                  {program} / {branch}
                </span>
                <span className="bg-co-surface px-2.5 py-1 border border-co-rule">
                  SEM : {semester}
                </span>
                <span className="bg-co-surface px-2.5 py-1 border border-co-rule">
                  AY : {academicYear}
                </span>
                <span className="bg-co-night text-white px-2.5 py-1 border border-co-night font-bold">
                  GROUP : {groupProfile?.defaultGroup || 'G1'}
                </span>
              </div>
            </div>

            <div className="md:col-span-5 flex flex-wrap md:justify-end gap-3">
              <button
                onClick={onNavigateToSchedule}
                className="px-4 py-2.5 bg-co-ink text-white font-mono text-xs tracking-wider uppercase border border-co-ink hover:-translate-y-0.5 transition-transform flex items-center space-x-2 cursor-pointer"
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>VIEW_SCHEDULE</span>
              </button>
              <button
                onClick={onNavigateToSimulator}
                className="px-4 py-2.5 bg-co-red text-white font-mono text-xs font-bold tracking-wider uppercase border border-co-red hover:-translate-y-0.5 transition-transform flex items-center space-x-2 cursor-pointer"
              >
                <TrendingUp className="w-3.5 h-3.5" />
                <span>SIMULATE_BUNKS</span>
              </button>
            </div>
          </div>
        </section>

        {/* ============================================================== */}
        {/* 2. AGGREGATE TELEMETRY HERO BANNER                             */}
        {/* ============================================================== */}
        <section className="bg-white border border-co-rule p-6 sm:p-8 relative">
          <div className="flex items-center justify-between border-b border-co-rule pb-3 mb-6">
            <span className="font-mono text-xs text-co-muted font-bold uppercase tracking-wider">
              01 // AGGREGATE_ATTENDANCE_OVERVIEW
            </span>
            <div className="flex items-center space-x-2 font-mono text-xs font-bold">
              <span
                className={`inline-block w-2.5 h-2.5 ${
                  overallSummary.status === 'SAFE'
                    ? 'bg-co-blue'
                    : overallSummary.status === 'WARNING'
                    ? 'bg-amber-500'
                    : 'bg-co-red'
                }`}
              ></span>
              <span
                className={
                  overallSummary.status === 'SAFE'
                    ? 'text-co-blue'
                    : overallSummary.status === 'WARNING'
                    ? 'text-amber-600'
                    : 'text-co-red'
                }
              >
                STANDING :: {overallSummary.status}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Massive Percentage Block */}
            <div className="md:col-span-2 border-r-0 md:border-r border-co-rule pr-0 md:pr-6">
              <span className="font-mono text-xs text-co-muted uppercase tracking-wider block mb-1">
                OVERALL PERCENTAGE
              </span>
              <div className="flex items-baseline space-x-3">
                <span className="font-sans font-bold text-5xl sm:text-6xl text-co-ink tracking-tighter">
                  {overallSummary.overallPercentage.toFixed(2)}%
                </span>
                <span className="font-mono text-xs text-co-muted uppercase">
                  (BENCHMARK: 75.00%)
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-co-surface h-2 border border-co-rule mt-4 overflow-hidden">
                <div
                  className={`h-full ${
                    overallSummary.overallPercentage >= 75
                      ? 'bg-co-blue'
                      : overallSummary.overallPercentage >= 70
                      ? 'bg-amber-500'
                      : 'bg-co-red'
                  }`}
                  style={{ width: `${Math.min(100, overallSummary.overallPercentage)}%` }}
                ></div>
              </div>
            </div>

            {/* Attendance Counters */}
            <div className="flex flex-col justify-center space-y-2 border-r-0 md:border-r border-co-rule pr-0 md:pr-6">
              <span className="font-mono text-xs text-co-muted uppercase tracking-wider">
                SESSION TOTALS
              </span>
              <div className="flex items-baseline justify-between font-mono text-sm">
                <span className="text-co-muted">ATTENDED :</span>
                <span className="font-bold text-co-ink text-base">{overallSummary.totalPresent}</span>
              </div>
              <div className="flex items-baseline justify-between font-mono text-sm">
                <span className="text-co-muted">HELD :</span>
                <span className="font-bold text-co-ink text-base">{overallSummary.totalHeld}</span>
              </div>
              <div className="flex items-baseline justify-between font-mono text-sm">
                <span className="text-co-muted">ABSENT :</span>
                <span className="font-bold text-co-red text-base">{overallSummary.totalAbsent}</span>
              </div>
            </div>

            {/* Bunk Margin or Deficit Buffer */}
            <div className="flex flex-col justify-center">
              <span className="font-mono text-xs text-co-muted uppercase tracking-wider mb-1">
                ACADEMIC LATITUDE
              </span>
              {overallSummary.overallPercentage >= 75 ? (
                <div className="p-3 bg-blue-50 border border-blue-200">
                  <div className="font-mono text-xs text-co-blue font-bold uppercase tracking-wider flex items-center space-x-1.5">
                    <span>■</span>
                    <span>SAFE BUNK BUFFER</span>
                  </div>
                  <div className="font-sans font-bold text-2xl text-co-blue mt-1">
                    +{overallSummary.overallBunkMargin}{' '}
                    <span className="font-mono text-xs font-normal text-co-muted">CLASSES SAFE</span>
                  </div>
                  <p className="font-mono text-[11px] text-co-muted mt-1 leading-tight">
                    Can miss up to {overallSummary.overallBunkMargin} sessions before dipping under 75%.
                  </p>
                </div>
              ) : (
                <div className="p-3 bg-red-50 border border-red-200">
                  <div className="font-mono text-xs text-co-red font-bold uppercase tracking-wider flex items-center space-x-1.5">
                    <span>■</span>
                    <span>ATTENDANCE DEFICIT</span>
                  </div>
                  <div className="font-sans font-bold text-2xl text-co-red mt-1">
                    -{overallSummary.overallClassesNeededFor75}{' '}
                    <span className="font-mono text-xs font-normal text-co-muted">CLASSES REQUIRED</span>
                  </div>
                  <p className="font-mono text-[11px] text-co-muted mt-1 leading-tight">
                    Must attend {overallSummary.overallClassesNeededFor75} consecutive sessions to reach 75%.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ============================================================== */}
        {/* 3. PER-SUBJECT TELEMETRY MATRIX & EXPANDABLE DRAWER            */}
        {/* ============================================================== */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-co-muted font-bold uppercase tracking-wider">
              02 // ENROLLED_COURSES_MATRIX ({subjects.length} REGISTERED)
            </span>
            <span className="font-mono text-xs text-co-muted uppercase">
              CLICK CARD TO INSPECT CELL AUDIT
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {subjects.map((subj, idx) => {
              const isExpanded = selectedSubject === subj.courseCode;
              const records = getSubjectRecords(subj.courseCode);

              return (
                <div
                  key={subj.courseCode}
                  className="bg-white border border-co-rule relative flex flex-col justify-between viewfinder-card transition-all"
                >
                  {/* Viewfinder tick marks */}
                  <div className="viewfinder-corner-tl text-co-muted"></div>
                  <div className="viewfinder-corner-tr text-co-muted"></div>
                  <div className="viewfinder-corner-bl text-co-muted"></div>
                  <div className="viewfinder-corner-br text-co-muted"></div>

                  {/* Card Header */}
                  <div className="p-5 border-b border-co-rule">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-xs text-co-muted font-bold uppercase tracking-wider">
                        {String(idx + 1).padStart(2, '0')} // {subj.courseCode}
                      </span>
                      <span
                        className={`font-mono text-[10px] px-2 py-0.5 border uppercase font-bold ${
                          subj.status === 'SAFE'
                            ? 'bg-blue-50 border-blue-200 text-co-blue'
                            : subj.status === 'WARNING'
                            ? 'bg-amber-50 border-amber-200 text-amber-700'
                            : 'bg-red-50 border-red-200 text-co-red'
                        }`}
                      >
                        {subj.status}
                      </span>
                    </div>

                    <h3 className="font-sans font-bold text-base text-co-ink leading-snug line-clamp-2 min-h-[2.5rem]">
                      {subj.courseName}
                    </h3>
                  </div>

                  {/* Card Telemetry Body */}
                  <div className="p-5 space-y-4 flex-1">
                    <div className="flex items-baseline justify-between">
                      <span className="font-sans font-bold text-3xl text-co-ink">
                        {subj.percentage.toFixed(2)}%
                      </span>
                      <span className="font-mono text-xs text-co-muted font-medium">
                        {subj.present} / {subj.totalClasses} ATTENDED
                      </span>
                    </div>

                    {/* Progress bar */}
                    <div className="w-full bg-co-surface h-1.5 border border-co-rule">
                      <div
                        className={`h-full ${
                          subj.percentage >= 75
                            ? 'bg-co-blue'
                            : subj.percentage >= 70
                            ? 'bg-amber-500'
                            : 'bg-co-red'
                        }`}
                        style={{ width: `${Math.min(100, subj.percentage)}%` }}
                      ></div>
                    </div>

                    {/* Standing Note */}
                    <div className="font-mono text-xs pt-1">
                      {subj.percentage >= 75 ? (
                        <div className="text-co-blue flex items-center space-x-1.5">
                          <span>■</span>
                          <span>+{subj.bunkMargin} BUNKS AVAILABLE</span>
                        </div>
                      ) : (
                        <div className="text-co-red flex items-center space-x-1.5">
                          <span>■</span>
                          <span>-{subj.classesNeededFor75} SESSIONS NEEDED</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Trigger & Expansion Drawer */}
                  <div className="border-t border-co-rule bg-co-surface">
                    <button
                      onClick={() => toggleSubjectDrawer(subj.courseCode)}
                      className="w-full px-5 py-3 min-h-[44px] flex items-center justify-between text-left font-mono text-xs text-co-ink hover:bg-co-rule transition-colors cursor-pointer"
                    >
                      <span className="uppercase tracking-wider">
                        {isExpanded ? 'COLLAPSE_AUDIT_DRAWER' : 'INSPECT_CELL_RECORDS'}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-co-muted" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-co-muted" />
                      )}
                    </button>

                    {/* Detailed Date-by-Date Records Drawer */}
                    {isExpanded && (
                      <div className="p-4 bg-white border-t border-co-rule space-y-3">
                        <div className="font-mono text-[11px] text-co-muted border-b border-co-rule pb-2 flex justify-between">
                          <span>PORTAL SUM : {subj.integrityAudit?.portalReported?.totalPresent ?? subj.present}</span>
                          <span>CALCULATED : {subj.integrityAudit?.calculatedSum?.totalPresent ?? subj.present}</span>
                        </div>

                        {records.length > 0 ? (
                          <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                            {records.map((rec, rIdx) => {
                              const token = rec.courseTokens[subj.courseCode];
                              return (
                                <div
                                  key={rIdx}
                                  className="flex items-center justify-between font-mono text-xs p-1.5 bg-co-surface border border-co-rule"
                                >
                                  <div>
                                    <span className="font-bold text-co-ink">{rec.date}</span>
                                    {rec.dayOfWeek && (
                                      <span className="text-[10px] text-co-muted ml-2">
                                        ({rec.dayOfWeek.slice(0, 3)})
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <span
                                      className={`px-1.5 py-0.5 text-[10px] font-bold ${
                                        token?.classesAttended > 0
                                          ? 'bg-blue-100 text-co-blue'
                                          : token?.isHoliday
                                          ? 'bg-gray-200 text-co-muted'
                                          : 'bg-red-100 text-co-red'
                                      }`}
                                    >
                                      {token?.rawToken || '0'}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="font-mono text-xs text-co-muted">
                            No granular date rows logged for this course.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
};

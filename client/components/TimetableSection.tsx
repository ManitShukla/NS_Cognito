import React, { useState } from 'react';
import type { PersonalizedStudentSchedule, DayOfWeek } from '../types/api';
import { MapPin, User } from 'lucide-react';

interface TimetableSectionProps {
  schedule: PersonalizedStudentSchedule;
}

const DAYS: DayOfWeek[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const TimetableSection: React.FC<TimetableSectionProps> = ({ schedule }) => {
  // Determine current day from system clock
  const currentDayIndex = new Date().getDay(); // 0 is Sunday, 1 is Monday...
  const initialDay: DayOfWeek =
    currentDayIndex >= 1 && currentDayIndex <= 6 ? DAYS[currentDayIndex - 1] : 'Monday';

  const [selectedDay, setSelectedDay] = useState<DayOfWeek | 'ALL'>(initialDay);

  // Helper checking if a slot is happening right now
  const isCurrentTimeSlot = (startTime: string, endTime: string, day: DayOfWeek): boolean => {
    const now = new Date();
    const currentDayName = DAYS[now.getDay() - 1];
    if (currentDayName !== day) return false;

    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);

    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  };

  const daySchedule = selectedDay === 'ALL' ? null : schedule.schedule[selectedDay] || [];

  return (
    <div className="bg-co-surface min-h-screen py-8 text-co-ink">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* ============================================================== */}
        {/* HEADER & WEEKLY METRICS STRIP                                  */}
        {/* ============================================================== */}
        <section className="bg-white border border-co-rule border-b-2 border-b-co-red p-6 sm:p-8 relative">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-co-rule pb-4 mb-6">
            <div className="flex items-center space-x-3">
              <span className="font-mono text-xs text-co-red font-bold uppercase tracking-wider">
                SEC // 02.PERSONAL_SCHEDULE
              </span>
              <span className="text-co-rule">|</span>
              <span className="font-mono text-xs text-co-muted uppercase tracking-wider">
                RESOLVED_GROUP :: {schedule.assignedGroup}
              </span>
            </div>

            <div className="flex items-center space-x-4 font-mono text-xs text-co-muted">
              <span>{schedule.program} / {schedule.branch} / SEM_{schedule.semester} (SEC {schedule.section})</span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono text-xs">
            <div className="p-3 bg-co-surface border border-co-rule">
              <span className="text-co-muted block mb-1">TOTAL SESSIONS</span>
              <span className="font-sans font-bold text-2xl text-co-ink">
                {schedule.totalWeeklyClasses}
              </span>
            </div>
            <div className="p-3 bg-co-surface border border-co-rule">
              <span className="text-co-muted block mb-1">LECTURE HOURS</span>
              <span className="font-sans font-bold text-2xl text-co-ink">
                {schedule.weeklyLectureHours} hrs
              </span>
            </div>
            <div className="p-3 bg-co-surface border border-co-rule">
              <span className="text-co-muted block mb-1">PRACTICAL LABS</span>
              <span className="font-sans font-bold text-2xl text-co-blue">
                {schedule.weeklyPracticalHours} hrs
              </span>
            </div>
            <div className="p-3 bg-co-surface border border-co-rule">
              <span className="text-co-muted block mb-1">TUTORIAL HOURS</span>
              <span className="font-sans font-bold text-2xl text-co-ink">
                {schedule.weeklyTutorialHours} hrs
              </span>
            </div>
          </div>
        </section>

        {/* ============================================================== */}
        {/* DAY SELECTOR TABS                                             */}
        {/* ============================================================== */}
        <div className="flex flex-wrap border-b border-co-rule bg-white">
          {DAYS.map((d) => (
            <button
              key={d}
              onClick={() => setSelectedDay(d)}
              className={`px-5 py-3 font-mono text-xs font-bold tracking-wider uppercase border-r border-co-rule transition-colors cursor-pointer ${
                selectedDay === d
                  ? 'bg-co-ink text-white border-b-2 border-b-co-red'
                  : 'text-co-ink hover:bg-co-surface'
              }`}
            >
              {d.toUpperCase()}
            </button>
          ))}
          <button
            onClick={() => setSelectedDay('ALL')}
            className={`px-5 py-3 font-mono text-xs font-bold tracking-wider uppercase transition-colors cursor-pointer ${
              selectedDay === 'ALL'
                ? 'bg-co-ink text-white border-b-2 border-b-co-red'
                : 'text-co-ink hover:bg-co-surface'
            }`}
          >
            FULL_WEEK_MATRIX
          </button>
        </div>

        {/* ============================================================== */}
        {/* DAILY SLOTS VIEW                                              */}
        {/* ============================================================== */}
        {selectedDay !== 'ALL' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between font-mono text-xs text-co-muted">
              <span>SCHEDULE FOR {selectedDay.toUpperCase()} ({daySchedule?.length || 0} SESSIONS)</span>
              <span>FILTERED EXCLUSIVELY FOR GROUP {schedule.assignedGroup}</span>
            </div>

            {daySchedule && daySchedule.length > 0 ? (
              <div className="grid grid-cols-1 gap-4">
                {daySchedule.map((slot, idx) => {
                  const isCurrent = isCurrentTimeSlot(slot.startTime, slot.endTime, selectedDay);

                  return (
                    <div
                      key={idx}
                      className={`p-5 bg-white border transition-all relative viewfinder-card ${
                        isCurrent
                          ? 'border-co-red border-l-4 bg-red-50/20'
                          : 'border-co-rule'
                      }`}
                    >
                      {/* Viewfinder brackets */}
                      <div className="viewfinder-corner-tl text-co-muted"></div>
                      <div className="viewfinder-corner-tr text-co-muted"></div>
                      <div className="viewfinder-corner-bl text-co-muted"></div>
                      <div className="viewfinder-corner-br text-co-muted"></div>

                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        {/* Time & Slot Type */}
                        <div className="flex items-center space-x-4">
                          <div className="p-3 bg-co-surface border border-co-rule font-mono text-center min-w-[110px]">
                            <div className="font-bold text-sm text-co-ink">{slot.startTime}</div>
                            <div className="text-[10px] text-co-muted">TO {slot.endTime}</div>
                          </div>

                          <div>
                            <div className="flex items-center space-x-2 mb-1">
                              <span className="font-mono text-xs text-co-red font-bold uppercase tracking-wider">
                                {slot.courseCode}
                              </span>
                              <span className="text-co-rule">|</span>
                              <span
                                className={`font-mono text-[10px] px-2 py-0.5 border font-bold uppercase ${
                                  slot.component === 'Practical'
                                    ? 'bg-blue-50 border-blue-200 text-co-blue'
                                    : 'bg-co-surface border-co-rule text-co-ink'
                                }`}
                              >
                                {slot.component}
                              </span>
                              {slot.spanHours && slot.spanHours > 1 && (
                                <span className="font-mono text-[10px] px-2 py-0.5 bg-co-night text-white font-bold uppercase">
                                  {slot.spanHours}-HR BLOCK
                                </span>
                              )}
                              {isCurrent && (
                                <span className="font-mono text-[10px] px-2 py-0.5 bg-co-red text-white font-bold uppercase animate-pulse">
                                  LIVE NOW
                                </span>
                              )}
                            </div>

                            <h3 className="font-sans font-bold text-lg text-co-ink">
                              {slot.courseName}
                            </h3>
                          </div>
                        </div>

                        {/* Location, Faculty & Group */}
                        <div className="flex flex-wrap sm:flex-col sm:items-end gap-2 font-mono text-xs text-co-muted">
                          <div className="flex items-center space-x-1.5 bg-co-surface px-2.5 py-1 border border-co-rule text-co-ink font-bold">
                            <MapPin className="w-3.5 h-3.5 text-co-red" />
                            <span>{slot.room || 'TBA'}</span>
                          </div>
                          <div className="flex items-center space-x-1.5 bg-co-surface px-2.5 py-1 border border-co-rule">
                            <User className="w-3.5 h-3.5 text-co-muted" />
                            <span>{slot.faculty || 'FACULTY'}</span>
                          </div>
                          <div className="text-[10px] text-co-muted">
                            BATCH :: {slot.group || 'ALL'}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-12 bg-white border border-co-rule text-center">
                <p className="font-mono text-xs text-co-muted uppercase">
                  No academic sessions scheduled for {selectedDay}. Enjoy your open day.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* FULL WEEK MATRIX VIEW                                         */}
        {/* ============================================================== */}
        {selectedDay === 'ALL' && (
          <div className="bg-white border border-co-rule overflow-x-auto">
            <table className="w-full border-collapse font-mono text-xs">
              <thead>
                <tr className="bg-co-ink text-white border-b-2 border-co-red">
                  <th className="p-3 text-left border-r border-co-dark-rule w-32">DAY</th>
                  <th className="p-3 text-left">RESOLVED SESSIONS (CHRONOLOGICAL)</th>
                </tr>
              </thead>
              <tbody>
                {DAYS.map((d) => {
                  const slots = schedule.schedule[d] || [];
                  return (
                    <tr key={d} className="border-b border-co-rule hover:bg-co-surface/50">
                      <td className="p-3 font-bold text-co-ink bg-co-surface border-r border-co-rule align-top">
                        {d.toUpperCase()}
                      </td>
                      <td className="p-3 space-y-2">
                        {slots.length > 0 ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                            {slots.map((s, sIdx) => (
                              <div
                                key={sIdx}
                                className="p-2.5 bg-white border border-co-rule font-mono text-xs"
                              >
                                <div className="flex justify-between font-bold text-co-red">
                                  <span>{s.startTime} - {s.endTime}</span>
                                  <span className="text-co-ink">{s.component}</span>
                                </div>
                                <div className="font-sans font-bold text-co-ink mt-0.5 truncate">
                                  {s.courseName}
                                </div>
                                <div className="text-[10px] text-co-muted mt-1 flex justify-between">
                                  <span>ROOM: {s.room}</span>
                                  <span>GRP: {s.group}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-co-disabled">NO SESSIONS</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

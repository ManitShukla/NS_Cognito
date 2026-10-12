import React from 'react';
import { Radio, LogOut } from 'lucide-react';

export type ActiveTab = 'dashboard' | 'timetable' | 'simulator' | 'explorer';

interface NavbarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  sessionToken: string | null;
  rollNo: string | null;
  onLogout: () => void;
  onOpenLogin: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onTabChange,
  sessionToken,
  rollNo,
  onLogout,
  onOpenLogin,
}) => {
  return (
    <header className="sticky top-0 z-50 w-full bg-co-ink border-b-2 border-co-red text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-[72px] flex items-center justify-between">
        {/* Brand & System Node Indicator */}
        <div className="flex items-center space-x-4">
          <div className="w-8 h-8 bg-co-red flex items-center justify-center font-mono font-bold text-sm text-white select-none">
            NC
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-sans font-bold text-lg tracking-tight uppercase">
                NS Cognito
              </span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 bg-co-night border border-co-dark-rule text-co-dark-copy uppercase">
                v1.0.0
              </span>
            </div>
            <div className="font-mono text-[10px] tracking-wider text-co-muted uppercase">
              Academic Coprocessor // NSUT Telemetry Node
            </div>
          </div>
        </div>

        {/* Navigation Links with Dual-Line Hairline Hover */}
        <nav className="hidden md:flex items-center space-x-8">
          <button
            onClick={() => onTabChange('dashboard')}
            className={`font-mono text-xs tracking-wider text-left transition-colors cursor-pointer hairline-dual ${
              activeTab === 'dashboard' ? 'active text-white' : 'text-co-dark-copy hover:text-white'
            }`}
          >
            <span className="text-co-muted mr-1.5">01 //</span>
            COMMAND_CENTER
          </button>

          <button
            onClick={() => onTabChange('timetable')}
            className={`font-mono text-xs tracking-wider text-left transition-colors cursor-pointer hairline-dual ${
              activeTab === 'timetable' ? 'active text-white' : 'text-co-dark-copy hover:text-white'
            }`}
          >
            <span className="text-co-muted mr-1.5">02 //</span>
            SCHEDULE_MATRIX
          </button>

          <button
            onClick={() => onTabChange('simulator')}
            className={`font-mono text-xs tracking-wider text-left transition-colors cursor-pointer hairline-dual ${
              activeTab === 'simulator' ? 'active text-white' : 'text-co-dark-copy hover:text-white'
            }`}
          >
            <span className="text-co-muted mr-1.5">03 //</span>
            ATTENDANCE_SIMULATOR
          </button>

          <button
            onClick={() => onTabChange('explorer')}
            className={`font-mono text-xs tracking-wider text-left transition-colors cursor-pointer hairline-dual ${
              activeTab === 'explorer' ? 'active text-white' : 'text-co-dark-copy hover:text-white'
            }`}
          >
            <span className="text-co-muted mr-1.5">04 //</span>
            TIMETABLE_EXPLORER
          </button>
        </nav>

        {/* Session Status & Auth Controls */}
        <div className="flex items-center space-x-3">
          {sessionToken ? (
            <div className="flex items-center space-x-3">
              <div className="hidden sm:flex flex-col items-end">
                <span className="font-mono text-[11px] text-white tracking-wider flex items-center space-x-1.5">
                  <span className="inline-block w-2 h-2 bg-emerald-500 animate-pulse"></span>
                  <span>{rollNo || 'SESSION_ACTIVE'}</span>
                </span>
                <span className="font-mono text-[9px] text-co-muted tracking-widest uppercase">
                  PROXY_TUNNEL // LIVE
                </span>
              </div>
              <button
                onClick={onLogout}
                title="Terminate Session"
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-co-night border border-co-dark-rule text-co-dark-copy hover:text-co-red hover:border-co-red transition-colors text-xs font-mono uppercase cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">EXIT</span>
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenLogin}
              className="flex items-center space-x-2 px-4 py-2 bg-co-red text-white text-xs font-mono font-bold tracking-wider uppercase border border-co-red hover:-translate-y-0.5 transition-transform cursor-pointer"
            >
              <Radio className="w-3.5 h-3.5" />
              <span>CONNECT_AUTH</span>
            </button>
          )}
        </div>
      </div>

      {/* Mobile Navigation Sub-bar */}
      <div className="md:hidden flex overflow-x-auto border-t border-co-dark-rule px-4 py-2 bg-co-black space-x-4">
        <button
          onClick={() => onTabChange('dashboard')}
          className={`font-mono text-[11px] tracking-wider whitespace-nowrap ${
            activeTab === 'dashboard' ? 'text-co-red font-bold' : 'text-co-muted'
          }`}
        >
          01 // DASHBOARD
        </button>
        <button
          onClick={() => onTabChange('timetable')}
          className={`font-mono text-[11px] tracking-wider whitespace-nowrap ${
            activeTab === 'timetable' ? 'text-co-red font-bold' : 'text-co-muted'
          }`}
        >
          02 // TIMETABLE
        </button>
        <button
          onClick={() => onTabChange('simulator')}
          className={`font-mono text-[11px] tracking-wider whitespace-nowrap ${
            activeTab === 'simulator' ? 'text-co-red font-bold' : 'text-co-muted'
          }`}
        >
          03 // SIMULATOR
        </button>
        <button
          onClick={() => onTabChange('explorer')}
          className={`font-mono text-[11px] tracking-wider whitespace-nowrap ${
            activeTab === 'explorer' ? 'text-co-red font-bold' : 'text-co-muted'
          }`}
        >
          04 // EXPLORER
        </button>
      </div>
    </header>
  );
};

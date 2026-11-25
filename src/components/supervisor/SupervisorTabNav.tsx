'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, TableProperties, BarChart3, Users, Shield } from 'lucide-react';
import { useEvaluationAccess } from '@/lib/auth/evaluationAccess';

interface SupervisorTabNavProps {
  rightAction?: React.ReactNode;
}

interface NavTabItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
}

export function SupervisorTabNav({ rightAction }: SupervisorTabNavProps) {
  const pathname = usePathname();
  const { user } = useEvaluationAccess();

  const supervisorTabs: NavTabItem[] = useMemo(() => {
    const isStateReviewer = user?.role === 'STATE_REVIEWER';

    const baseTabs: NavTabItem[] = [
      {
        href: '/supervisor',
        label: 'Overview & Surveillance',
        icon: Activity,
        exact: true,
      },
      {
        href: '/supervisor/assessments',
        label: 'Beneficiary Linelist',
        icon: TableProperties,
        exact: false,
      },
      {
        href: '/supervisor/analytics',
        label: 'Clinical Analytics',
        icon: BarChart3,
        exact: false,
      },
      {
        href: '/supervisor/field-workers',
        label: 'Field Workers',
        icon: Users,
        exact: false,
      },
    ];

    if (!isStateReviewer) {
      baseTabs.push({
        href: '/supervisor/registrations',
        label: 'Registrations Review',
        icon: Shield,
        exact: false,
      });
    }

    return baseTabs;
  }, [user?.role]);

  // Identify active tab accurately
  const getActiveTabHref = (): string => {
    if (pathname === '/supervisor') return '/supervisor';
    if (pathname?.startsWith('/supervisor/assessments') || pathname?.startsWith('/supervisor/linelist')) {
      return '/supervisor/assessments';
    }
    if (pathname?.startsWith('/supervisor/analytics')) return '/supervisor/analytics';
    if (pathname?.startsWith('/supervisor/field-workers')) return '/supervisor/field-workers';
    if (pathname?.startsWith('/supervisor/registrations')) return '/supervisor/registrations';
    return '/supervisor';
  };

  const activeHref = getActiveTabHref();

  return (
    <nav
      aria-label="Evaluation Workspace Navigation"
      className="sticky top-[60px] md:top-[72px] z-30 mb-3 sm:mb-4 bg-white/92 backdrop-blur-md border border-sky-100/90 rounded-2xl p-1.5 shadow-[0_4px_16px_-4px_rgba(7,43,124,0.08)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 select-none"
    >
      <div
        className="relative flex items-center space-x-1 overflow-x-auto no-scrollbar scroll-smooth snap-x snap-mandatory p-0.5"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {supervisorTabs.map((tab) => {
          const isActive = tab.href === activeHref;
          const Icon = tab.icon;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive ? 'page' : undefined}
              className={`group relative flex items-center space-x-2 py-2 px-3.5 text-xs font-bold rounded-xl transition-all duration-200 whitespace-nowrap snap-start shrink-0 min-h-[44px] md:min-h-[38px] ${
                isActive
                  ? 'text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-950 hover:bg-sky-50/70'
              }`}
              style={
                isActive
                  ? { background: 'linear-gradient(135deg, #2563EB 0%, #155AD1 100%)' }
                  : undefined
              }
            >
              <Icon
                className={`h-3.5 w-3.5 transition-all duration-200 group-hover:scale-110 ${
                  isActive ? 'text-white' : 'text-slate-400 group-hover:text-[#155AD1]'
                }`}
              />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>

      {/* Right Side Actions / Tools */}
      {rightAction && (
        <div className="flex items-center space-x-2 px-1.5 pb-1 sm:pb-0 shrink-0">
          {rightAction}
        </div>
      )}
    </nav>
  );
}

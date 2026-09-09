'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, TableProperties, BarChart3 } from 'lucide-react';

interface SupervisorTabNavProps {
  rightAction?: React.ReactNode;
}

interface NavTabItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
}

const SUPERVISOR_TABS: NavTabItem[] = [
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
];

export function SupervisorTabNav({ rightAction }: SupervisorTabNavProps) {
  const pathname = usePathname();
  const [indicatorStyle, setIndicatorStyle] = useState<{ left: number; width: number; opacity: number }>({
    left: 0,
    width: 0,
    opacity: 0,
  });
  const [hoverStyle, setHoverStyle] = useState<{ left: number; width: number; opacity: number }>({
    left: 0,
    width: 0,
    opacity: 0,
  });

  const tabRefs = useRef<{ [key: string]: HTMLAnchorElement | null }>({});
  const navContainerRef = useRef<HTMLDivElement>(null);

  // Identify active tab accurately
  const getActiveTabHref = (): string => {
    if (pathname === '/supervisor') return '/supervisor';
    if (pathname?.startsWith('/supervisor/assessments') || pathname?.startsWith('/supervisor/linelist')) {
      return '/supervisor/assessments';
    }
    if (pathname?.startsWith('/supervisor/analytics')) return '/supervisor/analytics';
    return '/supervisor';
  };

  const activeHref = getActiveTabHref();

  // Recalculate indicator position on route change or window resize
  useEffect(() => {
    const updateActiveIndicator = () => {
      const activeEl = tabRefs.current[activeHref];
      const containerEl = navContainerRef.current;
      if (activeEl && containerEl) {
        const containerRect = containerEl.getBoundingClientRect();
        const tabRect = activeEl.getBoundingClientRect();
        setIndicatorStyle({
          left: tabRect.left - containerRect.left,
          width: tabRect.width,
          opacity: 1,
        });
      }
    };

    updateActiveIndicator();
    // Allow slight delay for font rendering / layout reflow
    const rafId = requestAnimationFrame(updateActiveIndicator);
    const timeoutId = setTimeout(updateActiveIndicator, 60);

    window.addEventListener('resize', updateActiveIndicator);
    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timeoutId);
      window.removeEventListener('resize', updateActiveIndicator);
    };
  }, [activeHref]);

  const handleMouseEnter = (href: string) => {
    const el = tabRefs.current[href];
    const containerEl = navContainerRef.current;
    if (el && containerEl && href !== activeHref) {
      const containerRect = containerEl.getBoundingClientRect();
      const tabRect = el.getBoundingClientRect();
      setHoverStyle({
        left: tabRect.left - containerRect.left,
        width: tabRect.width,
        opacity: 1,
      });
    }
  };

  const handleMouseLeave = () => {
    setHoverStyle((prev) => ({ ...prev, opacity: 0 }));
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 mb-3 sm:mb-4 gap-3 relative">
      <div
        ref={navContainerRef}
        onMouseLeave={handleMouseLeave}
        className="relative flex items-center space-x-1 overflow-x-auto sm:overflow-x-visible no-scrollbar pb-[1px]"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {SUPERVISOR_TABS.map((tab) => {
          const isActive = tab.href === activeHref;
          const Icon = tab.icon;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              ref={(el) => {
                tabRefs.current[tab.href] = el;
              }}
              onMouseEnter={() => handleMouseEnter(tab.href)}
              className={`group relative flex items-center space-x-2 py-2.5 px-4 text-xs font-semibold rounded-t-xl transition-all duration-200 whitespace-nowrap select-none ${
                isActive
                  ? 'text-teal-900 font-bold bg-teal-50/70 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-950 hover:bg-slate-100/70'
              }`}
            >
              <Icon
                className={`h-4 w-4 transition-all duration-200 group-hover:scale-110 ${
                  isActive
                    ? 'text-teal-600 scale-105'
                    : 'text-slate-400 group-hover:text-teal-700'
                }`}
              />
              <span className="relative z-10">{tab.label}</span>
            </Link>
          );
        })}

        {/* Hover Highlight Underline Preview */}
        <div
          aria-hidden="true"
          className="absolute bottom-0 h-[2.5px] bg-teal-400/40 rounded-full pointer-events-none transition-all duration-200 ease-out"
          style={{
            transform: `translateX(${hoverStyle.left}px)`,
            width: `${hoverStyle.width}px`,
            opacity: hoverStyle.opacity,
          }}
        />

        {/* Active Animated Gradient Underline Bar */}
        <div
          aria-hidden="true"
          className="absolute bottom-0 h-[3.5px] bg-gradient-to-r from-teal-500 via-emerald-500 to-teal-600 rounded-full shadow-[0_2px_8px_rgba(13,148,136,0.45)] pointer-events-none transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
          style={{
            transform: `translateX(${indicatorStyle.left}px)`,
            width: `${indicatorStyle.width}px`,
            opacity: indicatorStyle.opacity,
          }}
        />
      </div>

      {/* Right Side Actions / Tools */}
      {rightAction && (
        <div className="flex items-center space-x-2 pb-2 sm:pb-0 shrink-0">
          {rightAction}
        </div>
      )}
    </div>
  );
}

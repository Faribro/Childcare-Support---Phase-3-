'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Heart, ShieldCheck, WifiOff } from 'lucide-react';

export function NotebookFooter() {
  return (
    <footer className="py-12 bg-[#0E1E16] text-[#A3B8AD] text-xs border-t border-[#1C3A2B]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pb-8 border-b border-[#1C3A2B]">
          {/* Institutional Brand */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="bg-white rounded-md px-2.5 py-1 inline-flex items-center shadow-xs">
                <Image
                  src="/alliance-india-logo.png"
                  alt="India HIV/AIDS Alliance"
                  width={140}
                  height={36}
                  className="h-7 w-auto object-contain"
                />
              </div>
              <span className="font-bold text-base text-white">India HIV/AIDS Alliance</span>
            </div>
            <p className="text-xs text-[#8BA496]">
              Child Nutrition &amp; Support Platform
            </p>
          </div>

          {/* Quick Navigation Links */}
          <nav aria-label="Footer Navigation" className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
            <Link href="/app" className="text-white hover:text-emerald-300 font-semibold transition-colors">
              Open Field Workspace
            </Link>
            <a href="#how-it-works" className="hover:text-white transition-colors">
              How It Works
            </a>
            <Link href="/supervisor/review" className="hover:text-white transition-colors">
              Supervisor Review
            </Link>
            <Link href="/assessment/drafts" className="hover:text-white transition-colors">
              Local Drafts
            </Link>
          </nav>
        </div>

        {/* Bottom Metadata & Compliance */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-[11px] text-[#7A9486]">
          <div className="flex flex-wrap items-center gap-3">
            <span>Production Field App</span>
            <span>•</span>
            <span className="inline-flex items-center gap-1">
              <WifiOff className="w-3 h-3 text-emerald-400" />
              Offline-First Architecture
            </span>
            <span>•</span>
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              Protected Local Storage
            </span>
          </div>

          <div className="font-medium">
            Built with care for frontline caseworkers supporting vulnerable children across India.
          </div>
        </div>
      </div>
    </footer>
  );
}

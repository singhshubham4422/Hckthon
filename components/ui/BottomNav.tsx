'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, PlusCircle, Bot, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/useStore';

export function BottomNav() {
  const pathname = usePathname();
  const isSetup = useAppStore((state) => state.user.isSetup);

  if (!isSetup) return null;

  return (
    <div className="fixed bottom-0 left-0 z-50 flex h-20 w-full border-t border-slate-200 bg-white px-6 pb-safe dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto flex w-full max-w-md items-center justify-between">
        <NavItem href="/" icon={<Home className="h-7 w-7" />} label="Home" active={pathname === '/'} />
        <NavItem href="/add" icon={<PlusCircle className="h-7 w-7" />} label="Add" active={pathname === '/add'} />
        <NavItem href="/ai" icon={<Bot className="h-7 w-7" />} label="AI Assist" active={pathname === '/ai'} />
        <NavItem href="/settings" icon={<Settings className="h-7 w-7" />} label="Settings" active={pathname === '/settings'} />
      </div>
    </div>
  );
}

function NavItem({ href, icon, label, active }: { href: string; icon: React.ReactNode; label: string; active: boolean }) {
  return (
    <Link 
      href={href}
      className={cn(
        'flex flex-col items-center justify-center gap-1 p-2 transition-colors',
        active ? 'text-blue-600 dark:text-blue-500' : 'text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-zinc-50'
      )}
    >
      {icon}
      <span className="text-xs font-semibold">{label}</span>
    </Link>
  );
}

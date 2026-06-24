'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import UccDashboard from '../components/UccDashboard';
import { api } from '../lib/api';

export default function Home() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkRuntime = async () => {
      try {
        const res = await api.get('/api/status');
        if (res.error) {
          router.replace('/setup');
        } else {
          setIsChecking(false);
        }
      } catch (error) {
        router.replace('/setup');
      }
    };
    checkRuntime();
  }, [router]);

  if (isChecking) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#030712] text-zinc-400 gap-4">
        <div className="w-8 h-8 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
        <span className="text-xs font-mono tracking-wider uppercase text-zinc-500">Iniciando Command Center...</span>
      </div>
    );
  }

  return <UccDashboard />;
}

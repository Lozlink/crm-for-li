'use client';

import { useState } from 'react';
import AppShell from '@/components/AppShell';
import AuthGuard from '@/components/AuthGuard';
import CampaignsView from '@/components/CampaignsView';
import SmsCampaignsView from '@/components/SmsCampaignsView';

type Channel = 'email' | 'sms';

export default function CampaignsPage() {
  const [channel, setChannel] = useState<Channel>('email');

  return (
    <AuthGuard>
      <AppShell>
        <div className="px-6 pt-6">
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
            <button
              onClick={() => setChannel('email')}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                channel === 'email'
                  ? 'bg-primary-500 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Email
            </button>
            <button
              onClick={() => setChannel('sms')}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                channel === 'sms'
                  ? 'bg-primary-500 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              SMS
            </button>
          </div>
        </div>
        {channel === 'email' ? (
          <CampaignsView />
        ) : (
          <div className="p-6">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900">SMS Campaigns</h1>
              <p className="text-sm text-gray-500">
                Reach contacts by SMS. Opt-outs and DNC contacts are filtered automatically.
              </p>
            </div>
            <SmsCampaignsView />
          </div>
        )}
      </AppShell>
    </AuthGuard>
  );
}

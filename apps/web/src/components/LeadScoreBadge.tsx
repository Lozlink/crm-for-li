'use client';

import { memo } from 'react';
import type { LeadTier } from '@realestate-crm/types';

export const TIER_COLORS: Record<LeadTier, string> = {
  hot: '#ef4444',
  warm: '#f59e0b',
  cold: '#6366f1',
  dormant: '#9ca3af',
};

interface LeadScoreBadgeProps {
  score: number;
  tier: LeadTier;
  size?: 'small' | 'medium';
  showLabel?: boolean;
}

function LeadScoreBadge({ score, tier, size = 'small', showLabel = false }: LeadScoreBadgeProps) {
  const color = TIER_COLORS[tier];
  const isSmall = size === 'small';
  const label = showLabel || !isSmall
    ? `${score} ${tier.charAt(0).toUpperCase() + tier.slice(1)}`
    : `${score}`;

  const sizeClass = isSmall
    ? 'h-5 px-1.5 text-[11px]'
    : 'h-7 px-2.5 text-[13px]';

  return (
    <span
      className={`inline-flex items-center justify-center rounded-xl border font-bold whitespace-nowrap ${sizeClass}`}
      style={{ backgroundColor: `${color}18`, borderColor: color, color }}
    >
      {label}
    </span>
  );
}

export default memo(LeadScoreBadge);

import React from 'react';
import { Star } from 'lucide-react';

// Small star shown next to often-used suggestions.
export default function FrequentMark({ count }) {
  if (!(count > 10)) return null;
  return <Star size={12} className="inline ml-1 -mt-0.5 fill-current" aria-label="Used often" />;
}

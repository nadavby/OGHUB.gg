'use client';

import { motion } from 'framer-motion';

export default function EventsPage() {
  return (
    <div style={{ padding: 'var(--space-md)' }}>
      <h1 className="page-title">Events</h1>

      {/* Featured Event Placeholder */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="event-featured-card"
      >
        <div className="event-featured-image">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5C7 4 7 7 7 7" />
            <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5C17 4 17 7 17 7" />
            <path d="M4 22h16" />
            <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20 7 22" />
            <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20 17 22" />
            <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
          </svg>
        </div>
        <div className="event-featured-info">
          <h2 className="event-featured-title">Coming Soon</h2>
          <p className="event-featured-desc">Platform-run tournaments with real prizes. Stay tuned.</p>
        </div>
      </motion.div>

      {/* Event Tabs */}
      <div className="tag-filter" style={{ marginTop: 'var(--space-lg)' }}>
        <button className="tag-btn tag-btn-active">Live</button>
        <button className="tag-btn">Upcoming</button>
        <button className="tag-btn">Past</button>
      </div>

      <div className="empty-state">
        <p>No events yet. Check back soon.</p>
      </div>
    </div>
  );
}

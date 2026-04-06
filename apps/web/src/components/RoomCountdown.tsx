'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  launchAt: number;
}

export function RoomCountdown({ launchAt }: Props) {
  const [remaining, setRemaining] = useState(5);

  useEffect(() => {
    const tick = () => {
      const r = Math.max(0, Math.ceil((launchAt - Date.now()) / 1000));
      setRemaining(r);
    };
    tick();
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [launchAt]);

  return (
    <div className="room-countdown">
      <div className="room-countdown-label">ALL READY!</div>
      <div className="room-countdown-sublabel">Game starts in...</div>
      <AnimatePresence mode="wait">
        <motion.div
          key={remaining}
          className="room-countdown-number"
          initial={{ scale: 1.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.5, opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {remaining}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

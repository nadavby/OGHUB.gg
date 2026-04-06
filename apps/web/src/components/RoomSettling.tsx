'use client';

import { motion } from 'framer-motion';

export function RoomSettling() {
  return (
    <div className="room-settling">
      <motion.div
        className="room-settling-spinner"
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
      >
        ⟳
      </motion.div>
      <div className="room-settling-text">Validating results...</div>
    </div>
  );
}

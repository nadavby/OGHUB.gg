'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRooms } from '@/hooks/useRooms';
import { useAuth } from '@/hooks/useAuth';

const FORMATS = [
  { value: 'ONE_V_ONE', label: '1v1', players: 2 },
  { value: 'BEST_OF_3', label: 'Bo3', players: 2 },
  { value: 'FFA_5', label: 'FFA 5', players: 5 },
  { value: 'FFA_10', label: 'FFA 10', players: 10 },
  { value: 'FFA_20', label: 'FFA 20', players: 20 },
];

const FEE_PRESETS = [1, 2, 5, 10, 25];

interface CreateRoomModalProps {
  gameId: string;
  gameTitle: string;
  open: boolean;
  onClose: () => void;
  onCreated: (roomId: string) => void;
}

export default function CreateRoomModal({ gameId, gameTitle, open, onClose, onCreated }: CreateRoomModalProps) {
  const { createRoom } = useRooms();
  const { refreshWallet } = useAuth();
  const [format, setFormat] = useState('ONE_V_ONE');
  const [fee, setFee] = useState('5');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const feeNum = parseFloat(fee) || 0;
  const platformCut = feeNum * 0.05;
  const selectedFormat = FORMATS.find(f => f.value === format)!;
  const prizePool = ((feeNum - platformCut) * selectedFormat.players).toFixed(2);

  const handleCreate = async () => {
    if (feeNum < 0.5 || feeNum > 100) {
      setError('Entry fee must be between $0.50 and $100');
      return;
    }
    setError(null);
    setCreating(true);
    try {
      const result = await createRoom({ gameId, format, entryFee: feeNum });
      await refreshWallet();
      onCreated(result.id);
    } catch (err: any) {
      setError(err.message || 'Failed to create room');
    } finally {
      setCreating(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="modal-sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-handle" />
            <h2 className="modal-title">Create Room</h2>

            <div className="modal-label">Format</div>
            <div className="format-options">
              {FORMATS.map(f => (
                <button
                  key={f.value}
                  className={`format-pill ${format === f.value ? 'format-pill-active' : ''}`}
                  onClick={() => setFormat(f.value)}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="modal-label">Entry Fee</div>
            <div className="modal-fee-row">
              <input
                className="form-input"
                type="number"
                placeholder="0.00"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                min="0.50"
                max="100"
                step="0.50"
              />
            </div>
            <div className="quick-amounts">
              {FEE_PRESETS.map(amount => (
                <button
                  key={amount}
                  className="quick-amount-btn"
                  onClick={() => setFee(amount.toString())}
                >
                  ${amount}
                </button>
              ))}
            </div>

            <div className="modal-summary">
              <span className="modal-summary-label">Prize Pool ({selectedFormat.players} players)</span>
              <span className="modal-summary-value">${prizePool}</span>
            </div>

            {error && <div className="modal-error">{error}</div>}

            <button
              className="create-room-btn"
              onClick={handleCreate}
              disabled={creating}
            >
              {creating ? 'Creating...' : `Create ${selectedFormat.label} Room - $${feeNum.toFixed(2)}`}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

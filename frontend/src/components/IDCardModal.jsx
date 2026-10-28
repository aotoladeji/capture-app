import React, { useState, useEffect } from 'react';
import axios from 'axios';

const CARD_WIDTH = 336;
const CARD_HEIGHT = 212;
const VERSION = 'FINAL'; // Version removed from display

const IDCardModal = ({ userId, onClose, onAction }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const getAuthHeaders = () => {
    const token = localStorage.getItem('adminToken') || localStorage.getItem('staffToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError('');
    axios
      .get(`${import.meta.env.VITE_API_URL}/api/printing/data/${userId}`)
      .then(res => {
        if (mounted) setData(res.data.data);
      })
      .catch((err) => {
        if (mounted) {
          setError(err.response?.data?.message || 'Unable to load ID card details.');
          setData(null);
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [userId]);

  const handleApprove = async () => {
    try {
      await axios.post(`${import.meta.env.VITE_API_URL}/api/staff/approve/${userId}`);
      onAction();
    } catch (err) {
      alert('Error approving');
    }
  };

  const handleReject = async () => {
    try {
      await axios.post(`${import.meta.env.VITE_API_URL}/api/staff/reject/${userId}`);
      onAction();
    } catch (err) {
      alert('Error rejecting');
    }
  };

  const handleResetCandidate = async () => {
    const identifier = data?.matric_no || data?.staff_id || '';
    const prompt = identifier
      ? `Reset candidate ${identifier}? This clears only this candidate's captured registration data.`
      : 'Reset this candidate? This clears only this candidate\'s captured registration data.';

    if (!window.confirm(prompt)) return;

    try {
      await axios.post(
        `${import.meta.env.VITE_API_URL}/api/staff/reset-candidate`,
        { userId, identifier },
        { headers: getAuthHeaders() }
      );
      alert('Candidate reset successfully. They can login and recapture now.');
      onAction();
    } catch (err) {
      alert(err.response?.data?.message || 'Error resetting candidate');
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center z-50 no-print bg-black/40">
        <div className="bg-white p-6 rounded shadow relative min-w-72 text-center">
          <button onClick={onClose} className="absolute top-2 right-2 text-xl">x</button>
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-600"></div>
          <p className="mt-3 text-gray-700">Loading ID card...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="fixed inset-0 flex items-center justify-center z-50 no-print bg-black/40">
        <div className="bg-white p-6 rounded shadow relative min-w-80">
          <button onClick={onClose} className="absolute top-2 right-2 text-xl">x</button>
          <h3 className="text-lg font-semibold text-gray-900">Unable to open ID card</h3>
          <p className="mt-2 text-sm text-gray-600">{error || 'No data available for this user yet.'}</p>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded">Close</button>
            <button onClick={() => window.location.reload()} className="px-4 py-2 bg-blue-600 text-white rounded">Retry</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>
        {`
          @media print {
            body * { visibility: hidden; }
            .print-card, .print-card * { visibility: visible; }
            .print-card {
              position: absolute;
              left: 0; top: 0;
              width: 85.6mm; height: 53.98mm;
              background: none !important;
            }
          }
        `}
      </style>

      <div className="fixed inset-0 flex items-center justify-center z-50 no-print">
        <div className="bg-white p-6 rounded shadow relative">
          <button onClick={onClose} className="absolute top-2 right-2 text-xl">✕</button>

          <div
            className="print-card"
            data-version={VERSION}
            style={{
              width: CARD_WIDTH,
              height: CARD_HEIGHT,
              position: 'relative',
              fontFamily: 'Arial, sans-serif',
              fontSize: '11px',
              backgroundImage: `url(/blank_card.jpeg?v=${VERSION})`,
              backgroundSize: 'cover',
              backgroundRepeat: 'no-repeat'
            }}
          >
            {/* Text with proper spacing to align with template */}
            <div style={{ position: 'absolute', top: 56, left: 70 }}>{data.matric_no}</div>
            <div style={{ position: 'absolute', top: 74, left: 70, fontWeight: 'bold' }}>{data.surname}</div>
            <div style={{ position: 'absolute', top: 92, left: 70 }}>{data.other_names}</div>
            <div style={{ position: 'absolute', top: 110, left: 70 }}>{data.faculty}</div>
            <div style={{ position: 'absolute', top: 128, left: 70 }}>{data.department}</div>
            <div style={{ position: 'absolute', top: 146, left: 70 }}>{data.level}</div>
            <div style={{ position: 'absolute', top: 164, left: 70 }}>{data.hall}</div>

            {/* Barcode 67pt wide, top 134.4pt (px-converted) */}
            <div style={{ position: 'absolute', top: 186.21, left: '50%', transform: 'translateX(-50%)', width: 92.78, height: 20 }}>
              <svg width="92.78" height="20" viewBox="0 0 48 20" preserveAspectRatio="none">
                <rect x="0" y="0" width="2" height="20" fill="black" />
                <rect x="4" y="0" width="3" height="20" fill="black" />
                <rect x="9" y="0" width="1" height="20" fill="black" />
                <rect x="12" y="0" width="2" height="20" fill="black" />
                <rect x="16" y="0" width="4" height="20" fill="black" />
                <rect x="22" y="0" width="2" height="20" fill="black" />
                <rect x="26" y="0" width="3" height="20" fill="black" />
                <rect x="31" y="0" width="1" height="20" fill="black" />
                <rect x="34" y="0" width="2" height="20" fill="black" />
                <rect x="38" y="0" width="4" height="20" fill="black" />
                <rect x="44" y="0" width="2" height="20" fill="black" />
              </svg>
            </div>

            {/* Card number at bottom left */}
            <div style={{ position: 'absolute', bottom: 12, left: 10, fontSize: '9px' }}>
              {data.card_number}
            </div>

            {/* Photo moved down to match reference */}
            <div style={{ position: 'absolute', top: 88, right: 12, width: 78, height: 96 }}>
              <img
                src={`data:image/jpeg;base64,${data.passport_photo}`}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>

            {/* Signature under photo */}
            <div style={{ position: 'absolute', top: 186, right: 12, width: 78, height: 22 }}>
              {data.signature && (
                <img
                  src={`data:image/png;base64,${data.signature}`}
                  alt="Signature"
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              )}
            </div>

            {/* Session moved down to match reference, at right edge */}
            <div
              style={{
                position: 'absolute',
                top: 95,
                right: 0,
                writingMode: 'vertical-rl',
                transformOrigin: 'center',
                fontSize: '9px',
                fontWeight: 'bold'
              }}
            >
              {data.session}
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-4 no-print">
            <button onClick={handleResetCandidate} className="px-4 py-2 bg-amber-600 text-white rounded">Reset Candidate</button>
            <button onClick={handleReject} className="px-4 py-2 bg-red-600 text-white rounded">Reject</button>
            <button onClick={handleApprove} className="px-4 py-2 bg-green-600 text-white rounded">Approve</button>
            <button onClick={() => window.print()} className="px-4 py-2 bg-blue-600 text-white rounded">Print Preview</button>
          </div>
        </div>
      </div>
    </>
  );
};

export default IDCardModal;

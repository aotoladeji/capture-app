import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import IDCardModal from '../components/IDCardModal';

const StaffDashboard = () => {
  const [pendingRegistrations, setPendingRegistrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const navigate = useNavigate();
  const [approvedToday, setApprovedToday] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [resetIdentifier, setResetIdentifier] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkApproving, setBulkApproving] = useState(false);

useEffect(() => {
  const loadData = async () => {
    await fetchPendingRegistrations();
    await fetchApprovedToday();
  };
  loadData();
}, []); // empty dependency array means it runs once when component mounts

// Auto-refresh every 10 seconds
useEffect(() => {
  if (!autoRefresh) return;

  const interval = setInterval(async () => {
    await fetchPendingRegistrations();
    await fetchApprovedToday();
    setLastUpdated(new Date());
  }, 10000); // 10 seconds

  return () => clearInterval(interval);
}, [autoRefresh]);

  const fetchPendingRegistrations = async () => {
    try {
      const response = await axios.get(`${import.meta.env.VITE_API_URL}/api/staff/pending`);
      setPendingRegistrations(response.data.pending || []);
      setLastUpdated(new Date());
    } catch (error) {
      console.error('Error fetching pending registrations:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchApprovedToday = async () => {
  try {
    const response = await axios.get(`${import.meta.env.VITE_API_URL}/api/staff/approved-today`);
    setApprovedToday(response.data.count);
  } catch (error) {
    console.error('Error fetching approved count:', error);
  }
};

  const handleLogout = () => {
    localStorage.removeItem('staffToken');
    localStorage.removeItem('staffRole');
    navigate('/staff/login');
  };

  const viewIDCard = (userId) => {
    setSelectedUserId(userId);
    setShowModal(true);
  };

  const handleModalAction = async () => {
    await fetchPendingRegistrations(); // refresh the list
    await fetchApprovedToday();       
    setShowModal(false);              
  };

  const toggleSelectOne = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) =>
      prev.length === pendingRegistrations.length
        ? []
        : pendingRegistrations.map((r) => r.id)
    );
  };

  const bulkApprove = async (userIds) => {
    if (userIds.length === 0) return;
    if (!window.confirm(`Approve ${userIds.length} registration(s) and send for printing?`)) return;

    setBulkApproving(true);
    try {
      const response = await axios.post(`${import.meta.env.VITE_API_URL}/api/staff/approve-bulk`, { userIds });
      alert(response.data.message || 'Approved successfully');
      setSelectedIds([]);
      await fetchPendingRegistrations();
      await fetchApprovedToday();
    } catch (error) {
      alert(error.response?.data?.message || 'Bulk approve failed');
    } finally {
      setBulkApproving(false);
    }
  };

  const handleApproveSelected = () => bulkApprove(selectedIds);
  const handleApproveAll = () => bulkApprove(pendingRegistrations.map((r) => r.id));

  const handleResetCandidate = async () => {
    if (!resetIdentifier.trim()) {
      alert('Enter matric number or PF number');
      return;
    }

    const confirmed = window.confirm(
      `Reset candidate ${resetIdentifier.trim()} only? This is not a general reset.`
    );
    if (!confirmed) return;

    setResetLoading(true);
    try {
      const token = localStorage.getItem('staffToken') || localStorage.getItem('adminToken');
      await axios.post(
        `${import.meta.env.VITE_API_URL}/api/staff/reset-candidate`,
        { identifier: resetIdentifier.trim() },
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      alert('Candidate reset successfully. They can login and recapture now.');
      setResetIdentifier('');
      await fetchPendingRegistrations();
      await fetchApprovedToday();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to reset candidate');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      {showModal && selectedUserId && (
        <IDCardModal
          userId={selectedUserId}
          onClose={() => setShowModal(false)}
          onAction={handleModalAction}
        />
      )}
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold">Staff Dashboard</h1>
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-2">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoRefresh}
                    onChange={(e) => setAutoRefresh(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  <span className="ml-3 text-sm font-medium text-gray-700">
                    Auto-refresh {autoRefresh ? 'ON' : 'OFF'}
                  </span>
                </label>
              </div>
              <span className="text-xs text-gray-500">
                Last updated: {lastUpdated.toLocaleTimeString()}
              </span>
              <button
                onClick={() => {
                  fetchPendingRegistrations();
                  fetchApprovedToday();
                }}
                className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh Now
              </button>
            </div>
          </div>
          <div className="space-x-2">
            <button
              onClick={() => navigate('/staff/change-password')}
              className="bg-yellow-600 text-white px-4 py-2 rounded hover:bg-yellow-700"
            >
              Change Password
            </button>
            <button
              onClick={handleLogout}
              className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
            >
              Logout
            </button>
          </div>
        </div>

        <div className="bg-white shadow-lg rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-amber-50">
            <h3 className="text-sm font-semibold text-amber-900">Reset Single Candidate</h3>
            <p className="text-xs text-amber-800 mt-1">Use this only for one candidate who needs to redo capture. It will not reset everyone.</p>
            <div className="mt-3 flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={resetIdentifier}
                onChange={(e) => setResetIdentifier(e.target.value)}
                placeholder="Enter Matric No or PF Number"
                className="flex-1 px-3 py-2 border border-amber-300 rounded-md"
              />
              <button
                onClick={handleResetCandidate}
                disabled={resetLoading}
                className={`px-4 py-2 rounded-md text-white ${resetLoading ? 'bg-amber-300' : 'bg-amber-600 hover:bg-amber-700'}`}
              >
                {resetLoading ? 'Resetting...' : 'Reset Candidate'}
              </button>
            </div>
          </div>
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-800">Pending Registrations</h2>
              <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                {pendingRegistrations.length} pending
              </span>
            </div>
            {pendingRegistrations.length > 0 && (
              <div className="mt-3 flex items-center gap-3">
                <span className="text-sm text-gray-600">{selectedIds.length} selected</span>
                <button
                  onClick={handleApproveSelected}
                  disabled={bulkApproving || selectedIds.length === 0}
                  className={`px-4 py-2 text-sm font-medium rounded-md text-white ${
                    bulkApproving || selectedIds.length === 0
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-green-600 hover:bg-green-700'
                  }`}
                >
                  Approve Selected
                </button>
                <button
                  onClick={handleApproveAll}
                  disabled={bulkApproving}
                  className={`px-4 py-2 text-sm font-medium rounded-md text-white ${
                    bulkApproving ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-800 hover:bg-green-900'
                  }`}
                >
                  {bulkApproving ? 'Approving...' : 'Approve All'}
                </button>
              </div>
            )}
          </div>

          {loading ? (
            <div className="p-12 text-center">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-600"></div>
              <p className="mt-4 text-gray-600">Loading registrations...</p>
            </div>
          ) : pendingRegistrations.length === 0 ? (
            <div className="p-12 text-center">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="mt-4 text-lg font-medium text-gray-900">No pending registrations</h3>
              <p className="mt-2 text-gray-500">All registrations have been processed.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectedIds.length > 0 && selectedIds.length === pendingRegistrations.length}
                        onChange={toggleSelectAll}
                        className="h-4 w-4"
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ID Number
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Department
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {pendingRegistrations.map((registration) => (
                    <tr key={registration.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(registration.id)}
                          onChange={() => toggleSelectOne(registration.id)}
                          className="h-4 w-4"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {registration.surname} {registration.other_names}
                            </div>
                            <div className="text-sm text-gray-500">
                              {registration.user_type === 'student' ? 'Student' : 'Staff'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {registration.matric_no || registration.staff_id}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{registration.department}</div>
                        <div className="text-sm text-gray-500">{registration.faculty}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(registration.captured_at || registration.created_at || Date.now()).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button
                          onClick={() => viewIDCard(registration.id)}
                          className="text-primary-600 hover:text-primary-900"
                        >
                          View ID Card
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Stats Cards */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center">
              <div className="shrink-0">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                  </svg>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-500">Total Registrations</p>
                <p className="text-2xl font-semibold text-gray-900">
                  {pendingRegistrations.length}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center">
              <div className="shrink-0">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-500">Approved Today</p>
                <p className="text-2xl font-semibold text-gray-900">{approvedToday}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center">
              <div className="shrink-0">
                <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm text-gray-500">Avg Processing Time</p>
                <p className="text-2xl font-semibold text-gray-900">24h</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StaffDashboard;
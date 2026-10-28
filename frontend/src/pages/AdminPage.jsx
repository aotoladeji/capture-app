import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const AdminPage = () => {
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState([]);
  const [activeFile, setActiveFile] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [schedulesLoading, setSchedulesLoading] = useState(false);
  const [importingConfigId, setImportingConfigId] = useState(null);
  const [resetIdentifier, setResetIdentifier] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  useEffect(() => {
    fetchFiles();
    fetchSchedules();
  }, []);

  const fetchFiles = async () => {
    try {
      const response = await axios.get(`${import.meta.env.VITE_API_URL}/api/excel/files`);
      setFiles(response.data.files || []);
      const active = response.data.files?.find(f => f.is_active);
      setActiveFile(active);
    } catch (error) {
      console.error('Error fetching files:', error);
      setMessage('Error fetching files');
    }
  };

  const fetchSchedules = async () => {
    setSchedulesLoading(true);
    try {
      const response = await axios.get(`${import.meta.env.VITE_API_URL}/api/excel/schedules`);
      setSchedules(response.data.schedules || []);
    } catch (error) {
      console.error('Error fetching scheduling batches:', error);
    } finally {
      setSchedulesLoading(false);
    }
  };

  const importSchedule = async (configId) => {
    setImportingConfigId(configId);
    setMessage('');
    try {
      const response = await axios.post(`${import.meta.env.VITE_API_URL}/api/excel/import-schedule`, { configId });
      setMessage(`✅ ${response.data.message}`);
      fetchFiles();
      fetchSchedules();
    } catch (error) {
      setMessage(`❌ ${error.response?.data?.message || 'Import failed'}`);
    } finally {
      setImportingConfigId(null);
    }
  };

  const activateFile = async (fileId) => {
    try {
      const response = await axios.put(`${import.meta.env.VITE_API_URL}/api/excel/activate`, { fileId });
      setMessage(`✅ ${response.data.message}`);
      fetchFiles();
    } catch (error) {
      setMessage(`❌ ${error.response?.data?.message || 'Error activating file'}`);
    }
  };

  const handleDeleteFile = async (fileId, fileName) => {
      // Confirm deletion
      if (!window.confirm(`Are you sure you want to delete "${fileName}"? This action cannot be undone.`)) {
          return;
      }

      setMessage('');
      try {
          const response = await axios.delete(`${import.meta.env.VITE_API_URL}/api/excel/files`, {
          params: { fileId }
          });
          setMessage(`✅ ${response.data.message}`);
          fetchFiles();
          fetchSchedules();
      } catch (error) {
          setMessage(`❌ ${error.response?.data?.message || 'Delete failed'}`);
      }
  };

// Inside the component
const navigate = useNavigate();

const handleLogout = () => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminRole');
    navigate('/admin/login');
};

const handleResetCandidate = async () => {
  if (!resetIdentifier.trim()) {
    setMessage('❌ Enter matric number or PF number to reset.');
    return;
  }

  const confirmed = window.confirm(
    `Reset candidate ${resetIdentifier.trim()} only? This is not a general reset.`
  );
  if (!confirmed) return;

  setResetLoading(true);
  try {
    const token = localStorage.getItem('adminToken') || localStorage.getItem('staffToken');
    const response = await axios.post(
      `${import.meta.env.VITE_API_URL}/api/staff/reset-candidate`,
      { identifier: resetIdentifier.trim() },
      { headers: token ? { Authorization: `Bearer ${token}` } : {} }
    );
    setMessage(`✅ ${response.data.message}`);
    setResetIdentifier('');
  } catch (error) {
    setMessage(`❌ ${error.response?.data?.message || 'Failed to reset candidate'}`);
  } finally {
    setResetLoading(false);
  }
};


  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="mt-2 text-sm text-gray-600">
            Import student data from the scheduling app for ID card registration
          </p>
        </div>

        <div className="flex justify-between items-center mb-6">
    <h1 className="text-2xl font-bold">Admin Dashboard</h1>
    <div className="space-x-2">
        <button 
            onClick={() => navigate('/admin/change-password')}
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Template & Upload */}
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-amber-50 rounded-xl shadow-lg p-6 border border-amber-200">
              <h2 className="text-xl font-semibold text-amber-900 mb-2">Reset Single Candidate</h2>
              <p className="text-sm text-amber-800 mb-4">
                Use this when one candidate needs to redo capture. This affects only the entered candidate, not all records.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  value={resetIdentifier}
                  onChange={(e) => setResetIdentifier(e.target.value)}
                  placeholder="Enter Matric No or PF Number"
                  className="flex-1 px-3 py-2 border border-amber-300 rounded-lg"
                />
                <button
                  onClick={handleResetCandidate}
                  disabled={resetLoading}
                  className={`px-5 py-2 rounded-lg text-white font-medium ${
                    resetLoading ? 'bg-amber-300' : 'bg-amber-600 hover:bg-amber-700'
                  }`}
                >
                  {resetLoading ? 'Resetting...' : 'Reset Candidate'}
                </button>
              </div>
            </div>

            {/* Scheduling Batches Section */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-2">Import from Scheduling Setup</h2>
              <p className="text-gray-600 mb-6">
                Pick a batch of students set up in the scheduling app and import it here instead of uploading your own Excel file.
              </p>

              <div className="space-y-3">
                {schedulesLoading && (
                  <p className="text-sm text-gray-500">Loading scheduling batches...</p>
                )}

                {!schedulesLoading && schedules.length === 0 && (
                  <p className="text-sm text-gray-500">No scheduling batches found yet.</p>
                )}

                {schedules.map((schedule) => (
                  <div
                    key={schedule.id}
                    className="p-4 rounded-lg border border-gray-200 flex justify-between items-center"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">{schedule.title}</p>
                      <p className="text-xs text-gray-500">
                        {schedule.student_count} student{schedule.student_count === 1 ? '' : 's'}
                        {schedule.start_date && ` • ${schedule.start_date} to ${schedule.end_date}`}
                      </p>
                    </div>
                    <button
                      onClick={() => importSchedule(schedule.id)}
                      disabled={importingConfigId === schedule.id}
                      className={`px-4 py-2 text-sm font-medium text-white rounded-lg ${
                        importingConfigId === schedule.id
                          ? 'bg-gray-400 cursor-not-allowed'
                          : 'bg-primary-600 hover:bg-primary-700'
                      }`}
                    >
                      {importingConfigId === schedule.id
                        ? 'Importing...'
                        : schedule.already_imported
                          ? 'Re-import'
                          : 'Import & Activate'}
                    </button>
                  </div>
                ))}
              </div>

              {message && (
                <div className={`mt-4 p-4 rounded-lg ${
                  message.includes('✅') ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                }`}>
                  {message}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Files List */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">Imported Batches</h2>
              
              {activeFile && (
                <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center">
                    <div className="shrink-0">
                      <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                    </div>
                    <div className="ml-3">
                      <p className="text-sm font-medium text-blue-800">Active File</p>
                      <p className="text-sm text-blue-700 truncate">{activeFile.file_name}</p>
                      <p className="text-xs text-blue-600">
                        Uploaded: {new Date(activeFile.uploaded_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-4 max-h-96 overflow-y-auto">
                {files.map((file) => (
                    <div
                        key={file.id}
                        className={`p-4 rounded-lg border ${
                            file.is_active
                                ? 'border-green-300 bg-green-50'
                                : 'border-gray-200 hover:border-gray-300'
                        }`}
                    >
                        <div className="flex justify-between items-start">
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">
                                    {file.file_name}
                                </p>
                                <div className="mt-1 flex items-center text-xs text-gray-500">
                                    <span>
                                        {new Date(file.uploaded_at).toLocaleDateString()} • {file.total_records || 0} records
                                    </span>
                                    {file.is_active && (
                                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                                            Active
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="flex space-x-2">
                                {!file.is_active && (
                                    <button
                                        onClick={() => activateFile(file.id)}
                                        className="btn-primary px-3 py-1 text-xs font-medium text-white bg-primary-600 hover:bg-primary-700 rounded"
                                    >
                                        Activate
                                    </button>
                                )}
                                {/* 🗑️ Delete button */}
                                <button
                                    onClick={() => handleDeleteFile(file.id, file.file_name)}
                                    className="px-3 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded"
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
                
                {files.length === 0 && (
                  <div className="text-center py-8">
                    <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="mt-2 text-sm text-gray-500">No scheduling batches imported yet</p>
                  </div>
                )}
              </div>
            </div>

            {/* Stats */}
            <div className="mt-8 bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">System Status</h3>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-600">Active Data File</p>
                  <p className="text-lg font-semibold">
                    {activeFile ? activeFile.file_name : 'None'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Total Files</p>
                  <p className="text-lg font-semibold">{files.length}</p>
                </div>
                <div className="pt-4 border-t">
                  <a
                    href="/staff"
                    className="block text-center py-2 px-4 bg-gray-800 hover:bg-gray-900 text-white rounded-lg font-medium transition duration-200"
                  >
                    Go to Staff Dashboard →
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPage;
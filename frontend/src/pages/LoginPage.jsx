import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const LoginPage = () => {
  const [formData, setFormData] = useState({
    identifier: '',
    generatedCode: '',
    surname: '',
    userType: 'student'
  });

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeFile, setActiveFile] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    checkActiveFile();
  }, []);

  const checkActiveFile = async () => {
    try {
      const response = await axios.get(`${import.meta.env.VITE_API_URL}/api/excel/files`);
      const active = response.data.files?.find(f => f.is_active);
      setActiveFile(active);
    } catch (error) {
      console.error('Error checking active file:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await axios.post(`${import.meta.env.VITE_API_URL}/api/authenticate`, formData);

      if (response.data.success) {
        // Store user data in localStorage
        localStorage.setItem('userData', JSON.stringify(response.data.user));
        navigate('/capture');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-blue-50 to-indigo-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-2xl shadow-2xl">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            ID Card Registration Portal
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            University of Ibadan
          </p>
        </div>

        {activeFile && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-blue-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <span className="text-sm text-blue-700">
                Using data from: <strong>{activeFile.file_name}</strong>
              </span>
            </div>
          </div>
        )}

        {!activeFile && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-yellow-500 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span className="text-sm text-yellow-700">
                No active Excel file. Contact administrator.
              </span>
            </div>
          </div>
        )}

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                I am a:
              </label>
              <div className="flex space-x-4">
                <button
                  type="button"
                  onClick={() => setFormData({...formData, userType: 'student', surname: ''})}
                  className={`flex-1 py-2 px-4 rounded-lg font-medium ${
                    formData.userType === 'student'
                      ? 'btn-primary bg-primary-600 text-white'
                      : 'bg-gray-60 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Student
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({...formData, userType: 'staff', generatedCode: ''})}
                  className={`flex-1 py-2 px-4 rounded-lg font-medium ${
                    formData.userType === 'staff'
                      ? 'btn-primary bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Staff
                </button>
              </div>
            </div>

            {formData.userType === 'staff' && (
              <div>
                <label htmlFor="surname" className="block text-sm font-medium text-gray-700">
                  Surname
                </label>
                <input
                  id="surname"
                  name="surname"
                  type="text"
                  required={formData.userType === 'staff'}
                  value={formData.surname}
                  onChange={(e) => setFormData({...formData, surname: e.target.value})}
                  className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500 focus:z-10 sm:text-sm"
                  placeholder="Enter your surname"
                />
              </div>
            )}

            <div>
              <label htmlFor="identifier" className="block text-sm font-medium text-gray-700">
                {formData.userType === 'student' ? 'Matric Number' : 'Staff PF Number'}
              </label>
              <input
                id="identifier"
                name="identifier"
                type="text"
                required
                value={formData.identifier}
                onChange={(e) => setFormData({...formData, identifier: e.target.value})}
                className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500 focus:z-10 sm:text-sm"
                placeholder={formData.userType === 'student' ? 'Enter your matric number' : 'e.g., PF12345'}
              />
            </div>

            {formData.userType === 'student' && (
              <div>
                <label htmlFor="generatedCode" className="block text-sm font-medium text-gray-700">
                  Generated Code
                </label>
                <input
                  id="generatedCode"
                  name="generatedCode"
                  type="text"
                  required={formData.userType === 'student'}
                  value={formData.generatedCode}
                  onChange={(e) => setFormData({...formData, generatedCode: e.target.value})}
                  className="mt-1 appearance-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-lg focus:outline-none focus:ring-primary-500 focus:border-primary-500 focus:z-10 sm:text-sm"
                  placeholder="Enter the capture app login code from your email"
                />
              </div>
            )}
          </div>

          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="flex">
                <div className="shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">{error}</h3>
                </div>
              </div>
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={loading || !activeFile}
              className={`group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-lg text-white ${
                loading || !activeFile
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'btn-primary bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500'
              }`}
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Authenticating...
                </>
              ) : (
                'Proceed to Capture'
              )}
            </button>
          </div>

          <div className="text-center text-sm text-gray-500">
            <p>
              Need help? Contact the Management Information System Unit
              <br />
              <a href="mailto:ict@ui.edu.ng" className="text-primary-600 hover:text-primary-500">
                mis@ui.edu.ng
              </a>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;

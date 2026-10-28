import React from 'react';
import { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

export default function StaffLogin() {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const response = await axios.post(`${import.meta.env.VITE_API_URL}/api/admin/login`, {
                password,
                role: 'staff'
            });

            if (response.data.success) {
                localStorage.setItem('staffToken', response.data.token);
                localStorage.setItem('staffRole', response.data.role);
                navigate('/staff/dashboard');
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Login failed. Wrong password?');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
            <div className="bg-white p-8 rounded-lg shadow-md w-96">
                <h2 className="text-2xl font-bold mb-6 text-center">Staff Login</h2>
                <p className="text-sm text-gray-600 mb-4 text-center">
                    Enter the staff password
                </p>
                <form onSubmit={handleSubmit}>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Password"
                        className="w-full p-3 border border-gray-300 rounded mb-4"
                        required
                        autoFocus
                    />
                    {error && (
                        <div className="bg-red-100 text-red-700 p-3 rounded mb-4">
                            {error}
                        </div>
                    )}
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-green-600 text-white py-3 rounded hover:bg-green-700 disabled:bg-gray-400"
                    >
                        {loading ? 'Logging in...' : 'Login'}
                    </button>
                </form>
                <p className="text-xs text-gray-500 mt-4 text-center">
                    Default password: <strong>staff123</strong>
                </p>
            </div>
        </div>
    );
}
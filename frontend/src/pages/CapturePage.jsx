import React, { useState, useRef, useEffect } from 'react';
import Webcam from 'react-webcam';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import FingerprintCapture from '../components/FingerprintCapture';
import { initSegmentation, segmentAndCrop } from '../utils/segmentation';
import { captureFingerprintFromDevice, openSignatureInterface, getSignature } from '../utils/deviceAPI';

const CapturePage = () => {
  const [step, setStep] = useState(1);
  const [userData, setUserData] = useState(null);
  const [userId, setUserId] = useState(null);
  const [capturingFinger, setCapturingFinger] = useState(null);
  const [capturedData, setCapturedData] = useState({
    passport: null,
    signature: null,
    fingerprints: {
      left_Thumb: null,
      left_Index: null,
      right_Thumb: null,
      right_Index: null
    }
  });
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({
    passport: false,
    signature: false,
    fingerprints: 0
  });
  const [isCapturing, setIsCapturing] = useState(false);
  const [signatureOpened, setSignatureOpened] = useState(false);
  const [passportUploading, setPassportUploading] = useState(false);
  const [passportUploadError, setPassportUploadError] = useState('');
  const [passportBlob, setPassportBlob] = useState(null);
  const [signatureUploading, setSignatureUploading] = useState(false);
  const [signatureUploadError, setSignatureUploadError] = useState('');
  const [signatureBase64, setSignatureBase64] = useState(null);

  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const storedData = localStorage.getItem('userData');
    if (!storedData) {
      navigate('/');
      return;
    }
    setUserData(JSON.parse(storedData));
  }, [navigate]);

  useEffect(() => {
    initSegmentation();
  }, []);

  useEffect(() => {
    const createUserRecord = async () => {
      if (userData && !userId) {
        try {
          const response = await axios.post(`${import.meta.env.VITE_API_URL}/api/create-user`, {
            excelDataId: userData.id
          });
          if (response.data.success) {
            setUserId(response.data.userId);
            localStorage.setItem('captureToken', response.data.token);
          }
        } catch (error) {
          console.error('Create user record error:', error);
          alert('Error creating user record. Please try again.');
        }
      }
    };
    createUserRecord();
  }, [userData, userId]);

  const uploadSignature = async (base64Data) => {
    if (!userId) {
      setSignatureUploadError('User ID not found. Please restart the capture process.');
      return;
    }

    setSignatureUploading(true);
    setSignatureUploadError('');
    try {
      await axios.post(`${import.meta.env.VITE_API_URL}/api/capture/signature`, {
        userId,
        signatureData: base64Data
      });
      setProgress(prev => ({ ...prev, signature: true }));
      setStep(3);
    } catch (uploadErr) {
      console.error('Signature upload failed:', uploadErr);
      setSignatureUploadError('Signature upload failed. Please check your connection and retry.');
    } finally {
      setSignatureUploading(false);
    }
  };

  useEffect(() => {
    if (step === 2 && !signatureOpened) {
      const captureSig = async () => {
        try {
          // Open signature interface
          await openSignatureInterface();
          setSignatureOpened(true);

          // Wait for user to sign and confirm (this blocks until device returns)
          const signatureBase64Captured = await getSignature();

          const previewUrl = `data:image/jpeg;base64,${signatureBase64Captured}`;
          setCapturedData(prev => ({ ...prev, signature: previewUrl }));
          setSignatureBase64(signatureBase64Captured);

          await uploadSignature(signatureBase64Captured);
        } catch (error) {
          console.error('Signature capture flow error:', error);
          alert('Failed to capture signature. Please ensure the device is connected and try again.');
          // Optionally reset signatureOpened to allow retry
          setSignatureOpened(false);
        }
      };
      captureSig();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, signatureOpened, userId]); // dependencies

  useEffect(() => {
    if (step !== 2) {
      setSignatureOpened(false);
    }
  }, [step]);

  // ================== PASSPORT ==================
  const capturePassportPhoto = async () => {
    if (isCapturing) return;
    setIsCapturing(true);

    try {
      const video = webcamRef.current?.video;
      if (!video || video.readyState < 2) {
        throw new Error('Camera not ready');
      }

      const size = 256;
      const canvas = canvasRef.current;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, size, size);
      const results = await segmentAndCrop(canvas, 3000);

      if (!results.segmentationMask) {
        throw new Error('No segmentation mask returned');
      }

      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = size;
      maskCanvas.height = size;
      const maskCtx = maskCanvas.getContext('2d');
      maskCtx.drawImage(results.segmentationMask, 0, 0, size, size);
      const maskImageData = maskCtx.getImageData(0, 0, size, size);
      const maskData = maskImageData.data;

      const outputCanvas = document.createElement('canvas');
      outputCanvas.width = size;
      outputCanvas.height = size;
      const outputCtx = outputCanvas.getContext('2d');
      outputCtx.drawImage(canvas, 0, 0);
      const outputImageData = outputCtx.getImageData(0, 0, size, size);
      const outputData = outputImageData.data;

      for (let i = 0; i < maskData.length; i += 4) {
        if (maskData[i] === 0) {
          outputData[i + 3] = 0;
        }
      }
      outputCtx.putImageData(outputImageData, 0, 0);

      const blob = await new Promise(resolve => outputCanvas.toBlob(resolve, 'image/png'));

      const previewUrl = outputCanvas.toDataURL('image/png');
      setCapturedData(prev => ({ ...prev, passport: previewUrl }));
      setPassportBlob(blob);

      await uploadPassport(blob);
    } catch (error) {
      alert(`Failed to capture photo: ${error.message}`);
    } finally {
      setIsCapturing(false);
    }
  };

  const uploadPassport = async (blob) => {
    const token = localStorage.getItem('captureToken');
    if (!token) {
      setPassportUploadError('No capture token found. Please restart the capture process.');
      return;
    }

    setPassportUploading(true);
    setPassportUploadError('');
    try {
      const formData = new FormData();
      formData.append('photo', blob, 'passport.png');
      await axios.post(`${import.meta.env.VITE_API_URL}/api/capture/passport`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${token}`
        }
      });
      setProgress(prev => ({ ...prev, passport: true }));
      setStep(2);
    } catch (uploadErr) {
      console.error('Passport upload failed:', uploadErr);
      setPassportUploadError('Photo upload failed. Please check your connection and retry.');
    } finally {
      setPassportUploading(false);
    }
  };

  const retakePhoto = () => {
    setCapturedData(prev => ({ ...prev, passport: null }));
    setProgress(prev => ({ ...prev, passport: false }));
    setPassportBlob(null);
    setPassportUploadError('');
  };

  // ================== FINGERPRINTS ==================
const handleFingerprintCapture = async (fingerType) => {
  if (capturedData.fingerprints[fingerType] || capturingFinger) return;

  setCapturingFinger(fingerType);
  try {
    const fingerprintImage = await captureFingerprintFromDevice();

    setCapturedData(prev => ({
      ...prev,
      fingerprints: { ...prev.fingerprints, [fingerType]: fingerprintImage }
    }));

    const newCount = Object.values({ ...capturedData.fingerprints, [fingerType]: fingerprintImage }).filter(Boolean).length;
    setProgress(prev => ({ ...prev, fingerprints: newCount }));

    if (!userId) throw new Error('User ID not found');
    await axios.post(`${import.meta.env.VITE_API_URL}/api/capture/fingerprint`, {
      userId,
      fingerType,
      fingerprintData: fingerprintImage
    });
  } catch (error) {
    console.error('Fingerprint capture error:', error);
    alert(`Failed to capture fingerprint: ${error.message || 'Please ensure the device is connected.'}`);
  } finally {
    setCapturingFinger(null);
  }
};
  // ================== SUBMIT ==================
  const submitAllData = async () => {
    setLoading(true);
    try {
      if (!userId) throw new Error('User ID not found');
      await axios.post(`${import.meta.env.VITE_API_URL}/api/generate-idcard`, {
        userId
      });
      alert('✅ All data submitted successfully! Your ID card is being processed.');
      localStorage.removeItem('userData');
      navigate('/');
    } catch (error) {
      console.error('Submit data error:', error);
      alert('Error submitting data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!userData) {
    return <div className="text-center py-12">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900">ID Card Capture</h1>
          <p className="mt-2 text-gray-600">
            Complete your ID card registration in {4 - step + 1} steps
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* LEFT PANEL – User Info & Progress */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Your Information</h3>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-500">Name</p>
                  <p className="font-medium">{userData.surname} {userData.other_names}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">ID Number</p>
                  <p className="font-medium">{userData.matric_no || userData.pf_number}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Department</p>
                  <p className="font-medium">{userData.department}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Level</p>
                  <p className="font-medium">{userData.level || 'Not specified'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Faculty</p>
                  <p className="font-medium">{userData.faculty}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Hall of Residence</p>
                  <p className="font-medium">{userData.hall || 'Not specified'}</p>
                </div>
              </div>
            </div>

            {/* Progress */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Progress</h3>
              <div className="space-y-4">
                {[1, 2, 3, 4].map((stepNum) => (
                  <div key={stepNum} className="flex items-center">
                    <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                      step > stepNum ? 'bg-green-100' :
                      step === stepNum ? 'bg-blue-100' : 'bg-gray-100'
                    }`}>
                      {step > stepNum ? (
                        <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <span className={`font-medium ${
                          step === stepNum ? 'text-blue-600' : 'text-gray-400'
                        }`}>
                          {stepNum}
                        </span>
                      )}
                    </div>
                    <div className="ml-3">
                      <p className={`font-medium ${
                        step >= stepNum ? 'text-gray-900' : 'text-gray-400'
                      }`}>
                        {stepNum === 1 && 'Passport Photo'}
                        {stepNum === 2 && 'Signature'}
                        {stepNum === 3 && 'Fingerprints'}
                        {stepNum === 4 && 'Submit'}
                      </p>
                      <p className="text-sm text-gray-500">
                        {stepNum === 1 && 'Capture your passport photo'}
                        {stepNum === 2 && 'Provide your signature'}
                        {stepNum === 3 && 'Capture 4 fingerprints'}
                        {stepNum === 4 && 'Review and submit'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT PANEL – Capture Steps */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-lg p-6">
              {/* STEP 1: Passport Photo */}
              {step === 1 && (
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">Passport Photo</h2>
                  <p className="text-gray-600 mb-6">
                    Position your face within the silhouette. Ensure good lighting and a neutral background.
                  </p>
                  <div className="relative mx-auto webcam-container">
                    {!capturedData.passport ? (
                      <>
                        <Webcam
                          ref={webcamRef}
                          audio={false}
                          screenshotFormat="image/jpeg"
                          className="rounded-lg w-full h-full"
                          videoConstraints={{
                            width: 400,
                            height: 500,
                            facingMode: "user",
                            advanced: [{ facingMode: "user" }]
                          }}
                          onUserMedia={() => {}}
                          onUserMediaError={() => {}}
                        />
                        <div className="silhouette-overlay"></div>
                      </>
                    ) : (
                      <img
                        src={capturedData.passport}
                        alt="Captured passport"
                        className="rounded-lg w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <canvas ref={canvasRef} style={{ display: 'none' }} />
                  {passportUploadError && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                      {passportUploadError}
                    </div>
                  )}
                  <div className="mt-6 flex justify-center space-x-4">
                    {!capturedData.passport ? (
                      <button
                        onClick={capturePassportPhoto}
                        disabled={isCapturing || loading}
                        className="btn-primary px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
                      >
                        {isCapturing ? 'Processing...' : 'Capture Photo'}
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={retakePhoto}
                          disabled={passportUploading}
                          className="px-6 py-3 bg-gray-600 text-white rounded-lg font-medium hover:bg-gray-700"
                        >
                          Retake
                        </button>
                        {passportUploadError ? (
                          <button
                            onClick={() => uploadPassport(passportBlob)}
                            disabled={passportUploading}
                            className="px-6 py-3 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700"
                          >
                            {passportUploading ? 'Retrying...' : 'Retry Upload'}
                          </button>
                        ) : (
                          <button
                            disabled={!progress.passport || passportUploading}
                            onClick={() => setStep(2)}
                            className={`px-6 py-3 rounded-lg font-medium text-white ${
                              !progress.passport || passportUploading
                                ? 'bg-gray-400 cursor-not-allowed'
                                : 'bg-blue-600 hover:bg-blue-700'
                            }`}
                          >
                            {passportUploading ? 'Uploading...' : 'Continue'}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* STEP 2: Signature */}
              {step === 2 && (
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">Signature</h2>
                  <p className="text-gray-600 mb-6">
                    {signatureUploadError ? 'Signature upload failed.' : 'Please sign on the device. Waiting for your signature...'}
                  </p>
                  {signatureUploadError ? (
                    <div>
                      <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 mb-4">
                        {signatureUploadError}
                      </div>
                      <div className="flex justify-center">
                        <button
                          onClick={() => uploadSignature(signatureBase64)}
                          disabled={signatureUploading}
                          className="px-6 py-3 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700"
                        >
                          {signatureUploading ? 'Retrying...' : 'Retry Upload'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-center items-center py-8">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                    </div>
                  )}
                </div>
              )}

              {/* STEP 3: Fingerprints */}
              {step === 3 && (
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">Fingerprint Capture</h2>
                  <p className="text-gray-600 mb-6">
                    Click on each finger box to capture fingerprints. All four are required.
                  </p>
                  <div className="grid grid-cols-2 gap-6">
                    {['left_Thumb', 'left_Index', 'right_Thumb', 'right_Index'].map(finger => (
                      <FingerprintCapture
                        key={finger}
                        fingerType={finger}
                        onCapture={handleFingerprintCapture}
                        imageSrc={capturedData.fingerprints[finger]}
                        isCapturing={capturingFinger === finger}
                      />
                    ))}
                  </div>
                  <div className="mt-8 text-center">
                    <p className="text-gray-600">
                      Progress: {progress.fingerprints} of 4 fingerprints captured
                    </p>
                    {progress.fingerprints === 4 && (
                      <button
                        onClick={() => setStep(4)}
                        className="mt-4 px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
                      >
                        Continue to Review
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* STEP 4: Review & Submit */}
              {step === 4 && (
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">Review & Submit</h2>
                  <p className="text-gray-600 mb-6">
                    Review all captured data before final submission.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    {/* Passport */}
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h4 className="font-medium text-gray-700 mb-2">Passport Photo</h4>
                      {capturedData.passport && (
                        <img
                          src={capturedData.passport}
                          alt="Passport preview"
                          className="w-32 h-40 object-cover rounded mx-auto"
                        />
                      )}
                      <button
                        onClick={() => setStep(1)}
                        className="mt-2 text-sm text-blue-600 hover:text-blue-800"
                      >
                        Edit
                      </button>
                    </div>
                    {/* Signature */}
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h4 className="font-medium text-gray-700 mb-2">Signature</h4>
                      {capturedData.signature && (
                        <img
                          src={capturedData.signature}
                          alt="Signature preview"
                          className="h-20 w-full object-contain bg-white p-2 rounded"
                        />
                      )}
                      <button
                        onClick={() => setStep(2)}
                        className="mt-2 text-sm text-blue-600 hover:text-blue-800"
                      >
                        Edit
                      </button>
                    </div>
                    {/* Fingerprints Summary */}
                    <div className="md:col-span-2 bg-gray-50 p-4 rounded-lg">
                      <h4 className="font-medium text-gray-700 mb-2">Fingerprints</h4>
                      <div className="grid grid-cols-4 gap-4">
                        {Object.entries(capturedData.fingerprints).map(([key, value]) => (
                          <div key={key} className="text-center">
                            <div className={`w-16 h-16 mx-auto rounded-lg flex items-center justify-center ${
                              value ? 'bg-green-100' : 'bg-red-100'
                            }`}>
                              {value ? (
                                <svg className="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              ) : (
                                <svg className="w-8 h-8 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                              )}
                            </div>
                            <p className="text-sm mt-1 capitalize">{key.replace(/([A-Z])/g, ' $1')}</p>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => setStep(3)}
                        className="mt-4 text-sm text-blue-600 hover:text-blue-800"
                      >
                        Edit Fingerprints
                      </button>
                    </div>
                  </div>
                  {/* Terms */}
                  <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <div className="flex">
                      <div className="shrink-0">
                        <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-yellow-800">Important Notice</h3>
                        <div className="mt-2 text-sm text-yellow-700">
                          <p>
                            By submitting, you confirm that all information provided is accurate and
                            you consent to the use of your biometric data for identification purposes.
                            Your ID card will be processed and available for collection within 3-5 working days.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* Submit Button */}
                  <div className="text-center">
                    <button
                      onClick={submitAllData}
                      disabled={loading || progress.fingerprints < 4 || !progress.passport || !progress.signature}
                      className={`px-8 py-3 rounded-lg font-medium text-white ${
                        loading || progress.fingerprints < 4 || !progress.passport || !progress.signature
                          ? 'bg-gray-400 cursor-not-allowed'
                          : 'bg-blue-600 hover:bg-blue-700'
                      }`}
                    >
                      {loading ? (
                        <span className="flex items-center justify-center">
                          <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Processing...
                        </span>
                      ) : (
                        'Submit All Data'
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CapturePage;
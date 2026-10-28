// import axios from 'axios';

// const DEVICE_URL = 'http://127.0.0.1:28815/';
// const TIMEOUT = 30000;

// export const sendDeviceCommand = async (command) => {
//   try {
//     const jsonString = JSON.stringify(command);
//     const base64Data = btoa(jsonString);
//     const response = await axios.post(DEVICE_URL, base64Data, {
//       headers: { 'Content-Type': 'text/plain' },
//       timeout: TIMEOUT,
//     });
//     return response.data;
//   } catch (error) {
//     console.error('❌ Device communication error:', error);
//     throw error;
//   }
// };

// export const captureFingerprintFromDevice = async () => {
//   const result = await sendDeviceCommand({ action: '14' });
//   if (result.result === '02') {
//     throw new Error('Fingerprint device error (unplugged?)');
//   }
//   if (!result.FigPicBase64) {
//     throw new Error('No fingerprint image received');
//   }
//   return result.FigPicBase64;
// };

// export const captureSignatureFromDevice = async () => {
//   // Open English signature interface
//   await sendDeviceCommand({ action: '05' });
//   // Wait for user to sign and confirm
//   const confirmResult = await sendDeviceCommand({ action: '07' });
//   if (!confirmResult.SigPicBase64) {
//     throw new Error('No signature image received');
//   }
//   return confirmResult.SigPicBase64;
// };


import axios from 'axios';

const DEVICE_URL = 'http://127.0.0.1:28815/';
const TIMEOUT = 30000;

export const sendDeviceCommand = async (command) => {
  try {
    const jsonString = JSON.stringify(command);
    const base64Data = btoa(jsonString);
    const response = await axios.post(DEVICE_URL, base64Data, {
      headers: { 'Content-Type': 'text/plain' },
      timeout: TIMEOUT,
    });
    return response.data;
  } catch (error) {
    console.error('❌ Device communication error:', error);
    throw error;
  }
};

export const openSignatureInterface = async () => {
  await sendDeviceCommand({ action: '05' });
};

export const getSignature = async () => {
  const result = await sendDeviceCommand({ action: '07' });
  if (!result.SigPicBase64) {
    throw new Error('No signature image received');
  }
  return result.SigPicBase64;
};

export const captureFingerprintFromDevice = async () => {
  const result = await sendDeviceCommand({ action: '14' });
  if (result.result === '02') {
    throw new Error('Fingerprint device error (unplugged?)');
  }
  if (!result.FigPicBase64) {
    throw new Error('No fingerprint image received');
  }
  return result.FigPicBase64;
};
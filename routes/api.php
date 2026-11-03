<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CaptureController;
use App\Http\Controllers\Api\CardImageController;
use App\Http\Controllers\Api\ExcelController;
use App\Http\Controllers\Api\HealthController;
use App\Http\Controllers\Api\IdCardController;
use App\Http\Controllers\Api\PrintingController;
use App\Http\Controllers\Api\StaffController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
| Converted from server/app.js + server/routes/api.js. All routes here are
| automatically prefixed with /api (see bootstrap/app.php), matching how
| the frontend and the id-card-unit management app both always call this
| service with an explicit /api/... path.
*/

// Health checks (server/app.js)
Route::get('/health', [HealthController::class, 'health']);

// Excel routes (server/routes/api.js) — data now comes only from the id-card-unit
// management app's scheduling setup, imported via /excel/import-schedule below.
Route::get('/excel/files', [ExcelController::class, 'files']);
Route::put('/excel/activate/{fileId}', [ExcelController::class, 'activate']);
Route::delete('/excel/files/{fileId}', [ExcelController::class, 'delete']);
// Fallbacks for environments where nested dynamic segments under /excel can misroute
// (kept for parity with the original app; fileId comes from the request body/query instead).
Route::put('/excel/activate', [ExcelController::class, 'activate']);
Route::delete('/excel/files', [ExcelController::class, 'delete']);
Route::get('/excel/schedules', [ExcelController::class, 'schedules']);
Route::post('/excel/import-schedule', [ExcelController::class, 'importSchedule']);

// Authentication (student/staff self-service login during capture)
Route::post('/authenticate', [ExcelController::class, 'authenticate']);

// User creation (after login)
Route::post('/create-user', [CaptureController::class, 'createUser']);

// Capture routes
Route::post('/capture/signature', [CaptureController::class, 'saveSignature']);
Route::post('/capture/fingerprint', [CaptureController::class, 'saveFingerprint']);
Route::post('/capture/passport', [CaptureController::class, 'savePassportPhoto']);
Route::post('/generate-idcard', [CaptureController::class, 'generateIdCardForUser']);

// External verification endpoints (protected by API key — see VERIFY_API_KEY)
Route::post('/verify/fingerprint', [CaptureController::class, 'verifyFingerprint'])->middleware('auth.apikey');
Route::get('/verify/fingerprint/templates/{userId}', [CaptureController::class, 'getFingerprintTemplates'])->middleware('auth.apikey');

// Admin/staff auth
Route::post('/admin/login', [AuthController::class, 'login']);
Route::post('/admin/change-password', [AuthController::class, 'changePassword'])->middleware('auth.jwt');

// Staff dashboard
Route::get('/staff/pending', [StaffController::class, 'pending']);
Route::post('/staff/approve/{userId}', [StaffController::class, 'approve']);
Route::post('/staff/approve-bulk', [StaffController::class, 'bulkApprove']);
Route::post('/staff/reject/{userId}', [StaffController::class, 'reject']);
Route::post('/staff/reset-candidate', [StaffController::class, 'resetCandidate'])->middleware('auth.jwt:admin,staff');
Route::get('/staff/approved-today', [StaffController::class, 'approvedToday']);

// Printing data (single user)
Route::get('/printing/data/{userId}', [PrintingController::class, 'data']);

// ID card image serving
Route::get('/idcard/{userId}', [IdCardController::class, 'show'])->where('userId', '[0-9]+');
Route::get('/idcard/preview/{userId}', [IdCardController::class, 'preview']);
Route::get('/idcard/preview-print/{userId}', [IdCardController::class, 'previewPrint']);

// Integration routes for the management system (id-card-unit backend's CaptureAppService)
Route::get('/printing/queue', [PrintingController::class, 'queue']);
Route::get('/printing/approved', [PrintingController::class, 'approved']);
Route::post('/printing/mark-printed/{userId}', [PrintingController::class, 'markPrinted']);
Route::post('/printing/mark-collected/{userId}', [PrintingController::class, 'markCollected']);
Route::get('/printing/output', [PrintingController::class, 'output']);
Route::get('/printing/output-svg', [PrintingController::class, 'outputSvg']);
Route::get('/printing/output-image', [PrintingController::class, 'outputImage']);
Route::get('/printing/output/{cardId}', [PrintingController::class, 'outputByCardId']);
Route::get('/printing/fingerprint', [PrintingController::class, 'fingerprint']);

// Card image (matches endpoint expected by the id-card-unit app)
Route::get('/card-images/{cardId}/image', [CardImageController::class, 'image']);

<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CaptureController extends Controller
{
    // POST /api/create-user
    public function createUser(Request $request)
    {
        $excelDataId = $request->input('excelDataId');

        if (! $excelDataId) {
            return response()->json(['success' => false, 'message' => 'excelDataId is required'], 400);
        }

        $excelRow = DB::table('excel_data')
            ->select('surname', 'other_names', 'matric_no', 'pf_number', 'jamb_reg_no', 'pg_number', 'department', 'faculty', 'level', 'marital_status', 'birth_date', 'hall')
            ->where('id', $excelDataId)
            ->first();

        if (! $excelRow) {
            return response()->json(['success' => false, 'message' => 'Excel data not found'], 404);
        }

        $existing = DB::table('id_card_users')->where('excel_data_id', $excelDataId)->first();

        if ($existing) {
            $token = $this->signToken(['userId' => $existing->id]);

            return response()->json(['success' => true, 'userId' => $existing->id, 'token' => $token, 'message' => 'User already exists']);
        }

        $isStudent = (bool) ($excelRow->matric_no || $excelRow->jamb_reg_no || $excelRow->pg_number);
        $userType = $isStudent ? 'student' : ($excelRow->pf_number ? 'staff' : null);

        $userId = DB::table('id_card_users')->insertGetId([
            'excel_data_id' => $excelDataId,
            'user_type' => $userType,
            'surname' => $excelRow->surname,
            'other_names' => $excelRow->other_names,
            'matric_no' => $excelRow->matric_no,
            'staff_id' => $excelRow->pf_number,
            'jamb_reg_no' => $excelRow->jamb_reg_no,
            'pg_number' => $excelRow->pg_number,
            'birth_date' => $excelRow->birth_date,
            'department' => $excelRow->department,
            'faculty' => $excelRow->faculty,
            'level' => $excelRow->level,
            'marital_status' => $excelRow->marital_status,
            'hall' => $excelRow->hall,
            'status' => 'created',
            'created_at' => now(),
        ]);

        $token = $this->signToken(['userId' => $userId]);

        return response()->json(['success' => true, 'message' => 'User created', 'userId' => $userId, 'token' => $token]);
    }

    // POST /api/capture/passport  (multipart: photo)
    public function savePassportPhoto(Request $request)
    {
        $userId = $this->userIdFromBearerToken($request);
        if ($userId === null) {
            return response()->json(['message' => 'Unauthorized'], 401);
        }

        if (! $request->hasFile('photo')) {
            return response()->json(['success' => false, 'message' => 'No image uploaded'], 400);
        }

        $photo = $request->file('photo');
        $allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
        if (! in_array($photo->getMimeType(), $allowedMimes, true)) {
            return response()->json(['success' => false, 'message' => 'File upload error: Only image files are allowed'], 400);
        }

        $imageBinary = file_get_contents($photo->getRealPath());

        DB::table('id_card_users')->where('id', $userId)->update(['passport_photo' => $imageBinary]);

        return response()->json(['success' => true, 'message' => 'Passport photo saved']);
    }

    // POST /api/capture/signature
    public function saveSignature(Request $request)
    {
        $userId = $request->input('userId');
        $signatureData = $request->input('signatureData');

        if (! $userId || ! $signatureData) {
            return response()->json(['success' => false, 'message' => 'Missing userId or signatureData'], 400);
        }

        $base64 = preg_replace('/^data:image\/\w+;base64,/', '', $signatureData);
        $binary = base64_decode($base64);

        DB::table('id_card_users')->where('id', $userId)->update(['signature' => $binary]);

        return response()->json(['success' => true, 'message' => 'Signature saved']);
    }

    // POST /api/capture/fingerprint
    public function saveFingerprint(Request $request)
    {
        $userId = $request->input('userId');
        $fingerType = $request->input('fingerType');
        $fingerprintData = $request->input('fingerprintData');

        if (! $userId || ! $fingerType || ! $fingerprintData) {
            return response()->json([
                'success' => false,
                'message' => 'Missing required fields',
                'received' => ['userId' => $userId, 'fingerType' => $fingerType, 'fingerprintDataProvided' => (bool) $fingerprintData],
            ], 400);
        }

        $userExists = DB::table('id_card_users')->where('id', $userId)->exists();
        if (! $userExists) {
            DB::statement('INSERT IGNORE INTO id_card_users (id, status, created_at) VALUES (?, ?, ?)', [$userId, 'created', now()]);
        }

        $column = $this->mapFingerType($fingerType);
        if (! $column) {
            return response()->json(['success' => false, 'message' => 'Could not determine finger type', 'received' => $fingerType], 400);
        }

        $existing = DB::table('fingerprints')->where('user_id', $userId)->first();

        if (! $existing) {
            DB::table('fingerprints')->insert([
                'user_id' => $userId,
                $column => $fingerprintData,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        } else {
            DB::table('fingerprints')->where('user_id', $userId)->update([
                $column => $fingerprintData,
                'updated_at' => now(),
            ]);
        }

        return response()->json(['success' => true, 'message' => 'Fingerprint saved']);
    }

    // POST /api/generate-idcard
    public function generateIdCardForUser(Request $request)
    {
        $userId = $request->input('userId');

        DB::table('id_card_users')->where('id', $userId)->update(['status' => 'pending_approval']);
        DB::table('staff_notifications')->insert(['user_id' => $userId, 'status' => 'pending', 'created_at' => now()]);

        return response()->json(['success' => true, 'message' => 'ID card ready for approval']);
    }

    // POST /api/verify/fingerprint  (protected by auth.apikey)
    public function verifyFingerprint(Request $request)
    {
        $fingerprintData = $request->input('fingerprintData');
        $fingerType = $request->input('fingerType');

        if (! $fingerprintData) {
            return response()->json(['success' => false, 'message' => 'fingerprintData is required'], 400);
        }

        $allowed = ['left_thumb', 'left_index', 'right_thumb', 'right_index'];
        $columns = $allowed;

        if ($fingerType) {
            $col = $this->mapFingerType($fingerType);
            if ($col) {
                $columns = [$col];
            }
        }

        $row = DB::table('fingerprints as f')
            ->join('id_card_users as u', 'f.user_id', '=', 'u.id')
            ->where(function ($q) use ($columns, $fingerprintData) {
                foreach ($columns as $col) {
                    $q->orWhere("f.{$col}", $fingerprintData);
                }
            })
            ->select('u.id', 'u.surname', 'u.other_names', 'u.matric_no', 'u.staff_id', 'u.department', 'u.faculty', 'u.user_type', 'u.status')
            ->first();

        if (! $row) {
            return response()->json(['success' => true, 'match' => false, 'message' => 'No matching fingerprint found']);
        }

        return response()->json([
            'success' => true,
            'match' => true,
            'user' => [
                'id' => $row->id,
                'name' => "{$row->surname} {$row->other_names}",
                'identifier' => $row->matric_no ?: $row->staff_id,
                'department' => $row->department,
                'faculty' => $row->faculty,
                'userType' => $row->user_type,
                'status' => $row->status,
            ],
        ]);
    }

    // GET /api/verify/fingerprint/templates/{userId}  (protected by auth.apikey)
    public function getFingerprintTemplates(int $userId)
    {
        $row = DB::table('fingerprints as f')
            ->join('id_card_users as u', 'f.user_id', '=', 'u.id')
            ->where('f.user_id', $userId)
            ->select('f.left_thumb', 'f.left_index', 'f.right_thumb', 'f.right_index', 'u.id', 'u.surname', 'u.other_names', 'u.matric_no', 'u.staff_id', 'u.department', 'u.faculty', 'u.user_type')
            ->first();

        if (! $row) {
            return response()->json(['success' => false, 'message' => 'No fingerprints found for this user'], 404);
        }

        return response()->json([
            'success' => true,
            'user' => [
                'id' => $row->id,
                'name' => "{$row->surname} {$row->other_names}",
                'identifier' => $row->matric_no ?: $row->staff_id,
                'department' => $row->department,
                'faculty' => $row->faculty,
                'userType' => $row->user_type,
            ],
            'templates' => [
                'leftThumb' => $row->left_thumb,
                'leftIndex' => $row->left_index,
                'rightThumb' => $row->right_thumb,
                'rightIndex' => $row->right_index,
            ],
        ]);
    }

    private function mapFingerType(string $fingerType): ?string
    {
        $lower = strtolower($fingerType);

        if (str_contains($lower, 'left') && str_contains($lower, 'thumb')) {
            return 'left_thumb';
        }
        if (str_contains($lower, 'left') && str_contains($lower, 'index')) {
            return 'left_index';
        }
        if (str_contains($lower, 'right') && str_contains($lower, 'thumb')) {
            return 'right_thumb';
        }
        if (str_contains($lower, 'right') && str_contains($lower, 'index')) {
            return 'right_index';
        }

        return null;
    }

    private function signToken(array $claims): string
    {
        return JWT::encode(array_merge($claims, [
            'iat' => time(),
            'exp' => time() + 3600,
        ]), config('app.jwt_secret'), 'HS256');
    }

    private function userIdFromBearerToken(Request $request): ?int
    {
        $header = $request->header('Authorization', '');
        if (! $header || ! str_contains($header, ' ')) {
            return null;
        }
        $token = explode(' ', $header, 2)[1];

        try {
            $decoded = (array) JWT::decode($token, new Key(config('app.jwt_secret'), 'HS256'));

            return isset($decoded['userId']) ? (int) $decoded['userId'] : null;
        } catch (\Throwable $e) {
            return null;
        }
    }
}

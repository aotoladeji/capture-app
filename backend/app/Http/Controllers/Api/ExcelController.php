<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\ExcelProcessorService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ExcelController extends Controller
{
    public function __construct(private ExcelProcessorService $processor) {}

    // GET /api/excel/schedules — scheduling batches from the id-card-unit management app's
    // "scheduling setup" (its scheduling_config + scheduled_students tables), pickable here
    // instead of a manual upload.
    public function schedules()
    {
        $configs = DB::table('scheduling_config')->orderByDesc('id')->get();

        $counts = DB::table('scheduled_students')
            ->select('config_id', DB::raw('COUNT(*) as student_count'))
            ->groupBy('config_id')
            ->pluck('student_count', 'config_id');

        $importedConfigIds = DB::table('excel_files')
            ->whereNotNull('source_config_id')
            ->pluck('source_config_id')
            ->unique();

        $schedules = $configs->map(fn ($config) => [
            'id' => $config->id,
            'title' => $config->title,
            'description' => $config->description,
            'start_date' => $config->start_date,
            'end_date' => $config->end_date,
            'student_count' => (int) ($counts[$config->id] ?? 0),
            'already_imported' => $importedConfigIds->contains($config->id),
        ])->values();

        return response()->json(['success' => true, 'schedules' => $schedules]);
    }

    // POST /api/excel/import-schedule
    public function importSchedule(Request $request)
    {
        $configId = $request->input('configId');

        if (! $configId) {
            return response()->json(['success' => false, 'message' => 'configId is required'], 400);
        }

        try {
            $result = $this->processor->importFromSchedule((int) $configId);

            return response()->json([
                'success' => true,
                'message' => "Scheduling batch imported successfully. {$result['recordCount']} records imported.",
                'data' => $result,
            ]);
        } catch (\Throwable $e) {
            report($e);

            return response()->json(['success' => false, 'message' => $e->getMessage() ?: 'Error importing scheduling batch'], 500);
        }
    }

    // POST /api/authenticate
    public function authenticate(Request $request)
    {
        $surname = $request->input('surname');
        $identifier = $request->input('identifier');
        $userType = $request->input('userType');
        $generatedCode = $request->input('generatedCode');

        if (! $identifier || ! $userType) {
            return response()->json(['success' => false, 'message' => 'All fields are required'], 400);
        }

        if ($userType === 'student' && ! $generatedCode) {
            return response()->json(['success' => false, 'message' => 'Generated code is required for student login'], 400);
        }

        if ($userType === 'staff' && ! $surname) {
            return response()->json(['success' => false, 'message' => 'Surname is required for staff login'], 400);
        }

        try {
            $userData = $this->processor->searchUser(
                trim($identifier),
                $userType,
                trim($surname ?? ''),
                trim($generatedCode ?? '')
            );

            if (! $userData) {
                return response()->json(['success' => false, 'message' => 'User not found in database. Please check your details.'], 404);
            }

            return response()->json(['success' => true, 'message' => 'Authentication successful', 'user' => $userData]);
        } catch (\Throwable $e) {
            $status = str_contains($e->getMessage(), 'already completed') ? 409 : 500;

            return response()->json(['success' => false, 'message' => $e->getMessage() ?: 'Authentication failed'], $status);
        }
    }

    // GET /api/excel/files
    public function files()
    {
        $this->processor->ensureActiveScheduleSynced();

        $files = DB::table('excel_files')->orderByDesc('uploaded_at')->get();

        return response()->json(['success' => true, 'files' => $files]);
    }

    // PUT /api/excel/activate/{fileId}  and  PUT /api/excel/activate (fileId in body/query)
    public function activate(Request $request, ?int $fileId = null)
    {
        $fileId = $fileId ?? $request->input('fileId') ?? $request->query('fileId');

        if (! $fileId) {
            return response()->json(['success' => false, 'message' => 'fileId is required'], 400);
        }

        return DB::transaction(function () use ($fileId) {
            $exists = DB::table('excel_files')->where('id', $fileId)->exists();
            if (! $exists) {
                return response()->json(['success' => false, 'message' => 'File not found'], 404);
            }

            DB::table('excel_files')->update(['is_active' => false]);
            DB::table('excel_files')->where('id', $fileId)->update(['is_active' => true]);

            return response()->json(['success' => true, 'message' => 'Excel file activated successfully']);
        });
    }

    // DELETE /api/excel/files/{fileId}  and  DELETE /api/excel/files (fileId in body/query)
    public function delete(Request $request, ?int $fileId = null)
    {
        $fileId = $fileId ?? $request->input('fileId') ?? $request->query('fileId');

        if (! $fileId) {
            return response()->json(['success' => false, 'message' => 'fileId is required'], 400);
        }

        $file = DB::table('excel_files')->where('id', $fileId)->first();

        if (! $file) {
            return response()->json(['success' => false, 'message' => 'File not found'], 404);
        }

        DB::transaction(function () use ($fileId) {
            $excelDataIds = DB::table('excel_data')->where('file_id', $fileId)->pluck('id');

            if ($excelDataIds->isNotEmpty()) {
                DB::table('id_card_users')->whereIn('excel_data_id', $excelDataIds)->delete();
            }

            DB::table('excel_data')->where('file_id', $fileId)->delete();
            DB::table('excel_files')->where('id', $fileId)->delete();
        });

        if ($file->file_path && file_exists($file->file_path)) {
            @unlink($file->file_path);
        }

        return response()->json(['success' => true, 'message' => 'File deleted successfully']);
    }
}

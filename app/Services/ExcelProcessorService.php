<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

/**
 * Faithful port of server/utils/excelProcessor.js, minus the manual-upload
 * parsing path — this app now only imports from the id-card-unit management
 * app's `scheduling_config`/`scheduled_students` tables (see importFromSchedule()).
 */
class ExcelProcessorService
{
    /**
     * Imports the `scheduled_students` rows the id-card-unit management app
     * created for a given `scheduling_config` (its "scheduling setup" excel
     * upload), instead of requiring a separate manual upload here.
     *
     * @throws \RuntimeException if the batch doesn't exist or has no students
     */
    public function importFromSchedule(int $configId): array
    {
        $config = DB::table('scheduling_config')->where('id', $configId)->first();

        if (! $config) {
            throw new \RuntimeException('Scheduling batch not found');
        }

        $students = DB::table('scheduled_students')->where('config_id', $configId)->get();

        if ($students->isEmpty()) {
            throw new \RuntimeException('This scheduling batch has no students to import');
        }

        $normalizedData = $students->map(fn ($student) => $this->mapScheduledStudent($student, $config))->all();
        $fileId = $this->saveToDatabase($normalizedData, $config->title, null, $configId);

        return [
            'success' => true,
            'fileId' => $fileId,
            'recordCount' => count($normalizedData),
            'sampleData' => array_slice($normalizedData, 0, 3),
        ];
    }

    private function mapScheduledStudent(object $student, object $config): array
    {
        // Columns the management app doesn't store as first-class fields (hall,
        // session, card_no, ...) are packed into the `extra_fields` JSON blob,
        // so read them from there as well as from any dedicated columns.
        $extra = [];
        if (! empty($student->extra_fields)) {
            $decoded = json_decode((string) $student->extra_fields, true);
            if (is_array($decoded)) {
                $extra = $decoded;
            }
        }

        $pick = function (array $keys, $columnValue = null) use ($extra) {
            if ($columnValue !== null && $columnValue !== '') {
                return $columnValue;
            }
            foreach ($keys as $key) {
                if (isset($extra[$key]) && $extra[$key] !== '') {
                    return $extra[$key];
                }
            }

            return null;
        };

        $fullName = trim((string) ($student->full_name ?? ''));
        $parts = preg_split('/\s+/', $fullName, 2);
        $surname = $pick(['surname'], $student->surname ?? null) ?? ($parts[0] ?? '');
        $otherNames = $pick(['other_names', 'otherNames'], $student->other_names ?? null) ?? ($parts[1] ?? '');

        $hall = $pick(['hall', 'hall_of_residence', 'residence', 'hostel'], $student->hall ?? null);

        return [
            'surname' => $surname,
            'other_names' => $otherNames,
            'matric_no' => $pick(['matric_number', 'matric_no'], $student->matric_number ?? null),
            'pf_number' => $pick(['pf_number', 'staff_id'], null),
            'jamb_reg_no' => $pick(['jamb_number', 'jamb_reg_no'], $student->jamb_number ?? null),
            'pg_number' => $pick(['pg_reg_number', 'pg_number'], $student->pg_reg_number ?? null),
            'birth_date' => $pick(['birth_date', 'dob'], null),
            'department' => $pick(['department'], $student->department ?? null),
            'faculty' => $pick(['faculty'], $student->faculty ?? null),
            'level' => $pick(['level'], $student->level ?? null),
            'marital_status' => $pick(['marital_status'], null),
            'hall' => $hall,
            'session' => $pick(['session'], null) ?? $this->deriveSessionLabel($config),
            'card_number' => $pick(['card_no', 'card_number'], null),
        ];
    }

    /**
     * `scheduled_students`/`scheduling_config` have no "session" concept of their own,
     * so approximate the academic session (e.g. "2026/2027") from the batch's start date.
     */
    private function deriveSessionLabel(object $config): ?string
    {
        if (empty($config->start_date)) {
            return null;
        }

        $startYear = (int) date('Y', strtotime($config->start_date));

        return "{$startYear}/".($startYear + 1);
    }

    private function saveToDatabase(array $data, string $fileName, ?string $filePath, ?int $sourceConfigId = null): int
    {
        return DB::transaction(function () use ($data, $fileName, $filePath, $sourceConfigId) {
            $fileId = DB::table('excel_files')->insertGetId([
                'file_name' => $fileName,
                'file_path' => $filePath,
                'source_config_id' => $sourceConfigId,
                'total_records' => count($data),
                'uploaded_at' => now(),
            ]);

            foreach ($data as $row) {
                DB::table('excel_data')->insert([
                    'file_id' => $fileId,
                    'surname' => $row['surname'] ?? null,
                    'other_names' => $row['other_names'] ?? null,
                    'matric_no' => $row['matric_no'] ?? null,
                    'pf_number' => $row['pf_number'] ?? null,
                    'jamb_reg_no' => $row['jamb_reg_no'] ?? null,
                    'pg_number' => $row['pg_number'] ?? null,
                    'birth_date' => $row['birth_date'] ?? null,
                    'department' => $row['department'] ?? null,
                    'faculty' => $row['faculty'] ?? null,
                    'level' => $row['level'] ?? null,
                    'marital_status' => $row['marital_status'] ?? null,
                    'hall' => $row['hall'] ?? null,
                    'session' => $row['session'] ?? null,
                    'card_number' => $row['card_number'] ?? null,
                    'raw_data' => json_encode($row),
                    'created_at' => now(),
                ]);
            }

            DB::table('excel_files')->where('id', '!=', $fileId)->update(['is_active' => false]);

            return $fileId;
        });
    }

    /**
     * Faithful port of ExcelProcessor.searchUser(). The student path
     * validates the login code either against the management app's
     * `scheduled_students` table (capture_login_code / login_code), or
     * (fallback) against any "generated/access/auth/login code/pin/token"
     * -like key found in the row's raw Excel data — done in PHP rather
     * than a raw jsonb query, since that pattern search is awkward in
     * portable SQL across MySQL/Postgres.
     *
     * @throws \RuntimeException with message 'User already completed registration'
     */
    public function searchUser(string $identifier, string $userType, string $surname, string $generatedCode): ?array
    {
        $identifier = trim($identifier);
        $surname = trim($surname);
        $generatedCode = trim($generatedCode);

        $this->ensureActiveScheduleSynced();

        if ($userType === 'student') {
            $row = DB::table('excel_data as ed')
                ->join('excel_files as ef', 'ed.file_id', '=', 'ef.id')
                ->where('ef.is_active', true)
                ->whereRaw('LOWER(TRIM(COALESCE(ed.matric_no, \'\'))) = LOWER(TRIM(?))', [$identifier])
                ->select('ed.*')
                ->first();

            if (! $row) {
                return null;
            }

            $codeValid = false;
            try {
                $codeValid = DB::table('scheduled_students')
                    ->whereRaw('LOWER(TRIM(COALESCE(matric_number, \'\'))) = LOWER(TRIM(?))', [$identifier])
                    ->where(function ($q) use ($generatedCode) {
                        $q->whereRaw('LOWER(TRIM(COALESCE(capture_login_code, \'\'))) = LOWER(TRIM(?))', [$generatedCode])
                            ->orWhereRaw('LOWER(TRIM(COALESCE(login_code, \'\'))) = LOWER(TRIM(?))', [$generatedCode]);
                    })
                    ->exists();
            } catch (\Throwable $e) {
                // The `scheduled_students` table belongs to the id-card-unit
                // management app's schema. If that app hasn't been deployed
                // yet (table doesn't exist), fall through to the raw-data
                // code check below instead of failing the whole request.
                report($e);
            }

            if (! $codeValid) {
                $codeValid = $this->matchesGeneratedCodeInRawData($row, $generatedCode);
            }

            if (! $codeValid) {
                return null;
            }
        } else {
            // staff
            $row = DB::table('excel_data as ed')
                ->join('excel_files as ef', 'ed.file_id', '=', 'ef.id')
                ->where('ef.is_active', true)
                ->whereRaw('LOWER(ed.surname) = LOWER(?)', [$surname])
                ->where('ed.pf_number', $identifier)
                ->select('ed.*')
                ->first();

            if (! $row) {
                return null;
            }
        }

        $existingUser = DB::table('id_card_users')
            ->where(function ($q) use ($row) {
                $q->where('matric_no', $row->matric_no)->orWhere('staff_id', $row->pf_number);
            })
            ->whereRaw('LOWER(surname) = LOWER(?)', [$row->surname])
            ->exists();

        if ($existingUser) {
            throw new \RuntimeException('User already completed registration');
        }

        $userData = (array) $row;
        $userData['user_type'] = $userType;

        return $userData;
    }

    /**
     * Live-sync guard: whenever the management app points `scheduling_config`
     * at a different (or updated) batch than what's currently active here,
     * transparently re-import it before searching — so logins never see a
     * stale snapshot, with no manual "Re-import" click required.
     */
    public function ensureActiveScheduleSynced(): void
    {
        $liveConfig = DB::table('scheduling_config')
            ->where('is_active', true)
            ->orderByDesc('id')
            ->first();

        if (! $liveConfig) {
            return;
        }

        $liveStats = DB::table('scheduled_students')
            ->where('config_id', $liveConfig->id)
            ->selectRaw('COUNT(*) as cnt, MAX(updated_at) as last_updated')
            ->first();

        if (! $liveStats || (int) $liveStats->cnt === 0) {
            return;
        }

        $activeFile = DB::table('excel_files')->where('is_active', true)->first();

        $needsSync = ! $activeFile
            || (int) $activeFile->source_config_id !== (int) $liveConfig->id
            || (int) $activeFile->total_records !== (int) $liveStats->cnt
            || ($liveStats->last_updated && strtotime($liveStats->last_updated) > strtotime($activeFile->uploaded_at));

        if ($needsSync) {
            try {
                $this->importFromSchedule($liveConfig->id);
            } catch (\Throwable $e) {
                report($e);
                // leave whatever was already active in place rather than failing the login
            }
        }
    }

    private function matchesGeneratedCodeInRawData(object $row, string $generatedCode): bool
    {
        if ($generatedCode === '') {
            return false;
        }

        $pattern = '/(generated|access|auth|login).*(code|pin|token)|(code|pin|token).*(generated|access|auth|login)/i';
        $target = strtolower($generatedCode);

        $rawData = is_string($row->raw_data ?? null) ? (json_decode($row->raw_data, true) ?: []) : [];

        foreach ($rawData as $key => $value) {
            if (preg_match($pattern, (string) $key) && strtolower(trim((string) $value)) === $target) {
                return true;
            }
        }

        return false;
    }
}

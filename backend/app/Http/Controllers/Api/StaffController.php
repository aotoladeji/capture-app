<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\IdCardGeneratorService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class StaffController extends Controller
{
    public function __construct(private IdCardGeneratorService $cardGenerator) {}

    // GET /api/staff/pending
    public function pending()
    {
        // Emulates "SELECT DISTINCT ON (u.id) ... ORDER BY u.id, sn.created_at DESC"
        // by pulling each user's most recent notification in PHP.
        $rows = DB::table('id_card_users as u')
            ->leftJoin('staff_notifications as sn', 'u.id', '=', 'sn.user_id')
            ->where('u.status', 'pending_approval')
            ->select('u.id', 'u.surname', 'u.other_names', 'u.user_type', 'u.matric_no', 'u.staff_id', 'u.department', 'u.faculty', 'u.status', 'u.created_at as captured_at', 'sn.status as notification_status', 'sn.created_at as notification_created_at')
            ->orderByDesc('sn.created_at')
            ->get()
            ->unique('id')
            ->values()
            ->map(function ($row) {
                unset($row->notification_created_at);

                return $row;
            });

        return response()->json(['success' => true, 'pending' => $rows]);
    }

    // POST /api/staff/approve/{userId}
    public function approve(int $userId)
    {
        $user = DB::table('id_card_users as u')
            ->leftJoin('excel_data as ed', 'u.excel_data_id', '=', 'ed.id')
            ->select('u.*', 'ed.card_number', 'ed.session')
            ->where('u.id', $userId)
            ->first();

        if (! $user) {
            return response()->json(['success' => false, 'message' => 'User not found'], 404);
        }

        // Decode binary blobs for the generator (DB::table returns raw binary already for BLOB columns).
        $idCardBuffer = null;
        try {
            $idCardBuffer = $this->cardGenerator->generatePng($user, false);
        } catch (\Throwable $e) {
            report($e);
            // proceed — still mark approved but without image, matching the original
        }

        if ($idCardBuffer) {
            DB::table('id_card_users')->where('id', $userId)->update([
                'status' => 'approved',
                'approved_at' => now(),
                'id_card_image' => $idCardBuffer,
            ]);
        } else {
            DB::table('id_card_users')->where('id', $userId)->update([
                'status' => 'approved',
                'approved_at' => now(),
            ]);
        }

        return response()->json(['success' => true, 'message' => 'Registration approved']);
    }

    // POST /api/staff/reject/{userId}
    public function reject(int $userId)
    {
        DB::table('id_card_users')->where('id', $userId)->update(['status' => 'rejected']);

        return response()->json(['success' => true, 'message' => 'Registration rejected']);
    }

    // POST /api/staff/approve-bulk — approve several (or all) pending registrations at once,
    // generating each one's printable card the same way the single approve() does.
    public function bulkApprove(Request $request)
    {
        $userIds = $request->input('userIds', []);

        if (! is_array($userIds) || empty($userIds)) {
            return response()->json(['success' => false, 'message' => 'userIds is required'], 400);
        }

        $approved = [];
        $failed = [];

        foreach ($userIds as $userId) {
            $user = DB::table('id_card_users as u')
                ->leftJoin('excel_data as ed', 'u.excel_data_id', '=', 'ed.id')
                ->select('u.*', 'ed.card_number', 'ed.session')
                ->where('u.id', $userId)
                ->first();

            if (! $user) {
                $failed[] = ['userId' => $userId, 'reason' => 'User not found'];

                continue;
            }

            $idCardBuffer = null;
            try {
                $idCardBuffer = $this->cardGenerator->generatePng($user, false);
            } catch (\Throwable $e) {
                report($e);
                // proceed — still mark approved but without image, matching the single approve()
            }

            $update = ['status' => 'approved', 'approved_at' => now()];
            if ($idCardBuffer) {
                $update['id_card_image'] = $idCardBuffer;
            }

            DB::table('id_card_users')->where('id', $userId)->update($update);
            $approved[] = $userId;
        }

        $message = count($approved).' registration(s) approved';
        if (! empty($failed)) {
            $message .= ', '.count($failed).' failed';
        }

        return response()->json([
            'success' => true,
            'message' => $message,
            'approved' => $approved,
            'failed' => $failed,
        ]);
    }

    // POST /api/staff/reset-candidate  (requires auth.jwt:admin,staff)
    public function resetCandidate(Request $request)
    {
        $userId = $request->input('userId');
        $identifier = $request->input('identifier');

        if (! $userId && ! $identifier) {
            return response()->json(['success' => false, 'message' => 'Provide userId or identifier'], 400);
        }

        $query = DB::table('id_card_users')->select('id', 'surname', 'other_names', 'matric_no', 'staff_id', 'status');

        if ($userId) {
            $candidate = $query->where('id', $userId)->orderByDesc('created_at')->first();
        } else {
            $candidate = $query->where(function ($q) use ($identifier) {
                $q->where('matric_no', $identifier)->orWhere('staff_id', $identifier);
            })->orderByDesc('created_at')->first();
        }

        if (! $candidate) {
            return response()->json(['success' => false, 'message' => 'Candidate not found'], 404);
        }

        // fingerprints/staff_notifications cascade via FK on delete.
        DB::table('id_card_users')->where('id', $candidate->id)->delete();

        return response()->json([
            'success' => true,
            'message' => 'Candidate reset successfully. They can login and recapture.',
            'candidate' => [
                'id' => $candidate->id,
                'name' => trim(($candidate->surname ?? '').' '.($candidate->other_names ?? '')),
                'identifier' => $candidate->matric_no ?: $candidate->staff_id,
                'previousStatus' => $candidate->status,
            ],
        ]);
    }

    // GET /api/staff/approved-today
    public function approvedToday()
    {
        $count = DB::table('id_card_users')
            ->where('status', 'approved')
            ->whereDate('approved_at', now()->toDateString())
            ->count();

        return response()->json(['success' => true, 'count' => $count]);
    }
}

<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\IdCardGeneratorService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Converted from the "INTEGRATION ROUTES FOR MANAGEMENT SYSTEM" section of
 * routes/api.js. These are the endpoints the id-card-unit management app's
 * CaptureAppService calls (queue, approved, mark-printed, mark-collected,
 * output-svg, output-image, fingerprint) — paths and payload shapes are
 * kept byte-for-byte compatible with the original.
 */
class PrintingController extends Controller
{
    public function __construct(private IdCardGeneratorService $cardGenerator) {}

    private function baseIdentifierWhere($query, string $cardId)
    {
        return $query->where(function ($q) use ($cardId) {
            $q->where('u.id', $cardId)
                ->orWhere('u.excel_data_id', $cardId)
                ->orWhere('ed.card_number', $cardId);
        })->whereIn('u.status', ['approved', 'printed', 'collected']);
    }

    // GET /api/printing/data/{userId}
    public function data(string $userId)
    {
        $user = DB::table('id_card_users as u')
            ->leftJoin('excel_data as ed', 'u.excel_data_id', '=', 'ed.id')
            ->select('u.id', 'u.surname', 'u.other_names', 'u.matric_no', 'u.staff_id', 'u.department', 'u.faculty', 'u.level', 'u.marital_status', 'u.birth_date', 'u.hall', 'u.passport_photo', 'u.signature', 'ed.card_number', 'ed.session')
            ->where('u.id', $userId)
            ->orWhere('u.excel_data_id', $userId)
            ->orderByDesc('u.created_at')
            ->limit(1)
            ->first();

        if (! $user) {
            return response()->json(['success' => false, 'message' => 'User not found'], 404);
        }

        $data = (array) $user;
        $data['passport_photo'] = $user->passport_photo ? base64_encode($user->passport_photo) : null;
        $data['signature'] = $user->signature ? base64_encode($user->signature) : null;

        return response()->json(['success' => true, 'data' => $data]);
    }

    // GET /api/printing/queue
    public function queue()
    {
        $cards = DB::table('id_card_users')
            ->select('id', 'surname', 'other_names', 'matric_no', 'approved_at')
            ->where('status', 'approved')
            ->orderByDesc('approved_at')
            ->get();

        return response()->json(['success' => true, 'cards' => $cards]);
    }

    // GET /api/printing/approved
    public function approved()
    {
        $cards = DB::table('id_card_users as u')
            ->leftJoin('excel_data as ed', 'u.excel_data_id', '=', 'ed.id')
            ->select('u.id', 'u.surname', 'u.other_names', 'u.matric_no', 'u.staff_id', 'u.department', 'u.faculty', 'u.level', 'u.marital_status', 'u.birth_date', 'u.hall', 'u.passport_photo', 'u.signature', 'u.status', 'ed.card_number', 'ed.session')
            ->where('u.status', 'approved')
            ->orderByDesc('u.approved_at')
            ->get()
            ->map(function ($row) {
                $row->passport_photo = $row->passport_photo ? base64_encode($row->passport_photo) : null;
                $row->signature = $row->signature ? base64_encode($row->signature) : null;

                return $row;
            });

        return response()->json(['success' => true, 'cards' => $cards]);
    }

    // POST /api/printing/mark-printed/{userId}
    public function markPrinted(int $userId)
    {
        DB::table('id_card_users')->where('id', $userId)->update(['status' => 'printed', 'printed_at' => now()]);

        return response()->json(['success' => true, 'message' => 'Card marked as printed']);
    }

    // POST /api/printing/mark-collected/{userId}
    public function markCollected(int $userId)
    {
        DB::table('id_card_users')->where('id', $userId)->update(['status' => 'collected', 'collected_at' => now()]);

        return response()->json(['success' => true, 'message' => 'Card marked as collected']);
    }

    // GET /api/printing/output
    public function output(Request $request)
    {
        $baseUrl = rtrim($request->getSchemeAndHttpHost(), '/');

        $rows = DB::table('id_card_users as u')
            ->leftJoin('excel_data as ed', 'u.excel_data_id', '=', 'ed.id')
            ->select('u.id', 'u.status', 'u.approved_at', 'u.printed_at', 'u.collected_at', 'u.surname', 'u.other_names', 'ed.card_number', DB::raw('CASE WHEN u.id_card_image IS NOT NULL THEN 1 ELSE 0 END AS has_image'))
            ->whereIn('u.status', ['approved', 'printed', 'collected'])
            ->orderByRaw('u.approved_at IS NULL, u.approved_at DESC')
            ->orderByDesc('u.id')
            ->get();

        $files = $rows->map(function ($row) use ($baseUrl) {
            return [
                'id' => $row->id,
                'fileName' => "{$row->id}.png",
                'cardNumber' => $row->card_number,
                'status' => $row->status,
                'hasImage' => (bool) $row->has_image,
                'approvedAt' => $row->approved_at,
                'printedAt' => $row->printed_at,
                'collectedAt' => $row->collected_at,
                'fullName' => trim(($row->surname ?? '').' '.($row->other_names ?? '')),
                'url' => "{$baseUrl}/api/printing/output-svg?cardId={$row->id}",
                'svgUrl' => "{$baseUrl}/api/printing/output-svg?cardId={$row->id}",
                'pngUrl' => "{$baseUrl}/api/printing/output-image?cardId={$row->id}",
            ];
        });

        return response()->json(['success' => true, 'files' => $files, 'count' => $files->count()]);
    }

    // GET /api/printing/output-svg?cardId=
    public function outputSvg(Request $request)
    {
        $cardId = $request->query('cardId');
        if (! $cardId) {
            return response()->json(['success' => false, 'message' => 'cardId is required'], 400);
        }

        $row = $this->baseIdentifierWhere(
            DB::table('id_card_users as u')
                ->leftJoin('excel_data as ed', 'u.excel_data_id', '=', 'ed.id')
                ->select('u.id', 'u.surname', 'u.other_names', 'u.matric_no', 'u.staff_id', 'u.department', 'u.faculty', 'u.level', 'u.marital_status', 'u.birth_date', 'u.hall', 'u.passport_photo', 'u.signature', 'ed.card_number', 'ed.session'),
            (string) $cardId
        )->orderByRaw('u.approved_at IS NULL, u.approved_at DESC')->orderByDesc('u.id')->first();

        if (! $row) {
            return response()->json(['success' => false, 'message' => "Printable output for card {$cardId} not found"], 404);
        }

        $svg = $this->cardGenerator->generateSvg($row, false);

        return response($svg, 200)->header('Content-Type', 'image/svg+xml; charset=utf-8');
    }

    // GET /api/printing/output-image?cardId=
    public function outputImage(Request $request)
    {
        $cardId = $request->query('cardId');
        if (! $cardId) {
            return response()->json(['success' => false, 'message' => 'cardId is required'], 400);
        }

        $row = $this->baseIdentifierWhere(
            DB::table('id_card_users as u')
                ->leftJoin('excel_data as ed', 'u.excel_data_id', '=', 'ed.id')
                ->select('u.id', 'u.id_card_image'),
            (string) $cardId
        )->orderByRaw('u.approved_at IS NULL, u.approved_at DESC')->orderByDesc('u.id')->first();

        if (! $row) {
            return response()->json(['success' => false, 'message' => "Printable output for card {$cardId} not found"], 404);
        }

        if (! $row->id_card_image) {
            return response()->json(['success' => false, 'message' => "Printable PNG for card {$cardId} is not ready yet"], 404);
        }

        return response($row->id_card_image, 200)->header('Content-Type', 'image/png');
    }

    // GET /api/printing/output/{cardId}
    public function outputByCardId(string $cardId)
    {
        $row = $this->baseIdentifierWhere(
            DB::table('id_card_users as u')
                ->leftJoin('excel_data as ed', 'u.excel_data_id', '=', 'ed.id')
                ->select('u.id_card_image'),
            $cardId
        )->orderByRaw('u.approved_at IS NULL, u.approved_at DESC')->orderByDesc('u.id')->first();

        if (! $row || ! $row->id_card_image) {
            return response()->json(['success' => false, 'message' => "Printable output for card {$cardId} not found"], 404);
        }

        return response($row->id_card_image, 200)->header('Content-Type', 'image/png');
    }

    // GET /api/printing/fingerprint?cardId=
    public function fingerprint(Request $request)
    {
        $cardId = $request->query('cardId');
        if (! $cardId) {
            return response()->json(['success' => false, 'message' => 'cardId is required'], 400);
        }

        $row = $this->baseIdentifierWhere(
            DB::table('fingerprints as f')
                ->join('id_card_users as u', 'f.user_id', '=', 'u.id')
                ->leftJoin('excel_data as ed', 'u.excel_data_id', '=', 'ed.id')
                ->select('f.left_thumb', 'f.left_index', 'f.right_thumb', 'f.right_index', 'f.user_id', 'u.id', 'u.surname', 'u.other_names', 'u.matric_no', 'u.staff_id', 'u.status'),
            (string) $cardId
        )->orderByRaw('u.approved_at IS NULL, u.approved_at DESC')->orderByDesc('u.id')->first();

        if (! $row) {
            return response()->json(['success' => false, 'message' => "Fingerprint for card {$cardId} not found or card not in printable status"], 404);
        }

        return response()->json([
            'success' => true,
            'cardId' => $row->id,
            'surname' => $row->surname,
            'other_names' => $row->other_names,
            'matric_no' => $row->matric_no,
            'staff_id' => $row->staff_id,
            'status' => $row->status,
            'fingerprints' => [
                'left_thumb' => $row->left_thumb,
                'left_index' => $row->left_index,
                'right_thumb' => $row->right_thumb,
                'right_index' => $row->right_index,
            ],
        ]);
    }
}

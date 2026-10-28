<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\IdCardGeneratorService;
use Illuminate\Support\Facades\DB;

/**
 * Converted from the /idcard/* routes in routes/api.js.
 */
class IdCardController extends Controller
{
    public function __construct(private IdCardGeneratorService $cardGenerator) {}

    // GET /api/idcard/{userId}
    public function show(int $userId)
    {
        $row = DB::table('id_card_users')->where('id', $userId)->first(['id_card_image']);

        if ($row && $row->id_card_image) {
            return response($row->id_card_image, 200)->header('Content-Type', 'image/png');
        }

        return response('ID card not found', 404);
    }

    // GET /api/idcard/preview/{userId}  (WITH background)
    public function preview(int $userId)
    {
        return $this->renderPreview($userId, true);
    }

    // GET /api/idcard/preview-print/{userId}  (WITHOUT background)
    public function previewPrint(int $userId)
    {
        return $this->renderPreview($userId, false);
    }

    private function renderPreview(int $userId, bool $includeBackground)
    {
        $user = DB::table('id_card_users as u')
            ->leftJoin('excel_data as ed', 'u.excel_data_id', '=', 'ed.id')
            ->select('u.*', 'ed.card_number', 'ed.session')
            ->where('u.id', $userId)
            ->first();

        if (! $user) {
            return response('User not found', 404);
        }

        try {
            $png = $this->cardGenerator->generatePng($user, $includeBackground);

            return response($png, 200)->header('Content-Type', 'image/png');
        } catch (\Throwable $e) {
            report($e);

            return response('Error generating ID card preview', 500);
        }
    }
}

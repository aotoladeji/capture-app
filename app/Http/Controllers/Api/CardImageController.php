<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Support\Facades\DB;

/**
 * Converted from GET /card-images/:cardId/image in routes/api.js — matches
 * the endpoint the id-card-unit management app's frontend/backend expect.
 */
class CardImageController extends Controller
{
    // GET /api/card-images/{cardId}/image
    public function image(string $cardId)
    {
        $row = DB::table('id_card_users as u')
            ->leftJoin('excel_data as ed', 'u.excel_data_id', '=', 'ed.id')
            ->select('u.id', 'u.status', 'u.id_card_image')
            ->where(function ($q) use ($cardId) {
                $q->where('u.id', $cardId)->orWhere('u.excel_data_id', $cardId)->orWhere('ed.card_number', $cardId);
            })
            ->whereIn('u.status', ['approved', 'printed', 'collected'])
            ->orderByRaw('u.approved_at IS NULL, u.approved_at DESC')
            ->orderByDesc('u.id')
            ->first();

        if (! $row) {
            return response()->json([
                'success' => false,
                'message' => "Card with ID {$cardId} not found in capture app. It may not be approved/printable yet.",
            ], 404);
        }

        if (! $row->id_card_image) {
            return response()->json([
                'success' => false,
                'message' => 'Card image not found. The capture app may not have generated this card yet.',
            ], 404);
        }

        return response($row->id_card_image, 200)->header('Content-Type', 'image/png');
    }
}

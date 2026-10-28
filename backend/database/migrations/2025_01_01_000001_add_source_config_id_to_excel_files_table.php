<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('excel_files', function (Blueprint $table) {
            // Links an imported batch back to the management app's `scheduling_config`
            // row it was imported from, when the data came from "scheduling setup"
            // instead of a manual admin upload. Null for manual uploads.
            $table->unsignedBigInteger('source_config_id')->nullable()->after('file_path');
        });
    }

    public function down(): void
    {
        Schema::table('excel_files', function (Blueprint $table) {
            $table->dropColumn('source_config_id');
        });
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('excel_data', function (Blueprint $table) {
            $table->id();
            $table->foreignId('file_id')->constrained('excel_files')->cascadeOnDelete();
            $table->string('surname', 100)->nullable();
            $table->text('other_names')->nullable();
            $table->string('matric_no', 100)->nullable();
            $table->string('pf_number', 100)->nullable();
            $table->string('jamb_reg_no', 100)->nullable();
            $table->string('pg_number', 100)->nullable();
            $table->text('birth_date')->nullable();
            $table->text('department')->nullable();
            $table->text('faculty')->nullable();
            $table->text('level')->nullable();
            $table->text('marital_status')->nullable();
            $table->text('hall')->nullable();
            $table->text('session')->nullable();
            $table->text('card_number')->nullable();
            $table->json('raw_data')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['surname', 'matric_no', 'pf_number', 'jamb_reg_no', 'pg_number'], 'idx_excel_data_lookup');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('excel_data');
    }
};

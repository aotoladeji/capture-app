<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('id_card_users', function (Blueprint $table) {
            $table->id();
            $table->foreignId('excel_data_id')->nullable()->unique()->constrained('excel_data')->nullOnDelete();
            $table->string('user_type', 20)->nullable();
            $table->string('surname', 100)->nullable();
            $table->text('other_names')->nullable();
            $table->string('matric_no', 100)->nullable();
            $table->string('staff_id', 100)->nullable();
            $table->text('jamb_reg_no')->nullable();
            $table->text('pg_number')->nullable();
            $table->text('birth_date')->nullable();
            $table->text('department')->nullable();
            $table->text('faculty')->nullable();
            $table->text('level')->nullable();
            $table->text('marital_status')->nullable();
            $table->text('hall')->nullable();
            $table->binary('passport_photo')->nullable();
            $table->binary('signature')->nullable();
            $table->binary('id_card_image')->nullable();
            $table->string('status', 50)->default('created');
            $table->timestamp('approved_at')->nullable();
            $table->timestamp('printed_at')->nullable();
            $table->timestamp('collected_at')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index('status', 'idx_id_card_users_status');
            $table->index(['surname', 'matric_no', 'staff_id'], 'idx_id_card_users_lookup');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('id_card_users');
    }
};

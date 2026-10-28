<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('staff_notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('id_card_users')->cascadeOnDelete();
            $table->string('status', 50)->default('pending');
            $table->timestamp('created_at')->useCurrent();

            $table->index(['user_id', 'created_at'], 'idx_staff_notifications_user_created');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('staff_notifications');
    }
};

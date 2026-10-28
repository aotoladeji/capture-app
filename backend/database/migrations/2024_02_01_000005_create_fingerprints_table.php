<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('fingerprints', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained('id_card_users')->cascadeOnDelete();
            $table->text('left_thumb')->nullable();
            $table->text('left_index')->nullable();
            $table->text('right_thumb')->nullable();
            $table->text('right_index')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('fingerprints');
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    public function up(): void
    {
        // `binary()` created plain BLOB columns (64KB max) — passport photos,
        // signatures, and generated card images are all larger than that,
        // causing "Data too long for column" truncation errors on every capture.
        DB::statement('ALTER TABLE id_card_users MODIFY passport_photo LONGBLOB NULL');
        DB::statement('ALTER TABLE id_card_users MODIFY signature LONGBLOB NULL');
        DB::statement('ALTER TABLE id_card_users MODIFY id_card_image LONGBLOB NULL');

        // Same TEXT (64KB) truncation risk applies to fingerprint template columns.
        DB::statement('ALTER TABLE fingerprints MODIFY left_thumb LONGTEXT NULL');
        DB::statement('ALTER TABLE fingerprints MODIFY left_index LONGTEXT NULL');
        DB::statement('ALTER TABLE fingerprints MODIFY right_thumb LONGTEXT NULL');
        DB::statement('ALTER TABLE fingerprints MODIFY right_index LONGTEXT NULL');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE id_card_users MODIFY passport_photo BLOB NULL');
        DB::statement('ALTER TABLE id_card_users MODIFY signature BLOB NULL');
        DB::statement('ALTER TABLE id_card_users MODIFY id_card_image BLOB NULL');

        DB::statement('ALTER TABLE fingerprints MODIFY left_thumb TEXT NULL');
        DB::statement('ALTER TABLE fingerprints MODIFY left_index TEXT NULL');
        DB::statement('ALTER TABLE fingerprints MODIFY right_thumb TEXT NULL');
        DB::statement('ALTER TABLE fingerprints MODIFY right_index TEXT NULL');
    }
};

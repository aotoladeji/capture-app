CREATE TABLE IF NOT EXISTS admins (
	id SERIAL PRIMARY KEY,
	role VARCHAR(50) NOT NULL UNIQUE,
	password_hash TEXT NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS excel_files (
	id SERIAL PRIMARY KEY,
	file_name TEXT NOT NULL,
	file_path TEXT,
	total_records INTEGER NOT NULL DEFAULT 0,
	is_active BOOLEAN NOT NULL DEFAULT TRUE,
	uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS excel_data (
	id SERIAL PRIMARY KEY,
	file_id INTEGER NOT NULL REFERENCES excel_files(id) ON DELETE CASCADE,
	surname TEXT,
	other_names TEXT,
	matric_no TEXT,
	pf_number TEXT,
	jamb_reg_no TEXT,
	pg_number TEXT,
	birth_date TEXT,
	department TEXT,
	faculty TEXT,
	level TEXT,
	marital_status TEXT,
	hall TEXT,
	session TEXT,
	card_number TEXT,
	raw_data JSONB,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS id_card_users (
	id SERIAL PRIMARY KEY,
	excel_data_id INTEGER UNIQUE REFERENCES excel_data(id) ON DELETE SET NULL,
	user_type VARCHAR(20),
	surname TEXT,
	other_names TEXT,
	matric_no TEXT,
	staff_id TEXT,
	jamb_reg_no TEXT,
	pg_number TEXT,
	birth_date TEXT,
	department TEXT,
	faculty TEXT,
	level TEXT,
	marital_status TEXT,
	hall TEXT,
	passport_photo BYTEA,
	signature BYTEA,
	id_card_image BYTEA,
	status VARCHAR(50) NOT NULL DEFAULT 'created',
	approved_at TIMESTAMPTZ,
	printed_at TIMESTAMPTZ,
	collected_at TIMESTAMPTZ,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fingerprints (
	id SERIAL PRIMARY KEY,
	user_id INTEGER NOT NULL UNIQUE REFERENCES id_card_users(id) ON DELETE CASCADE,
	left_thumb TEXT,
	left_index TEXT,
	right_thumb TEXT,
	right_index TEXT,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staff_notifications (
	id SERIAL PRIMARY KEY,
	user_id INTEGER NOT NULL REFERENCES id_card_users(id) ON DELETE CASCADE,
	status VARCHAR(50) NOT NULL DEFAULT 'pending',
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_excel_files_active ON excel_files(is_active);
CREATE INDEX IF NOT EXISTS idx_excel_data_lookup ON excel_data(surname, matric_no, pf_number, jamb_reg_no, pg_number);
CREATE INDEX IF NOT EXISTS idx_id_card_users_status ON id_card_users(status);
CREATE INDEX IF NOT EXISTS idx_id_card_users_lookup ON id_card_users(surname, matric_no, staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_notifications_user_created ON staff_notifications(user_id, created_at DESC);

INSERT INTO admins (role, password_hash)
VALUES
	('admin', '$2a$10$Qpl1sI/spBgfg.qvFV2WZeUAtyN1Tnsyq/g4RWPVzAMVuQxu8tCNe'),
	('staff', '$2a$10$Qpl1sI/spBgfg.qvFV2WZeUAtyN1Tnsyq/g4RWPVzAMVuQxu8tCNe')
ON CONFLICT (role) DO NOTHING;

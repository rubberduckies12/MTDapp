-- USERS TABLE
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    first_name TEXT,
    last_name TEXT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- UPLOADS TABLE
CREATE TABLE uploads (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    file_path TEXT,
    original_filename TEXT,
    file_type TEXT CHECK (file_type IN ('csv', 'xlsx')),
    file_size_bytes INTEGER,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_uploads_user_id ON uploads(user_id);

-- TRANSACTIONS TABLE
CREATE TABLE transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    upload_id INTEGER REFERENCES uploads(id) ON DELETE SET NULL,
    type TEXT CHECK (type IN ('income', 'expense')),
    category TEXT,
    hmrc_category TEXT,
    description TEXT,
    amount NUMERIC(10,2),
    transaction_date DATE,
    verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_upload_id ON transactions(upload_id);

-- REPORTS TABLE
CREATE TABLE reports (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    period_start DATE,
    period_end DATE,
    summary JSONB,
    status TEXT CHECK (status IN ('draft', 'submitted', 'accepted', 'rejected')),
    hmrc_obligation_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_reports_user_id ON reports(user_id);

-- SUBMISSIONS TABLE
CREATE TABLE submissions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    report_id INTEGER REFERENCES reports(id) ON DELETE CASCADE,
    hmrc_reference TEXT,
    status TEXT CHECK (status IN ('pending', 'accepted', 'rejected', 'error')),
    submitted_at TIMESTAMP WITH TIME ZONE,
    response JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_submissions_user_id ON submissions(user_id);
CREATE INDEX idx_submissions_report_id ON submissions(report_id);

-- HMRC TOKENS TABLE
CREATE TABLE hmrc_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    access_token TEXT,
    refresh_token TEXT,
    scope TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_hmrc_tokens_user_id ON hmrc_tokens(user_id);
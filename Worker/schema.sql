-- One row per logged day. data = JSON object of column -> string (see COLS in
-- worker.js). A new field is a COLS edit, never a change here.
CREATE TABLE IF NOT EXISTS days (
  date TEXT PRIMARY KEY CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  data TEXT NOT NULL CHECK (json_valid(data) AND json_type(data) = 'object')
);

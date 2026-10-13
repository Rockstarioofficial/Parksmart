CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(40) NOT NULL UNIQUE,
  pass_hash VARCHAR(200) NOT NULL,
  role ENUM('admin','attendant') NOT NULL DEFAULT 'attendant',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS slots (
  id VARCHAR(8) PRIMARY KEY,
  type ENUM('bike','car','truck') NOT NULL,
  seq INT NOT NULL
);
CREATE TABLE IF NOT EXISTS tickets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  plate VARCHAR(14) NOT NULL,
  type ENUM('bike','car','truck') NOT NULL,
  slot_id VARCHAR(8) NOT NULL,
  in_time DATETIME(3) NOT NULL,
  out_time DATETIME(3) NULL,
  fee DECIMAL(10,2) NOT NULL DEFAULT 0,
  active_plate VARCHAR(14) NULL,
  active_slot VARCHAR(8) NULL,
  checked_in_by VARCHAR(40),
  checked_out_by VARCHAR(40),
  UNIQUE KEY uq_active_plate (active_plate),
  UNIQUE KEY uq_active_slot (active_slot),
  KEY idx_in (in_time),
  KEY idx_out (out_time),
  KEY idx_plate (plate),
  FOREIGN KEY (slot_id) REFERENCES slots(id)
) AUTO_INCREMENT=1001;
CREATE TABLE IF NOT EXISTS watchlist (
  plate VARCHAR(14) PRIMARY KEY,
  reason VARCHAR(120),
  added_by VARCHAR(40),
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
  username VARCHAR(40),
  action VARCHAR(30),
  detail VARCHAR(200)
);

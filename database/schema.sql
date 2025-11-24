CREATE DATABASE IF NOT EXISTS container_automation;
USE container_automation;

CREATE TABLE IF NOT EXISTS services (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  default_port INT,
  default_cpu VARCHAR(10),
  default_memory VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS containers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  container_id VARCHAR(100) UNIQUE,
  container_identifier VARCHAR(150) UNIQUE NOT NULL,
  instance_name VARCHAR(100) NOT NULL,
  service_name VARCHAR(50) NOT NULL,
  subdomain VARCHAR(150) UNIQUE NOT NULL,
  port INT UNIQUE NOT NULL,
  status ENUM('running', 'stopped', 'deleted') DEFAULT 'stopped',
  cpu_limit VARCHAR(10),
  memory_limit VARCHAR(20),
  data_path VARCHAR(255),
  fastpanel_site_id VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (service_name) REFERENCES services(name) ON DELETE CASCADE,
  INDEX idx_instance_name (instance_name),
  INDEX idx_container_identifier (container_identifier),
  INDEX idx_service (service_name),
  INDEX idx_status (status)
);

CREATE TABLE IF NOT EXISTS port_assignments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  port INT UNIQUE NOT NULL,
  container_id INT,
  is_available BOOLEAN DEFAULT TRUE,
  FOREIGN KEY (container_id) REFERENCES containers(id) ON DELETE SET NULL
);

-- Insert default services
INSERT INTO services (name, description, default_port, default_cpu, default_memory) VALUES
('n8n', 'Workflow automation platform', 5678, '2', '1024M'),
('gowa', 'GOWA service', 8080, '1', '512M')
ON DUPLICATE KEY UPDATE name=name;

-- Initialize port pool (14000-14999)
INSERT INTO port_assignments (port, is_available)
SELECT n, TRUE
FROM (
  SELECT 14000 + (a.N + b.N * 10 + c.N * 100) AS n
  FROM 
    (SELECT 0 AS N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) a,
    (SELECT 0 AS N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) b,
    (SELECT 0 AS N UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9) c
) numbers
WHERE n <= 14999
ON DUPLICATE KEY UPDATE port=port;

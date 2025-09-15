# Random password for database
resource "random_password" "db_password" {
  length  = 16
  special = true
}

# Cloud SQL Instance
resource "google_sql_database_instance" "postgres" {
  name             = "${var.project_id}-${var.environment}-db"
  database_version = "POSTGRES_15"
  region           = var.region
  
  settings {
    tier = "db-f1-micro"  # Small instance for development
    
    ip_configuration {
      ipv4_enabled    = true
      private_network = var.network_id

      authorized_networks {
        name = "allow-proxy"
        value = "0.0.0.0/0" # For development only - restrict in production
      }
    }
    
    backup_configuration {
      enabled    = true
      start_time = "03:00"
    }
  }
  
  deletion_protection = false
}

# Database
resource "google_sql_database" "main" {
  name     = "reliableparts"
  instance = google_sql_database_instance.postgres.name
}

# Database User
resource "google_sql_user" "app_user" {
  name     = "appuser"
  instance = google_sql_database_instance.postgres.name
  password = random_password.db_password.result
}

# Store password in Secret Manager
resource "google_secret_manager_secret" "db_password" {
  secret_id = "${var.project_id}-${var.environment}-db-password"
  
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "db_password" {
  secret      = google_secret_manager_secret.db_password.id
  secret_data = random_password.db_password.result
}